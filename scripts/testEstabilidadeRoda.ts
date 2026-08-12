import { WheelVisionAnalyzer } from '../src/services/WheelVisionAnalyzer';

async function runEstabilidadeRodaTests() {
  console.log('===========================================================');
  console.log('  TESTES DE ESTABILIDADE DA RODA E PREVENÇÃO DE DUPLICAÇÃO');
  console.log('===========================================================');

  let passedTests = 0;
  let totalTests = 8;

  // ---------------------------------------------------------------------
  // TESTE 1: BALÃO × 100 frames estáveis (100ms de intervalo = 10s no total)
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 1] BALÃO × 100 frames estáveis');
  const analyzer1 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  let confirmationsCount1 = 0;
  let duplicatesCount1 = 0;
  let startTime1 = 1000000;

  for (let i = 0; i < 100; i++) {
    const frameTime = startTime1 + i * 100; // 100ms por frame
    const res = analyzer1.processarDeteccao('balao', 95, true, 1.0, 'sess_t1', i + 1, frameTime);
    if (res.confirmedNow) {
      confirmationsCount1++;
      console.log(`  └─ Frame #${i + 1} (t=${i * 100}ms): CONFIRMADO! eventId="${res.eventId}"`);
    } else if (res.status === 'duplicado') {
      duplicatesCount1++;
    }
  }

  if (confirmationsCount1 === 1 && duplicatesCount1 >= 90) {
    console.log(`  ✓ PASSOU: Exatamente 1 confirmação e ${duplicatesCount1} bloqueios de duplicados após estabilidade.`);
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: Confirmações=${confirmationsCount1} (esperado: 1), Duplicados=${duplicatesCount1}`);
  }

  // ---------------------------------------------------------------------
  // TESTE 2: Oscilação de Animação sem estabilidade temporal (mudanças rápidas < 3 confirmações seguidas)
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 2] Oscilação de Animação sem estabilidade temporal');
  const analyzer2 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  let confirmationsCount2 = 0;
  let startTime2 = 1000000;

  const sequence2 = [
    'balao', 'princesa', 'balao', 'camera',
    'balao', 'princesa', 'camera', 'balao',
    'princesa', 'balao', 'camera', 'princesa'
  ];

  for (let i = 0; i < sequence2.length; i++) {
    const frameTime = startTime2 + i * 100;
    const res = analyzer2.processarDeteccao(sequence2[i], 92, true, 1.0, 'sess_t2', i + 1, frameTime);
    if (res.confirmedNow) confirmationsCount2++;
  }

  if (confirmationsCount2 === 0) {
    console.log('  ✓ PASSOU: 0 confirmações durante oscilação rápida do giro da roda.');
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: Confirmações=${confirmationsCount2} (esperado: 0).`);
  }

  // ---------------------------------------------------------------------
  // TESTE 3: BALÃO x5 + Estabilidade Temporal
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 3] BALÃO x5 + Estabilidade Temporal');
  const analyzer3 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  let confirmationsCount3 = 0;
  let confirmedEventId3 = '';
  let startTime3 = 1000000;

  for (let i = 0; i < 6; i++) {
    const res = analyzer3.processarDeteccao('balao', 95, true, 1.0, 'sess_t3', i + 1, startTime3 + i * 300);
    if (res.confirmedNow) {
      confirmationsCount3++;
      confirmedEventId3 = res.eventId || '';
    }
  }

  if (confirmationsCount3 === 1 && confirmedEventId3.startsWith('LIVE_EVT_')) {
    console.log(`  ✓ PASSOU: Confirmação realizada após 3 marcas com eventId="${confirmedEventId3}".`);
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: Confirmações=${confirmationsCount3} (esperado: 1).`);
  }

  // ---------------------------------------------------------------------
  // TESTE 4: BALÃO confirmado -> Trava de Persistência em AGUARDANDO_SAIDA_TELA_RESULTADO
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 4] Trava de Persistência em AGUARDANDO_SAIDA_TELA_RESULTADO');
  const analyzer4 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  let startTime4 = 1000000;

  // Primeiro atinge confirmação inicial (5 frames)
  for (let i = 0; i < 5; i++) {
    analyzer4.processarDeteccao('balao', 98, true, 1.0, 'sess_t4', i + 1, startTime4 + i * 100);
  }

  // Agora envia +100 frames enquanto permanece na tela de resultado
  let additionalConfirmations4 = 0;
  for (let i = 5; i < 105; i++) {
    const res = analyzer4.processarDeteccao('balao', 98, true, 1.0, 'sess_t4', i + 1, startTime4 + i * 100);
    if (res.confirmedNow) additionalConfirmations4++;
  }

  if (additionalConfirmations4 === 0) {
    console.log('  ✓ PASSOU: 0 novas confirmações adicionais em AGUARDANDO_SAIDA_TELA_RESULTADO.');
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: Confirmações adicionais=${additionalConfirmations4} (esperado: 0).`);
  }

  // ---------------------------------------------------------------------
  // TESTE 5: Transição de Rodada e Vitórias Repetidas (BALÃO -> Giro -> BALÃO)
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 5] Transição de Rodada com Resultado Repetido (BALÃO -> Giro -> BALÃO)');
  const analyzer5 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  let startTime5 = 2000000;

  // Rodada 1: 5 frames de BALÃO
  let eventId1 = '';
  let confirmed1 = false;
  for (let i = 0; i < 6; i++) {
    const res = analyzer5.processarDeteccao('balao', 95, true, 1.0, 'sess_t5', i + 1, startTime5 + i * 300);
    if (res.confirmedNow) {
      confirmed1 = true;
      eventId1 = res.eventId || '';
    }
  }

  // Encerramento da Tela de Resultado (Giro da Roda)
  let spinStartTime = startTime5 + 3000;
  for (let i = 0; i < 5; i++) {
    analyzer5.processarDeteccao('não identificado', 0, false, 0, 'sess_t5', 10 + i, spinStartTime + i * 300);
  }

  // Rodada 2: Nova Tela de Resultado com BALÃO
  let round2StartTime = spinStartTime + 2000;
  let eventId2 = '';
  let confirmed2 = false;
  for (let i = 0; i < 6; i++) {
    const res = analyzer5.processarDeteccao('balao', 95, true, 1.0, 'sess_t5', 20 + i, round2StartTime + i * 300);
    if (res.confirmedNow) {
      confirmed2 = true;
      eventId2 = res.eventId || '';
    }
  }

  if (confirmed1 && confirmed2 && eventId1 !== eventId2) {
    console.log(`  ✓ PASSOU: 2 rodadas independentes confirmadas! eventId1="${eventId1}", eventId2="${eventId2}".`);
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: confirmed1=${confirmed1}, confirmed2=${confirmed2}, e1=${eventId1}, e2=${eventId2}`);
  }

  // ---------------------------------------------------------------------
  // TESTE 6: Trava em AGUARDANDO_SAIDA_TELA_RESULTADO
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 6] Validação de confirmedNow = false na trava de saída da tela');
  const analyzer6 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  analyzer6.setUltimoObjetoConfirmado('balao', 'EVT_001');

  const res6 = analyzer6.processarDeteccao('balao', 98, true, 1.0, 'sess_t6', 1, 1000000);
  if (res6.confirmedNow === false) {
    console.log('  ✓ PASSOU: confirmedNow = false na trava de tela.');
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: confirmedNow=${res6.confirmedNow}, status=${res6.status}`);
  }

  // ---------------------------------------------------------------------
  // TESTE 7: Detecção de Fechamento da Tela de Resultado
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 7] Transição de Tela de Resultado -> Tela Normal');
  const analyzer7 = new WheelVisionAnalyzer(3, 85, 1000, 3000);
  analyzer7.processarDeteccao('balao', 95, true, 1.0, 'sess_t7', 1, 1000000);
  const res7a = analyzer7.processarDeteccao('balao', 95, false, 0, 'sess_t7', 2, 1000100);

  if (!res7a.confirmedNow && (analyzer7.getCurrentState() === 'RODA_NORMAL' || analyzer7.getCurrentState() === 'AGUARDANDO_PROXIMA_RODADA')) {
    console.log('  ✓ PASSOU: Tela de resultado encerrada e estado resetado para transição de rodada.');
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: estado=${analyzer7.getCurrentState()}, confirmedNow=${res7a.confirmedNow}`);
  }

  // ---------------------------------------------------------------------
  // TESTE 8: Bloqueio de Leitura Fora da Tela de Resultado
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 8] Bloqueio de Leitura Fora da Tela de Resultado');
  const analyzer8 = new WheelVisionAnalyzer(3, 85, 1000, 3000);

  const res8 = analyzer8.processarDeteccao('balao', 99, false, 0, 'sess_t8', 99, 1000000);

  if (res8.confirmedNow === false && res8.status === 'descartado_fora_de_tela_resultado') {
    console.log('  ✓ PASSOU: Leitura fora da tela de resultado bloqueada com sucesso!');
    passedTests++;
  } else {
    console.error(`  ✗ FALHOU: Leitura fora da tela de resultado não foi descartada.`);
  }

  console.log('\n===========================================================');
  console.log(`  RESULTADO FINAL: ${passedTests}/${totalTests} SUÍTES PASSARAM`);
  console.log('===========================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runEstabilidadeRodaTests().catch((err) => {
  console.error('Erro ao rodar testes:', err);
  process.exit(1);
});
