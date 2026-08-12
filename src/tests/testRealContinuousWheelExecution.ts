import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { registrarResultadoAutomaticamente, setAutoPersistEnabled, limparMemoriaResultadoService } from '../services/resultadoService';
import { canSyncResultToDashboard, clearSyncedDashboardEventIds } from '../services/dashboardSync';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem, RoundEntry } from '../types';

export async function runRealContinuousWheelTest() {
  console.log('========================================================================');
  console.log('SIMULAÇÃO DE EXECUÇÃO REAL CONTÍNUA (10 RODADAS)');
  console.log('========================================================================\n');

  setAutoPersistEnabled(true);
  limparMemoriaResultadoService();
  clearSyncedDashboardEventIds();

  const analyzer = new WheelVisionAnalyzer();

  // 10 rodadas simulando padrão real da roda com transição de 1-2 frames ou 0 frames (sem oscilação de tela)
  const realRounds: Array<{ roundIndex: number; object: WheelItem; transitionExitFrames: number }> = [
    { roundIndex: 1, object: 'boia', transitionExitFrames: 2 },
    { roundIndex: 2, object: 'boia', transitionExitFrames: 0 }, // 0 frames de saída (tela continuou visível) e mesmo objeto!
    { roundIndex: 3, object: 'sorvete', transitionExitFrames: 0 }, // 0 frames de saída (tela continuou visível) e objeto diferente!
    { roundIndex: 4, object: 'balao', transitionExitFrames: 2 },
    { roundIndex: 5, object: 'soco', transitionExitFrames: 1 },
    { roundIndex: 6, object: 'tedy', transitionExitFrames: 0 },
    { roundIndex: 7, object: 'balao', transitionExitFrames: 1 },
    { roundIndex: 8, object: 'boia', transitionExitFrames: 0 },
    { roundIndex: 9, object: 'sorvete', transitionExitFrames: 2 },
    { roundIndex: 10, object: 'balao', transitionExitFrames: 1 },
  ];

  const tableSummary: Array<{
    rodada: string;
    objeto: string;
    recognizer: string;
    confirmed: string;
    eventId: string;
    supabase: string;
    historico: string;
    statusPipeline: string;
    motivoPerda?: string;
  }> = [];

  let globalFrameCounter = 0;
  let lastState = analyzer.getCurrentState();
  let lastEventId = analyzer.getCurrentEventId();

  let currentTimestamp = Date.now();

  for (const roundData of realRounds) {
    const roundLabel = `R${String(roundData.roundIndex).padStart(3, '0')}`;
    const targetObj = roundData.object;
    currentTimestamp += 3000; // Avança 3 segundos por rodada (intervalo real do jogo)

    console.log(`\n========================================================================`);
    console.log(`INICIANDO RODADA REAL ${roundLabel}: "${targetObj}" (Transição: ${roundData.transitionExitFrames} frames)`);
    console.log(`========================================================================`);

    // 1. SIMULAR TRANSIÇÃO / SAÍDA DE TELA DE RESULTADO (Giro da Roda)
    if (roundData.roundIndex > 1) {
      for (let f = 1; f <= roundData.transitionExitFrames; f++) {
        globalFrameCounter++;
        const prevState = analyzer.getCurrentState();
        const prevEvt = analyzer.getCurrentEventId();

        const resExit = analyzer.processarDeteccao(
          'nenhum',
          0,
          false,
          0,
          'session_continuous_test',
          globalFrameCounter
        );

        const newState = analyzer.getCurrentState();
        const newEvt = analyzer.getCurrentEventId();

        if (prevState !== newState) {
          console.log(
            `[STATE_TRACE] previousState=${prevState} newState=${newState} reason=RESULT_SCREEN_EXIT object=nenhum eventId=${newEvt || prevEvt || 'N/A'} timestamp=${Date.now()}`
          );
        }
      }
    }

    // 2. SIMULAR ENTRADA NA TELA DE RESULTADO (Resultado Estabilizado na Zona)
    let recognizedPass = false;
    let resultConfirmed = false;
    let confirmedEventId = '';
    let supabaseResult = 'NOT_ATTEMPTED';
    let historyResult = 'NOT_ATTEMPTED';
    let discardReason = 'NONE';
    let finalRoundResult = '';

    // Processar 5 frames do mesmo resultado na tela de resultado
    for (let frameInRound = 1; frameInRound <= 5; frameInRound++) {
      globalFrameCounter++;
      const prevState = analyzer.getCurrentState();
      const prevEvt = analyzer.getCurrentEventId();
      const prevRound = roundData.roundIndex;

      // Recognizer local simula match PASS com 95%
      recognizedPass = true;

      const frameTimestamp = currentTimestamp + frameInRound * 100;

      const analysis = analyzer.processarDeteccao(
        targetObj,
        95, // confianca
        true, // resultadoScreenDetected
        0.98, // resultScreenConfidence
        'session_continuous_test',
        globalFrameCounter,
        frameTimestamp
      );

      const newState = analyzer.getCurrentState();
      const newEvt = analysis.eventId || analyzer.getCurrentEventId() || 'N/A';

      // Trace de alteração do contador / Event ID
      if (prevEvt !== newEvt && newEvt !== 'N/A') {
        console.log(
          `[ROUND_COUNTER_TRACE] previousRound=${prevRound - 1} newRound=${prevRound} eventId=${newEvt} reason=NEW_ROUND_EVENT_ID_GENERATED timestamp=${Date.now()}`
        );
      }

      // Trace de transição de estado
      if (prevState !== newState) {
        console.log(
          `[STATE_TRACE] previousState=${prevState} newState=${newState} reason=${analysis.status} object=${targetObj} eventId=${newEvt} timestamp=${Date.now()}`
        );
      }

      // Rastrear confirmação
      if (analysis.status === 'confirmado' && analysis.objetoPadraoParaBanco) {
        resultConfirmed = true;
        confirmedEventId = analysis.eventId || newEvt;
        finalRoundResult = analysis.objetoPadraoParaBanco.resultado;

        // Tentar gravar no Supabase
        const reg = await registrarResultadoAutomaticamente(
          finalRoundResult,
          95,
          confirmedEventId,
          'session_continuous_test'
        );

        if (reg.registrado) {
          supabaseResult = 'SUCCESS';
        } else {
          supabaseResult = `FAIL (${reg.motivo})`;
        }

        // Tentar sincronizar com Histórico Visual
        const mockPayload = {
          timestamp: Date.now(),
          objetoDetectado: targetObj,
          confianca: 95,
          eventId: confirmedEventId,
          estabilizacao: {
            eventId: confirmedEventId,
            foiConfirmadoAgora: true,
            estadoAnalyzer: 'ROUND_CONFIRMED',
            ultimoObjetoConfirmado: targetObj,
            confiancaUltimaConfirmacao: 95,
            rodadaRegistrada: reg.rodadaRegistrada || roundData.roundIndex,
          },
        };

        const syncCheck = canSyncResultToDashboard(mockPayload, { autoMark: true });
        if (syncCheck.canSync) {
          historyResult = 'PASS';
        } else {
          historyResult = `FAIL (${syncCheck.reason})`;
        }
      } else if (recognizedPass && !resultConfirmed && frameInRound === 5) {
        // Se após 5 frames o reconhecedor passou mas a rodada não foi confirmada:
        if (analysis.status === 'duplicado') {
          discardReason = 'DUPLICATE_EVENT_ID';
        } else if (analysis.state === 'WAITING_FOR_RESULT_SCREEN_EXIT') {
          discardReason = 'WAITING_FOR_RESULT_SCREEN_EXIT';
        } else if (analysis.status === 'descartado_fora_de_tela_resultado') {
          discardReason = 'NOT_NEW_SCREEN_ENTRY';
        } else {
          discardReason = analysis.motivoDescarte || 'INSUFFICIENT_CONFIRMATIONS';
        }

        console.log(
          `[ROUND_DISCARD_TRACE] object=${targetObj} eventId=${newEvt} currentState=${newState} lastConfirmedObject=${analyzer.getUltimoObjetoConfirmado() || 'none'} lastConfirmedEventId=${analyzer.getCurrentEventId() || 'none'} confirmacoesConsecutivas=${analyzer.getCandidateState()?.confirmacoesConsecutivas || 0} resultScreenGoneFramesCount=${analyzer.isResultScreenActuallyGone() ? 1 : 0} isNewScreenEntry=false reason=${discardReason}`
        );
      }

      // TELEMETRIA COMPLETA PARA CADA FRAME [LIVE_ROUND_TRACE]
      console.log(
        `[LIVE_ROUND_TRACE] frameId=${globalFrameCounter} timestamp=${Date.now()} recognizedObject=${targetObj} normalizedObject=${targetObj} confidence=95 gap=15 recognizerStatus=PASS analyzerStatus=${analysis.status} currentState=${newState} lastConfirmedObject=${analyzer.getUltimoObjetoConfirmado() || 'none'} lastConfirmedEventId=${confirmedEventId || prevEvt || 'none'} confirmacoesConsecutivas=${analysis.candidateResult?.confirmacoesConsecutivas || 0} resultScreenGoneFramesCount=${analyzer.isResultScreenActuallyGone() ? 1 : 0} isNewScreenEntry=${analysis.status === 'confirmado' ? 'true' : 'false'} isDuplicate=${analysis.status === 'duplicado' ? 'true' : 'false'} duplicateReason=${analysis.status === 'duplicado' ? 'SAME_EVENT_ID' : 'NONE'} newRoundAllowed=${newState === 'WAITING_FOR_RESULT' || newState === 'RESULT_CONFIRMED' ? 'true' : 'false'} eventId=${newEvt} roundId=${roundLabel} resultConfirmed=${resultConfirmed} roundResult=${finalRoundResult || 'none'} supabaseInsert=${supabaseResult} historyAppend=${historyResult}`
      );
    }

    const statusFinalRound = (resultConfirmed && supabaseResult === 'SUCCESS' && historyResult === 'PASS') ? 'PASS' : 'FAIL';

    tableSummary.push({
      rodada: roundLabel,
      objeto: targetObj,
      recognizer: recognizedPass ? 'PASS' : 'FAIL',
      confirmed: resultConfirmed ? 'PASS' : 'FAIL',
      eventId: confirmedEventId || 'N/A',
      supabase: supabaseResult,
      historico: historyResult,
      statusPipeline: statusFinalRound,
      motivoPerda: statusFinalRound === 'FAIL' ? discardReason : undefined,
    });
  }

  // TABELA FINAL
  console.log('\n========================================================================');
  console.log('TABELA FINAL — COMPARATIVO DAS 10 RODADAS CONTÍNUAS');
  console.log('========================================================================');
  console.table(tableSummary);

  const totalPass = tableSummary.filter((r) => r.statusPipeline === 'PASS').length;
  console.log(`\nTOTAL APROVADO: ${totalPass} / 10 RODADAS`);
}

runRealContinuousWheelTest();
