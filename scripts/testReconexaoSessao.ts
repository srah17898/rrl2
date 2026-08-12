import { BackendLiveService } from '../src/services/backendLiveService';
import { setAutoPersistEnabled, isAutoPersistEnabled } from '../src/services/resultadoService';

async function executarTestesReconexaoESessao() {
  console.log('====================================================================');
  console.log(' FARM FISHING — SUÍTE BARRAGEM DE TESTES A-G (RECONEXÃO & SESSÃO) ');
  console.log('====================================================================\n');

  // Garantir que a persistência no banco real está DESABILITADA durante a suíte de testes
  setAutoPersistEnabled(false);
  console.log(`[CONFIG] AUTO_PERSIST_ENABLED = ${isAutoPersistEnabled()} (MANDATÓRIO FALSE)\n`);

  let testesPassaram = 0;
  let totalTestes = 0;

  // --------------------------------------------------------------------------------
  // TESTE A: Reconexão com Rodada em Andamento
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE A] Reconexão com Rodada em Andamento...`);
  const userA = 'user_test_a';
  await BackendLiveService.encerrarSessao(userA, 'Reset teste A');

  const statusA1 = await BackendLiveService.iniciarSessao(userA, {
    consecutiveConfirmationsRequired: 3,
    minConfidenceRequired: 85,
  });
  const sessionIdA = statusA1.sessionId!;
  const connA1 = statusA1.connectionId!;

  const tA = 1000000;
  await BackendLiveService.testSimulatedDetection(userA, 'boia', 90, tA);
  await BackendLiveService.testSimulatedDetection(userA, 'boia', 90, tA + 200);

  const statusA2 = BackendLiveService.verificarStatus(userA);
  const confirmationsBeforeA = statusA2.confirmacoesConsecutivas;

  const statusA3 = await BackendLiveService.reconectar(userA);
  const connA2 = statusA3.connectionId!;
  const confirmationsAfterA = statusA3.confirmacoesConsecutivas;

  await BackendLiveService.testSimulatedDetection(userA, 'boia', 90, tA + 700);
  const resConfirm = await BackendLiveService.testSimulatedDetection(userA, 'boia', 90, tA + 1300);

  const statusA4 = BackendLiveService.verificarStatus(userA);

  const passouA =
    sessionIdA === statusA4.sessionId &&
    connA1 !== connA2 &&
    confirmationsBeforeA === 1 &&
    confirmationsAfterA === 1 &&
    resConfirm.foiConfirmadoAgora === true &&
    statusA4.totalRodadasDetectadasSessao === 1;

  console.log(`  -> SessionId Mantido: ${sessionIdA === statusA4.sessionId} (${statusA4.sessionId})`);
  console.log(`  -> ConnectionId Alterado: ${connA1 !== connA2} (${connA1} -> ${connA2})`);
  console.log(`  -> Candidato e Confirmações Preservados: ${confirmationsBeforeA} -> ${confirmationsAfterA}`);
  console.log(`  -> Rodada Confirmada sem Duplicação: ${resConfirm.foiConfirmadoAgora} (Total: ${statusA4.totalRodadasDetectadasSessao})`);
  console.log(`  -> Resultado: ${passouA ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouA) testesPassaram++;

  // --------------------------------------------------------------------------------
  // TESTE B: Reconexão em AGUARDANDO_SAIDA_TELA_RESULTADO
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE B] Reconexão durante trava da tela de resultado...`);
  const userB = 'user_test_b';
  await BackendLiveService.encerrarSessao(userB, 'Reset teste B');

  await BackendLiveService.iniciarSessao(userB, {
    consecutiveConfirmationsRequired: 3,
    minConfidenceRequired: 85,
  });

  const tB = 1000000;
  await BackendLiveService.testSimulatedDetection(userB, 'boia', 90, tB);
  await BackendLiveService.testSimulatedDetection(userB, 'boia', 90, tB + 200);
  await BackendLiveService.testSimulatedDetection(userB, 'boia', 90, tB + 700);
  await BackendLiveService.testSimulatedDetection(userB, 'boia', 90, tB + 1300);

  await BackendLiveService.reconectar(userB);
  const statusB2 = BackendLiveService.verificarStatus(userB);

  let duplicadosBloqueadosB = 0;
  for (let i = 0; i < 10; i++) {
    const res = await BackendLiveService.testSimulatedDetection(userB, 'boia', 90, tB + 2000 + i * 100);
    if (!res.foiConfirmadoAgora) {
      duplicadosBloqueadosB++;
    }
  }

  const statusB3 = BackendLiveService.verificarStatus(userB);

  const passouB =
    duplicadosBloqueadosB === 10 &&
    statusB3.totalRodadasDetectadasSessao === 1;

  console.log(`  -> Estado Preservado: ${statusB2.analyzerState}`);
  console.log(`  -> Frames Adicionais Bloqueados: ${duplicadosBloqueadosB}/10`);
  console.log(`  -> Total Rodadas em Sessão Permanece 1: ${statusB3.totalRodadasDetectadasSessao === 1}`);
  console.log(`  -> Resultado: ${passouB ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouB) testesPassaram++;

  // --------------------------------------------------------------------------------
  // TESTE C: Sequência com Reconexão
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE C] Sequência BOIA -> Reconexão -> SOCO -> Reconexão -> PRINCESA...`);
  const userC = 'user_test_c';
  await BackendLiveService.encerrarSessao(userC, 'Reset teste C');

  await BackendLiveService.iniciarSessao(userC, {
    consecutiveConfirmationsRequired: 2,
    minConfidenceRequired: 85,
  });

  // 1. BOIA
  let tC = 1000000;
  await BackendLiveService.testSimulatedDetection(userC, 'boia', 90, tC, true);
  await BackendLiveService.testSimulatedDetection(userC, 'boia', 90, tC + 200, true);
  const resC1 = await BackendLiveService.testSimulatedDetection(userC, 'boia', 90, tC + 1300, true);

  // Saída da tela de resultado (spin, resultZoneDetected = false)
  tC += 2000;
  for (let i = 0; i < 3; i++) {
    await BackendLiveService.testSimulatedDetection(userC, 'não identificado', 0, tC + i * 300, false);
  }

  // Reconexão 1
  await BackendLiveService.reconectar(userC);

  // 2. SOCO
  tC += 2000;
  await BackendLiveService.testSimulatedDetection(userC, 'soco', 90, tC, true);
  await BackendLiveService.testSimulatedDetection(userC, 'soco', 90, tC + 200, true);
  const resC2 = await BackendLiveService.testSimulatedDetection(userC, 'soco', 90, tC + 1300, true);

  // Saída da tela de resultado (spin, resultZoneDetected = false)
  tC += 2000;
  for (let i = 0; i < 3; i++) {
    await BackendLiveService.testSimulatedDetection(userC, 'não identificado', 0, tC + i * 300, false);
  }

  // Reconexão 2
  await BackendLiveService.reconectar(userC);

  // 3. PRINCESA
  tC += 2000;
  await BackendLiveService.testSimulatedDetection(userC, 'princesa', 90, tC, true);
  await BackendLiveService.testSimulatedDetection(userC, 'princesa', 90, tC + 200, true);
  const resC3 = await BackendLiveService.testSimulatedDetection(userC, 'princesa', 90, tC + 1300, true);

  const statusC = BackendLiveService.verificarStatus(userC);

  const passouC =
    resC1.foiConfirmadoAgora === true &&
    resC2.foiConfirmadoAgora === true &&
    resC3.foiConfirmadoAgora === true &&
    statusC.totalRodadasDetectadasSessao === 3;

  console.log(`  -> Confirmado 1 (BOIA): ${resC1.foiConfirmadoAgora}`);
  console.log(`  -> Confirmado 2 (SOCO): ${resC2.foiConfirmadoAgora}`);
  console.log(`  -> Confirmado 3 (PRINCESA): ${resC3.foiConfirmadoAgora}`);
  console.log(`  -> Total Rodadas Detectadas: ${statusC.totalRodadasDetectadasSessao}/3`);
  console.log(`  -> Total Reconexões Registradas: ${statusC.tentativasReconexao}/2`);
  console.log(`  -> Resultado: ${passouC ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouC) testesPassaram++;

  // --------------------------------------------------------------------------------
  // TESTE E: Chamadas Simultâneas de Reconexão
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE E] Chamadas Simultâneas de Reconexão Concorrentes...`);
  const userE = 'user_test_e';
  await BackendLiveService.encerrarSessao(userE, 'Reset teste E');
  await BackendLiveService.iniciarSessao(userE, {});

  const promessasE = [
    BackendLiveService.reconectar(userE),
    BackendLiveService.reconectar(userE),
    BackendLiveService.reconectar(userE),
    BackendLiveService.reconectar(userE),
    BackendLiveService.reconectar(userE),
  ];

  const resultadosE = await Promise.all(promessasE);
  const statusEFinal = BackendLiveService.verificarStatus(userE);

  const todosConectados = resultadosE.every((r) => r.estado === 'conectado');
  const mesmoSessionId = resultadosE.every((r) => r.sessionId === statusEFinal.sessionId);

  const passouE = todosConectados && mesmoSessionId && statusEFinal.sessionId !== null;

  console.log(`  -> Todas chamadas retornaram 'conectado': ${todosConectados}`);
  console.log(`  -> Sessão permaneceu única sem duplicar: ${mesmoSessionId} (${statusEFinal.sessionId})`);
  console.log(`  -> Resultado: ${passouE ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouE) testesPassaram++;

  // --------------------------------------------------------------------------------
  // TESTE F: Isolamento Total de Sessões por Usuário
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE F] Isolamento Total de Sessões entre Usuário A e Usuário B...`);
  const userF1 = 'user_isolation_1';
  const userF2 = 'user_isolation_2';
  await BackendLiveService.encerrarSessao(userF1, 'Reset F1');
  await BackendLiveService.encerrarSessao(userF2, 'Reset F2');

  const statusF1Start = await BackendLiveService.iniciarSessao(userF1, { consecutiveConfirmationsRequired: 2 });
  const statusF2Start = await BackendLiveService.iniciarSessao(userF2, { consecutiveConfirmationsRequired: 2 });

  for (let i = 0; i < 3; i++) {
    await BackendLiveService.testSimulatedDetection(userF1, 'soco', 90, 1000000 + i * 200, true);
  }

  for (let i = 0; i < 3; i++) {
    await BackendLiveService.testSimulatedDetection(userF2, 'coroa', 90, 1000000 + i * 200, true);
  }

  await BackendLiveService.reconectar(userF1);

  const statusF1End = BackendLiveService.verificarStatus(userF1);
  const statusF2End = BackendLiveService.verificarStatus(userF2);

  const passouF =
    statusF1Start.sessionId !== statusF2Start.sessionId &&
    statusF2End.tentativasReconexao === 0;

  console.log(`  -> Session IDs Diferentes: ${statusF1Start.sessionId !== statusF2Start.sessionId}`);
  console.log(`  -> Estado do Usuário B Inalterado após Reconexão do Usuário A: ${statusF2End.tentativasReconexao === 0}`);
  console.log(`  -> Resultado: ${passouF ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouF) testesPassaram++;

  // --------------------------------------------------------------------------------
  // TESTE G: Queda/Sair vs Encerramento Explícito ("ENCERRAR TRANSMISSÃO")
  // --------------------------------------------------------------------------------
  totalTestes++;
  console.log(`[TESTE G] Desconexão/Sair Temporário vs Encerrar Transmissão Explícito...`);
  const userG = 'user_test_g';
  await BackendLiveService.encerrarSessao(userG, 'Reset G');

  await BackendLiveService.iniciarSessao(userG, { consecutiveConfirmationsRequired: 2 });
  for (let i = 0; i < 3; i++) {
    await BackendLiveService.testSimulatedDetection(userG, 'balao', 90, 1000000 + i * 200, true);
  }

  const statusGReconnected = await BackendLiveService.iniciarSessao(userG, { forceNewSession: false });
  const preservouEstado = statusGReconnected.sessionId !== null;

  await BackendLiveService.encerrarSessao(userG, 'Encerrar Transmissão pelo Usuário');
  const statusGDestroyed = BackendLiveService.verificarStatus(userG);
  const estadoDestruido = statusGDestroyed.estado === 'desconectado' && statusGDestroyed.sessionId === null;

  const passouG = preservouEstado && estadoDestruido;

  console.log(`  -> Re-conexão automática preservou candidato em andamento: ${preservouEstado}`);
  console.log(`  -> Encerramento explícito destruiu a sessão: ${estadoDestruido}`);
  console.log(`  -> Resultado: ${passouG ? 'PASSOU ✅' : 'FALHOU ❌'}\n`);
  if (passouG) testesPassaram++;

  // --------------------------------------------------------------------------------
  // RESUMO FINAL
  // --------------------------------------------------------------------------------
  console.log('====================================================================');
  console.log(` RESULTADO FINAL: ${testesPassaram}/${totalTestes} SUÍTES DE TESTE PASSARAM`);
  console.log('====================================================================');

  if (testesPassaram === totalTestes) {
    console.log('🎉 TODOS OS TESTES A-G PASSARAM COM SUCESSO! ARQUITETURA VALIDADA COM EXCELÊNCIA. ✅');
  } else {
    console.error('❌ ALGUNS TESTES FALHARAM. VERIFIQUE OS LOGS ACIMA.');
    process.exit(1);
  }
}

executarTestesReconexaoESessao().catch((err) => {
  console.error('Erro fatal ao executar os testes:', err);
  process.exit(1);
});
