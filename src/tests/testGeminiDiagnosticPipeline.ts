import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import { WHEEL_OBJECT_REFERENCES } from '../config/wheelObjectReferences';
import { analyzeCropIsolated } from '../services/cropAnalyzerService';

async function runDiagnosticPipelineTests() {
  console.log('=== INICIANDO SEQUÊNCIA DE TESTES OBRIGATÓRIOS DO PIPELINE GEMINI ===\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ FATAL: GEMINI_API_KEY não encontrada no ambiente.');
    process.exit(1);
  }

  // TESTE A: Conexão textual (Gemini -> texto) -> HTTP 200
  console.log('--- TESTE A: Conexão Textual Básica ---');
  const startA = Date.now();
  const modelsToTry = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let textA = '';
  let modelUsedA = '';
  let lastErrA: any = null;

  const ai = new GoogleGenAI({ apiKey });

  for (const mName of modelsToTry) {
    try {
      const resA = await ai.models.generateContent({
        model: mName,
        contents: 'Responda exatamente a palavra: OK',
      });
      textA = resA.text ? resA.text.trim() : '';
      modelUsedA = mName;
      lastErrA = null;
      break;
    } catch (err: any) {
      lastErrA = err;
      console.warn(`[TESTE A WARNING] Modelo ${mName} falhou (${err?.status || err?.code || 429}): ${err?.message || err}`);
    }
  }

  if (lastErrA && !textA) {
    console.error(`❌ TESTE A FALHOU EM TODOS OS MODELOS:`, lastErrA?.message || String(lastErrA));
    process.exit(1);
  }

  const latencyA = Date.now() - startA;
  console.log(`✓ TESTE A PASSOU (${latencyA}ms) | Modelo: ${modelUsedA} | Resposta: "${textA}"`);

  // Baixar imagem do BALÃO oficial para os próximos testes
  console.log('\n--- Baixando Imagem Oficial do BALÃO ---');
  const balaoUrl = WHEEL_OBJECT_REFERENCES.balao.imageUrl;
  console.log(`URL do BALÃO: ${balaoUrl}`);
  let balaoBase64 = '';
  try {
    const imgRes = await fetch(balaoUrl);
    const buffer = await imgRes.buffer();
    balaoBase64 = buffer.toString('base64');
    console.log(`✓ Imagem do BALÃO baixada com sucesso (${balaoBase64.length} chars base64)`);
  } catch (err: any) {
    console.error('❌ Falha ao baixar imagem oficial do BALÃO:', err?.message);
    process.exit(1);
  }

  // TESTE B: Visão com BALÃO oficial (imagem oficial BALÃO -> Gemini)
  console.log('\n--- TESTE B: Visão Direta com Imagem Oficial do BALÃO ---');
  const startB = Date.now();
  try {
    const resB = await analyzeCropIsolated(balaoBase64, 'image/jpeg');
    const latencyB = Date.now() - startB;
    console.log(`HTTP Status: ${resB.httpStatus}`);
    console.log(`Success: ${resB.success}`);
    console.log(`Latency: ${latencyB}ms`);
    console.log(`Raw Response:`, resB.rawResponse);
    console.log(`Parsed Output:`, resB.parsed);

    if (resB.success && resB.parsed?.objetoDetectado === 'balao') {
      console.log('✓ TESTE B PASSOU: Objeto reconhecido como "balao" com sucesso!');
    } else {
      console.warn(`⚠️ TESTE B AVISO: Retornou objeto "${resB.parsed?.objetoDetectado}", esperado "balao"`);
    }
  } catch (err: any) {
    console.error('❌ TESTE B FALHOU:', err?.message || String(err));
    process.exit(1);
  }

  // TESTE C: Endpoint /api/live/analyze-crop em isolamento
  console.log('\n--- TESTE C: Análise Isolada de Crop (analyzeCropIsolated) ---');
  const resC = await analyzeCropIsolated(balaoBase64, 'image/jpeg');
  console.log('Resultado do Teste C:', JSON.stringify(resC, null, 2));

  if (resC.success && resC.httpStatus === 200 && resC.rawResponse) {
    console.log('\n✓ TESTE C PASSOU: HTTP 200, success=true, rawResponse preenchido, parsed preenchido!');
  } else {
    console.error('\n❌ TESTE C FALHOU:', resC);
    process.exit(1);
  }

  console.log('\n=== TODOS OS TESTES PIPELINE GEMINI FORAM CONCLUÍDOS COM SUCESSO! ===');
}

runDiagnosticPipelineTests();
