import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { LocalWheelRecognizer } from '../services/LocalWheelRecognizer';

async function runResultScreenGateTestSuite() {
  console.log('========================================================================');
  console.log('SUÍTE DE TESTES EXCLUSIVA: RESULT SCREEN GATE (FILTRO DE TELA DE RESULTADO)');
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

  // TESTE 1: RODA_NORMAL -> Reconhecimento Bloqueado
  console.log('--- TESTE 1: RODA_NORMAL (resultadoScreenDetected = false) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const res = analyzer.processarDeteccao('boia', 96, false, 0.0);

    assert(res.status === 'descartado_fora_de_tela_resultado', 'T1 - Status Descartado', `Status: ${res.status}`);
    assert(res.objeto === 'não identificado', 'T1 - Objeto "não identificado"', `Objeto: ${res.objeto}`);
    assert(res.confianca === 0, 'T1 - Confiança zero no descarte', `Confiança: ${res.confianca}`);
    assert(res.eventId === undefined, 'T1 - Event ID Nulo', `Event ID: ${res.eventId}`);
    assert(!analyzer.isResultScreenConfirmed(), 'T1 - Gate Fechado', 'Gate Fechado OK');
  }

  // TESTE 2: 1 Frame de Tela de Resultado (CANDIDATE 1/2) -> Reconhecimento Bloqueado
  console.log('\n--- TESTE 2: 1º Frame Tela de Resultado (CANDIDATE 1/2) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const res = analyzer.processarDeteccao('boia', 96, true, 0.95);

    assert(res.objeto === 'não identificado', 'T2 - Objeto não identificado no Frame 1', `Objeto: ${res.objeto}`);
    assert(res.confianca === 0, 'T2 - Confiança 0 no Frame 1', `Confiança: ${res.confianca}`);
    assert(res.eventId === undefined, 'T2 - Sem Event ID no Frame 1', `Event ID: ${res.eventId}`);
    assert(analyzer.getCurrentState() === 'RODA_EM_TRANSICAO', 'T2 - Estado RODA_EM_TRANSICAO', `Estado: ${analyzer.getCurrentState()}`);
    assert(!analyzer.isResultScreenConfirmed(), 'T2 - Gate AINDA não confirmado', 'OK');

    const gateInfo = analyzer.getResultScreenGateInfo();
    assert(gateInfo.status === 'CANDIDATE', 'T2 - Gate Status CANDIDATE', `Status: ${gateInfo.status}`);
    assert(gateInfo.stableFrames === 1, 'T2 - 1/2 Frames Estáveis', `Frames: ${gateInfo.stableFrames}/2`);
  }

  // TESTE 3: 2º Frame de Tela de Resultado (CONFIRMED 2/2) -> Liberação do Reconhecimento
  console.log('\n--- TESTE 3: 2º Frame Tela de Resultado (CONFIRMED 2/2 -> Round Start) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    analyzer.processarDeteccao('boia', 96, true, 0.95); // Frame 1
    const res2 = analyzer.processarDeteccao('boia', 96, true, 0.95); // Frame 2

    const activeEventId = analyzer.getCurrentEventId();

    assert(analyzer.isResultScreenConfirmed(), 'T3 - Gate Confirmado', 'Gate Confirmado OK');
    assert(
      analyzer.getCurrentState() === 'LEITURA_RESULTADO' || analyzer.getCurrentState() === 'RESULTADO_CONFIRMANDO',
      'T3 - Estado Ativo da Rodada',
      `Estado: ${analyzer.getCurrentState()}`
    );
    assert(activeEventId !== null && activeEventId.includes('R001'), 'T3 - Event ID R001 Criado', `Event ID: ${activeEventId}`);

    const gateInfo = analyzer.getResultScreenGateInfo();
    assert(gateInfo.status === 'CONFIRMED', 'T3 - Status CONFIRMED', `Status: ${gateInfo.status}`);
    assert(gateInfo.recognitionAllowed === true, 'T3 - Reconhecimento Autorizado', 'OK');
  }

  // TESTE 4: Direct LocalWheelRecognizer Gate Test (isResultScreenConfirmed = false)
  console.log('\n--- TESTE 4: LocalWheelRecognizer.recognizeCrop com Gate Fechado ---');
  {
    const dummyBase64 = 'data:image/jpeg;base64,';
    const localRes = await LocalWheelRecognizer.recognizeCrop(dummyBase64, false);

    assert(localRes.objetoDetectado === 'nenhum', 'T4 - Objeto "nenhum"', `Objeto: ${localRes.objetoDetectado}`);
    assert(localRes.confianca === 0, 'T4 - Confiança 0', `Confiança: ${localRes.confianca}`);
    assert(localRes.reason === 'RESULT_SCREEN_NOT_CONFIRMED', 'T4 - Motivo do Bloqueio', `Motivo: ${localRes.reason}`);
  }

  // TESTE 5: Sequência Completa (RODA_NORMAL -> TELA_RESULTADO -> RODA_NORMAL)
  console.log('\n--- TESTE 5: Sequência Completa (10 frames RODA_NORMAL -> 10 frames TELA_RESULTADO -> 10 frames RODA_NORMAL) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let falseRecognitionsRodaNormal = 0;
    let roundConfirmations = 0;
    const eventIdsGenerated = new Set<string>();

    // 1. 10 Frames RODA_NORMAL com tentativas de ruído
    for (let f = 1; f <= 10; f++) {
      const isConfirmed = analyzer.peekResultScreenConfirmed(false, 0);
      const localRes = await LocalWheelRecognizer.recognizeCrop('data:image/jpeg;base64,', isConfirmed);

      if (localRes.objetoDetectado !== 'nenhum') {
        falseRecognitionsRodaNormal++;
      }

      const res = analyzer.processarDeteccao(localRes.objetoDetectado, localRes.confianca, false, 0);
      if (res.status === 'confirmado') roundConfirmations++;
    }

    assert(falseRecognitionsRodaNormal === 0, 'T5 - Zero Falsos Reconhecimentos em RODA_NORMAL', `Falsos: ${falseRecognitionsRodaNormal}`);

    // 2. 10 Frames TELA_RESULTADO com BOIA
    for (let f = 1; f <= 10; f++) {
      const isConfirmed = analyzer.peekResultScreenConfirmed(true, 0.95);
      const localRes = await LocalWheelRecognizer.recognizeCrop('data:image/jpeg;base64,', isConfirmed);

      // No frame 2 em diante do gate, simulamos retorno 'boia' (96%)
      const symbol = isConfirmed ? 'boia' : 'nenhum';
      const conf = isConfirmed ? 96 : 0;

      const res = analyzer.processarDeteccao(symbol, conf, true, 0.95);
      if (res.eventId) eventIdsGenerated.add(res.eventId);
      if (res.status === 'confirmado') roundConfirmations++;
    }

    assert(roundConfirmations === 1, 'T5 - Exatamente 1 Confirmação de Rodada', `Confirmações: ${roundConfirmations}`);
    assert(eventIdsGenerated.size === 1, 'T5 - Exatamente 1 Event ID', `Event IDs: ${eventIdsGenerated.size}`);

    // 3. 10 Frames RODA_NORMAL (Saída da Tela)
    for (let f = 1; f <= 10; f++) {
      const isConfirmed = analyzer.peekResultScreenConfirmed(false, 0);
      const localRes = await LocalWheelRecognizer.recognizeCrop('data:image/jpeg;base64,', isConfirmed);

      if (localRes.objetoDetectado !== 'nenhum') {
        falseRecognitionsRodaNormal++;
      }

      analyzer.processarDeteccao(null, 0, false, 0);
    }

    assert(falseRecognitionsRodaNormal === 0, 'T5 - Zero Falsos Reconhecimentos no Retorno a RODA_NORMAL', `Falsos: ${falseRecognitionsRodaNormal}`);
    assert(analyzer.getCurrentState() === 'RODA_NORMAL', 'T5 - Estado Final RODA_NORMAL', `Estado: ${analyzer.getCurrentState()}`);
    assert(analyzer.getCurrentEventId() === null, 'T5 - Event ID Final Resetado', `Event ID: ${analyzer.getCurrentEventId()}`);
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO DOS TESTES DE RESULT SCREEN GATE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runResultScreenGateTestSuite().catch((err) => {
  console.error('Erro nos testes de Result Screen Gate:', err);
  process.exit(1);
});
