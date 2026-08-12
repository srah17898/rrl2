import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { parseGeminiResponse } from '../services/backendLiveService';

async function runGeminiParserAndStateTestSuite() {
  console.log('========================================================================');
  console.log('BATERIA DE TESTES: PARSER GEMINI & MÁQUINA DE ESTADOS DA TELA DE RESULTADO');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      console.log(`[PASS] ${testName}: ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${detail}`);
      failed++;
    }
  }

  // TESTE A: JSON VÁLIDO COM OBJETO "NENHUM"
  console.log('--- TESTE A: JSON VÁLIDO COM OBJETO "NENHUM" ---');
  {
    const raw = '{"objetoDetectado": "nenhum", "confianca": 0}';
    const parsed = parseGeminiResponse(raw);

    assert(parsed.isJsonValid === true, 'Teste A - JSON Válido', `isJsonValid = ${parsed.isJsonValid}`);
    assert(parsed.geminiEstadoLog === 'GEMINI_NO_OBJECT', 'Teste A - Status GEMINI_NO_OBJECT', `obtido = ${parsed.geminiEstadoLog}`);
    assert(parsed.objetoRaw === null, 'Teste A - Objeto Nulo', `objetoRaw = ${parsed.objetoRaw}`);

    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const res = analyzer.processarDeteccao(parsed.objetoRaw, parsed.confiancaRaw, true, 0.96);

    assert(res.status !== 'confirmado', 'Teste A - Sem Confirmação', `status = ${res.status}`);
    assert(!res.eventId, 'Teste A - Sem Event ID', `eventId = ${res.eventId}`);
  }

  // TESTE B: JSON INVÁLIDO
  console.log('\n--- TESTE B: SINTAXE JSON INVÁLIDA ---');
  {
    const raw = '{ objetoDetectado:';
    const parsed = parseGeminiResponse(raw);

    assert(parsed.isJsonValid === false, 'Teste B - JSON Inválido', `isJsonValid = ${parsed.isJsonValid}`);
    assert(parsed.geminiEstadoLog === 'GEMINI_INVALID_JSON', 'Teste B - Status GEMINI_INVALID_JSON', `obtido = ${parsed.geminiEstadoLog}`);
  }

  // TESTE C: TELA NORMAL (SEM TELA DE RESULTADO) + SÍMBOLO
  console.log('\n--- TESTE C: TELA NORMAL (FORA DE TELA DE RESULTADO) + SÍMBOLO ---');
  {
    const raw = '{"objetoDetectado": "tedy", "confianca": 0.98}';
    const parsed = parseGeminiResponse(raw);

    assert(parsed.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED', 'Teste C - Gemini Detectou Símbolo', `obtido = ${parsed.geminiEstadoLog}`);

    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // Fora de Tela de Resultado (resultadoScreenDetected = false)
    const res = analyzer.processarDeteccao(parsed.objetoRaw, parsed.confiancaRaw, false, 0);

    assert(res.status === 'descartado_fora_de_tela_resultado', 'Teste C - Descartado por Fora da Tela', `status = ${res.status}`);
    assert(res.state === 'RODA_NORMAL' || res.state === 'IDLE' || res.state === 'WAITING_FOR_RESULT', 'Teste C - Estado WAITING_FOR_RESULT / RODA_NORMAL / IDLE', `state = ${res.state}`);
    assert(!res.eventId, 'Teste C - NENHUM Event ID Criado', `eventId = ${res.eventId}`);
  }

  // TESTE D: TELA DE RESULTADO VALIDADA + SÍMBOLO
  console.log('\n--- TESTE D: TELA DE RESULTADO VALIDADA + SÍMBOLO VÁLIDO ---');
  {
    const raw = '{"objetoDetectado": "tedy", "confianca": 0.98}';
    const parsed = parseGeminiResponse(raw);

    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmou = false;
    let createdEventId: string | undefined = undefined;

    // 4 frames na Tela de Resultado para estabilidade (2) + confirmação (3/3)
    for (let f = 1; f <= 5; f++) {
      const res = analyzer.processarDeteccao(parsed.objetoRaw, parsed.confiancaRaw, true, 0.96);
      if (res.status === 'confirmado') {
        confirmou = true;
        createdEventId = res.eventId;
      }
    }

    assert(confirmou === true, 'Teste D - Confirmação do Símbolo', `Confirmou = ${confirmou}`);
    assert(!!createdEventId, 'Teste D - Event ID Criado', `EventId = ${createdEventId}`);
  }

  // TESTE E: TELA DE RESULTADO VALIDADA + OBJETO "NENHUM"
  console.log('\n--- TESTE E: TELA DE RESULTADO VALIDADA + OBJETO NENHUM ---');
  {
    const raw = '{"objetoDetectado": "nenhum", "confianca": 0}';
    const parsed = parseGeminiResponse(raw);

    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // Warm up gate with 2 frames
    analyzer.processarDeteccao(null, 0, true, 0.96);
    const res = analyzer.processarDeteccao(parsed.objetoRaw, parsed.confiancaRaw, true, 0.96);

    assert(res.state === 'LEITURA_RESULTADO' || res.state === 'RECOGNIZING_RESULT', 'Teste E - Janela RECOGNIZING_RESULT Aberta', `state = ${res.state}`);
    assert(res.status === 'em_analise' || res.status === 'descartado_fora_de_tela_resultado', 'Teste E - Aguardando Amostra (Sem Confirmação)', `status = ${res.status}`);
    assert(!res.eventId, 'Teste E - NENHUM Event ID Criado', `eventId = ${res.eventId}`);
  }

  // TESTE F: MARKDOWN CODE FENCES + CONFIRMAÇÃO RÁPIDA DE 1 FRAME (95%)
  console.log('\n--- TESTE F: MARKDOWN FENCES + CONFIRMAÇÃO RÁPIDA DE 1 FRAME ---');
  {
    const raw = '```json\n{"objetoDetectado": "sorvete", "confianca": 98}\n```';
    const parsed = parseGeminiResponse(raw);

    assert(parsed.isJsonValid === true, 'Teste F - Strip Markdown Code Fences', `isJsonValid = ${parsed.isJsonValid}`);
    assert(parsed.objetoRaw === 'sorvete', 'Teste F - Objeto Parseado', `objetoRaw = ${parsed.objetoRaw}`);

    const analyzer = new WheelVisionAnalyzer(1, 85, 2500);
    // Warm up gate (2 frames)
    analyzer.processarDeteccao('sorvete', 98, true, 0.96);
    const res = analyzer.processarDeteccao(parsed.objetoRaw, parsed.confiancaRaw, true, 0.96);

    assert(res.status === 'confirmado', 'Teste F - Confirmação Imediata 1 Frame', `status = ${res.status}`);
    assert(res.objeto === 'sorvete', 'Teste F - Símbolo Confirmado', `objeto = ${res.objeto}`);
    assert(!!res.eventId, 'Teste F - Event ID Criado', `eventId = ${res.eventId}`);
  }

  // TESTE G: TIMEOUT DE LEITURA (> 3000ms) -> AGUARDANDO_PROXIMA_RODADA
  console.log('\n--- TESTE G: TIMEOUT DE LEITURA (> 3000ms) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // Frame 1 e Frame 2 para passar gate
    analyzer.processarDeteccao(null, 0, true, 0.96);
    const res1 = analyzer.processarDeteccao(null, 0, true, 0.96);
    assert(res1.state === 'LEITURA_RESULTADO' || res1.state === 'RECOGNIZING_RESULT', 'Teste G - Frame 2 em RECOGNIZING_RESULT', `state = ${res1.state}`);

    // Simular que se passaram 3100ms sem objeto válido
    const now = Date.now();
    // @ts-ignore override timestamp for test
    analyzer['resultScreenDetectedAtTimestamp'] = now - 3100;

    const res2 = analyzer.processarDeteccao(null, 0, true, 0.96);
    assert(res2.state === 'AGUARDANDO_PROXIMA_RODADA' || res2.state === 'WAITING_FOR_RESULT_SCREEN_EXIT', 'Teste G - Transição por Timeout para WAITING_FOR_RESULT_SCREEN_EXIT', `state = ${res2.state}`);
    assert(!res2.eventId, 'Teste G - Sem Event ID Gerado no Timeout', `eventId = ${res2.eventId}`);
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runGeminiParserAndStateTestSuite();
