import { parseGeminiResponse } from '../services/backendLiveService';

async function run10ParserScenariosTest() {
  console.log('========================================================================');
  console.log('TESTES OBRIGATÓRIOS DO PARSER GEMINI (10 CENÁRIOS ESTRITOS)');
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

  // TESTE 1: {"objetoDetectado":"balao","confianca":0.96} -> balao / 96 (PARSER_RES ✓)
  {
    const raw = '{"objetoDetectado":"balao","confianca":0.96}';
    const res = parseGeminiResponse(raw, 't1');
    assert(
      res.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' && res.objetoRaw === 'balao' && res.confiancaRaw === 96,
      'TESTE 1',
      `objeto=${res.objetoRaw}, confianca=${res.confiancaRaw}, log=${res.geminiEstadoLog}`
    );
  }

  // TESTE 2: {"objetoDetectado":"balão","confianca":0.96} -> balao / 96 (PARSER_RES ✓)
  {
    const raw = '{"objetoDetectado":"balão","confianca":0.96}';
    const res = parseGeminiResponse(raw, 't2');
    assert(
      res.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' && res.objetoRaw === 'balao' && res.confiancaRaw === 96,
      'TESTE 2 (acentuação balão)',
      `objeto=${res.objetoRaw}, confianca=${res.confiancaRaw}`
    );
  }

  // TESTE 3: ```json\n{"objetoDetectado":"balao","confianca":0.96}\n``` -> balao / 96 (PARSER_RES ✓)
  {
    const raw = '```json\n{"objetoDetectado":"balao","confianca":0.96}\n```';
    const res = parseGeminiResponse(raw, 't3');
    assert(
      res.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' && res.objetoRaw === 'balao' && res.confiancaRaw === 96,
      'TESTE 3 (markdown code fences)',
      `objeto=${res.objetoRaw}, confianca=${res.confiancaRaw}`
    );
  }

  // TESTE 4: {"objetoDetectado":"BALA0","confianca":96} -> PARSER_RES ✗ (não considerar como balao)
  {
    const raw = '{"objetoDetectado":"BALA0","confianca":96}';
    const res = parseGeminiResponse(raw, 't4');
    assert(
      res.geminiEstadoLog === 'GEMINI_PARSE_ERROR' && res.objetoRaw === null,
      'TESTE 4 (BALA0 rejeitado estritamente)',
      `log=${res.geminiEstadoLog}, objeto=${res.objetoRaw}`
    );
  }

  // TESTE 5: {"objetoDetectado":"nenhum","confianca":0} -> PARSER_RES ✓, objeto = nenhum
  {
    const raw = '{"objetoDetectado":"nenhum","confianca":0}';
    const res = parseGeminiResponse(raw, 't5');
    assert(
      res.geminiEstadoLog === 'GEMINI_NO_OBJECT' && res.objetoRaw === null,
      'TESTE 5 (objeto "nenhum" é válido)',
      `log=${res.geminiEstadoLog}, objeto=${res.objetoRaw}`
    );
  }

  // TESTE 6: {"objetoDetectado":"câmera","confianca":0.91} -> camera / 91 (PARSER_RES ✓)
  {
    const raw = '{"objetoDetectado":"câmera","confianca":0.91}';
    const res = parseGeminiResponse(raw, 't6');
    assert(
      res.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' && res.objetoRaw === 'camera' && res.confiancaRaw === 91,
      'TESTE 6 (acentuação câmera)',
      `objeto=${res.objetoRaw}, confianca=${res.confiancaRaw}`
    );
  }

  // TESTE 7: {"objetoDetectado":"teddy","confianca":0.90} -> tedy / 90 (PARSER_RES ✓)
  {
    const raw = '{"objetoDetectado":"teddy","confianca":0.90}';
    const res = parseGeminiResponse(raw, 't7');
    assert(
      res.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' && res.objetoRaw === 'tedy' && res.confiancaRaw === 90,
      'TESTE 7 (sinônimo teddy -> tedy)',
      `objeto=${res.objetoRaw}, confianca=${res.confiancaRaw}`
    );
  }

  // TESTE 8: Resposta vazia -> PARSER_RES ✗
  {
    const raw = '  ';
    const res = parseGeminiResponse(raw, 't8');
    assert(
      res.geminiEstadoLog === 'GEMINI_NO_RESPONSE',
      'TESTE 8 (resposta vazia)',
      `log=${res.geminiEstadoLog}`
    );
  }

  // TESTE 9: JSON inválido -> PARSER_RES ✗
  {
    const raw = '{ objetoDetectado: invalid_json';
    const res = parseGeminiResponse(raw, 't9');
    assert(
      res.geminiEstadoLog === 'GEMINI_INVALID_JSON',
      'TESTE 9 (JSON sintaticamente inválido)',
      `log=${res.geminiEstadoLog}`
    );
  }

  // TESTE 10: Objeto desconhecido {"objetoDetectado":"bola","confianca":0.99} -> PARSER_RES ✗ (não balao nem nenhum)
  {
    const raw = '{"objetoDetectado":"bola","confianca":0.99}';
    const res = parseGeminiResponse(raw, 't10');
    assert(
      res.geminiEstadoLog === 'GEMINI_PARSE_ERROR' && res.objetoRaw === null,
      'TESTE 10 (objeto "bola" rejeitado, não mascarado como nenhum ou balao)',
      `log=${res.geminiEstadoLog}, objeto=${res.objetoRaw}`
    );
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run10ParserScenariosTest();
