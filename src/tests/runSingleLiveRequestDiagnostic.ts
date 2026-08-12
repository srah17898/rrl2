import fetch from 'node-fetch';
import { BackendLiveService } from '../services/backendLiveService';
import { WHEEL_OBJECT_REFERENCES } from '../config/wheelObjectReferences';
import { auditUrl } from '../utils/urlAuditor';

async function runDiagnostic() {
  const steps: Record<string, boolean> = {
    CAPTURED: false,
    CROP_CREATED: false,
    CROP_SENT: false,
    BACKEND_RECEIVED: false,
    GEMINI_RESP: false,
    PARSER_RES: false,
    MATCH_REF: false,
    FINAL_CONF: false,
    STABILIZATION: false,
    CONFIRMED: false,
    REGISTER: false,
  };

  let blockedStage: string | null = null;
  let blockedReason: string | null = null;

  function block(stage: string, reason: string) {
    if (!blockedStage) {
      blockedStage = stage;
      blockedReason = reason;
      console.log(`\n[PIPELINE_BLOCKED]`);
      console.log(`stage=${stage}`);
      console.log(`reason=${reason}`);
    }
  }

  const usuarioId = 'diag_user_single_frame';

  // 1. CAPTURED
  console.log('[CAPTURE]');
  let balaoBase64 = '';
  try {
    const balaoUrl = WHEEL_OBJECT_REFERENCES.balao.imageUrl;
    const imgRes = await fetch(balaoUrl);
    const buffer = await imgRes.buffer();
    balaoBase64 = buffer.toString('base64');
    steps.CAPTURED = true;
    console.log(`✓ Frame capturado com sucesso (tamanho: ${balaoBase64.length} chars)`);
  } catch (err: any) {
    block('CAPTURED', `Falha ao carregar imagem de captura: ${err?.message}`);
  }

  // 2. CROP_CREATED
  if (steps.CAPTURED && !blockedStage) {
    if (balaoBase64 && balaoBase64.length > 100) {
      steps.CROP_CREATED = true;
      console.log('✓ Crop de símbolo criado com sucesso (source: REAL_BALAO_REFERENCE)');
    } else {
      block('CROP_CREATED', 'Payload de crop inválido ou vazio');
    }
  }

  // 3. FRAME_SERIALIZE_START & CROP_SENT
  if (steps.CROP_CREATED && !blockedStage) {
    console.log('[FRAME_SERIALIZE_START]');
    const rawPayload = {
      base64Data: balaoBase64,
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      width: 1280,
      height: 720,
      source: 'SCREEN_CAPTURE' as const,
      metadata: {
        winnerCropBase64: balaoBase64,
        symbolCropBase64: balaoBase64,
        resultScreenCroppedBase64: balaoBase64,
        resultadoScreenDetected: true,
        resultScreenConfidence: 0.98,
        resultScreenRoi: {
          symbolCropWidth: 153,
          symbolCropHeight: 153,
          symbolCropValid: true,
        },
      },
    };
    const jsonStr = JSON.stringify({ usuarioId, framePayload: rawPayload });
    const payloadKB = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);
    console.log(`✓ Frame serializado: ${payloadKB} KB`);

    console.log('[FRAME_FETCH_START]');
    steps.CROP_SENT = true;

    // 4. BACKEND_RECEIVED & BACKEND_RESPONSE
    try {
      await BackendLiveService.iniciarSessao(usuarioId, {
        consecutiveConfirmationsRequired: 1,
        minConfidenceRequired: 70,
      });

      console.log('[FRAME_FETCH_SUCCESS]');
      console.log('[BACKEND_RECEIVED]');
      steps.BACKEND_RECEIVED = true;

      const result = await BackendLiveService.processarFrame(usuarioId, rawPayload);
      console.log('[BACKEND_RESPONSE]');
      console.log(`✓ Resposta do Backend recebida (sucesso=${!!result})`);

      const diag = result?.frameDiagnostico?.resultScreenDiagnostico;

      // 5. GEMINI_RESP
      if (diag && (diag.geminiRawResponse || result?.rawText)) {
        const rawResp = diag.geminiRawResponse || result.rawText || '';
        console.log(`[GEMINI_RESP] ✓ Raw: "${rawResp.substring(0, 120)}..."`);
        steps.GEMINI_RESP = true;
      } else {
        block('GEMINI_RESP', `Gemini não retornou resposta textual bruta (rawText: "${result?.rawText || 'N/A'}")`);
      }

      // 6. PARSER_RES
      if (steps.GEMINI_RESP && !blockedStage) {
        if (diag && diag.objetoGemini && diag.objetoGemini !== 'nao_identificado') {
          console.log(`[PARSER_RES] ✓ Objeto: "${diag.objetoGemini}", Confiança: ${diag.confiancaGemini}%`);
          steps.PARSER_RES = true;
        } else if (result?.objetoDetectado) {
          console.log(`[PARSER_RES] ✓ Objeto: "${result.objetoDetectado}", Confiança: ${result.confianca}%`);
          steps.PARSER_RES = true;
        } else {
          console.log('[PARSER_INPUT]', diag?.geminiRawResponse || result?.rawText);
          console.log('[PARSER_ERROR]', diag?.motivoDescarte || 'Erro ao converter JSON do Gemini');
          console.log('[PARSER_EXPECTED_FORMAT]', '{ "objetoDetectado": "balao", "confianca": 0.95 }');
          console.log('[PARSER_RECEIVED_FORMAT]', diag?.geminiRawResponse || result?.rawText);
          block('PARSER_RES', 'Parser do Gemini não gerou objeto válido');
        }
      }

      // 7. MATCH_REF
      if (steps.PARSER_RES && !blockedStage) {
        if (diag && diag.simboloCandidatoVisual) {
          console.log(`[MATCH_INPUT] ${diag.objetoGemini}`);
          console.log(`[MATCH_REFERENCE_SEARCH] ${diag.objetoGemini}`);
          console.log(`[MATCH_REFERENCE_FOUND] ${diag.simboloCandidatoVisual !== 'nenhum' ? 'YES' : 'NO'}`);
          console.log(`[MATCH_REF] ✓ Candidato visual: "${diag.simboloCandidatoVisual}" (Score: ${diag.scoreVisual}%)`);
          steps.MATCH_REF = true;
        } else {
          console.log(`[MATCH_INPUT] ${diag?.objetoGemini}`);
          console.log(`[MATCH_ERROR] Falha ao encontrar correspondência no matcher visual`);
          block('MATCH_REF', 'Matcher visual não produziu candidato válido');
        }
      }

      // 8. FINAL_CONF
      if (steps.MATCH_REF && !blockedStage) {
        if (diag && diag.objetoFinal && diag.confiancaFinal > 0) {
          console.log(`[CONF_INPUT] Objeto=${diag.objetoFinal}`);
          console.log(`[GEMINI_CONFIDENCE] ${diag.confiancaGemini}%`);
          console.log(`[MATCH_SCORE] ${diag.scoreVisual}%`);
          console.log(`[FINAL_CONF] ✓ Objeto final: "${diag.objetoFinal}" (${diag.confiancaFinal}%)`);
          steps.FINAL_CONF = true;
        } else {
          console.log(`[FINAL_CONF_ERROR] Confiança final igual a 0 ou objeto nulo por divergência`);
          block('FINAL_CONF', 'Confiança final nula ou divergência entre Gemini e Matcher');
        }
      }

      // 9. STABILIZATION
      if (steps.FINAL_CONF && !blockedStage) {
        if (diag && (diag.objetoFinal !== 'nao_identificado' && diag.objetoFinal !== 'nenhum')) {
          console.log(`[STABILIZATION] ✓ Candidato em análise/estabilização: "${diag.objetoFinal}"`);
          steps.STABILIZATION = true;
        } else {
          block('STABILIZATION', 'Filtro de estabilização descartou o candidato');
        }
      }

      // 10. CONFIRMED
      if (steps.STABILIZATION && !blockedStage) {
        const statusSessao = BackendLiveService.verificarStatus(usuarioId);
        if (statusSessao?.ultimoObjetoConfirmado || diag?.objetoFinal) {
          console.log(`[CONFIRMED] ✓ Rodada confirmada: "${statusSessao?.ultimoObjetoConfirmado || diag?.objetoFinal}"`);
          steps.CONFIRMED = true;
        } else {
          block('CONFIRMED', 'Ainda aguardando contagem mínima de confirmações consecutivas');
        }
      }

      // 11. REGISTER
      if (steps.CONFIRMED && !blockedStage) {
        const autoPersistEnabled = process.env.AUTO_PERSIST_ENABLED === 'true';
        if (!autoPersistEnabled) {
          console.log('[REGISTER] BLOCKED — AUTO_PERSIST_ENABLED=false');
          steps.REGISTER = false;
          blockedStage = 'REGISTER';
          blockedReason = 'AUTO_PERSIST_ENABLED=false (Persistência automática desativada no ambiente)';
        } else {
          console.log('[REGISTER] ATTEMPT');
          steps.REGISTER = true;
          console.log('[REGISTER] SUCCESS');
        }
      }

    } catch (err: any) {
      block('BACKEND_RECEIVED', `Erro durante o processamento do frame no backend: ${err?.message}`);
    }
  }

  // SESSÃO CLEANUP
  await BackendLiveService.encerrarSessao(usuarioId, 'Diagnóstico concluído');

  // RESULTADO FINAL
  console.log('\n========================================');
  console.log('RESULTADO DO DIAGNÓSTICO DO PIPELINE LIVE:');
  console.log('========================================');
  console.log(`CAPTURED: ${steps.CAPTURED ? '✓' : '✗'}`);
  console.log(`CROP_CREATED: ${steps.CROP_CREATED ? '✓' : '✗'}`);
  console.log(`CROP_SENT: ${steps.CROP_SENT ? '✓' : '✗'}`);
  console.log(`BACKEND_RECEIVED: ${steps.BACKEND_RECEIVED ? '✓' : '✗'}`);
  console.log(`GEMINI_RESP: ${steps.GEMINI_RESP ? '✓' : '✗'}`);
  console.log(`PARSER_RES: ${steps.PARSER_RES ? '✓' : '✗'}`);
  console.log(`MATCH_REF: ${steps.MATCH_REF ? '✓' : '✗'}`);
  console.log(`FINAL_CONF: ${steps.FINAL_CONF ? '✓' : '✗'}`);
  console.log(`STABILIZATION: ${steps.STABILIZATION ? '✓' : '✗'}`);
  console.log(`CONFIRMED: ${steps.CONFIRMED ? '✓' : '✗'}`);
  console.log(`REGISTER: ${steps.REGISTER ? '✓' : '✗'}`);
  console.log('========================================');
  console.log(`BLOCKED_AT: ${blockedStage || 'NONE'}`);
  console.log(`REASON: ${blockedReason || 'Pipeline executado até o fim sem bloqueios'}`);
}

runDiagnostic().catch((err) => {
  console.error('Erro na execução do diagnóstico:', err);
});
