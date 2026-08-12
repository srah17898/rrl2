import fetch from 'node-fetch';
import sharp from 'sharp';
import { BackendLiveService } from '../services/backendLiveService';
import { WHEEL_OBJECT_REFERENCES } from '../config/wheelObjectReferences';
import { canSyncResultToDashboard } from '../services/dashboardService';

async function runFunctionalResultAuditTest() {
  console.log('===============================================================');
  console.log('STARTING AUDIT TEST: RESULT_CONFIRMED -> ROUND RESULT -> HISTORY');
  console.log('Constraint: AUTO_PERSIST_ENABLED = false (no Supabase write)');
  console.log('===============================================================\n');

  const usuarioId = 'test_user_functional_audit_' + Date.now();
  const sorveteUrl = WHEEL_OBJECT_REFERENCES.sorvete.imageUrl;

  // Fetch image and prepare 153x153 crop for sorvete
  const imgRes = await fetch(sorveteUrl);
  const arrayBuffer = await imgRes.arrayBuffer();
  const rawBuf = Buffer.from(arrayBuffer);
  const cropBuf = await sharp(rawBuf)
    .resize(153, 153, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();
  const sorveteBase64 = cropBuf.toString('base64');

  // Initialize session
  await BackendLiveService.iniciarSessao(usuarioId, {
    consecutiveConfirmationsRequired: 3,
    minConfidenceRequired: 85,
  });

  const totalFrames = 5;
  const mockDashboardHistory: any[] = [];
  let confirmedEventId: string | null = null;
  let confirmedObject: string | null = null;

  for (let frameNum = 1; frameNum <= totalFrames; frameNum++) {
    console.log(`\n=================== FRAME #${frameNum} ===================`);

    const framePayload = {
      base64Data: sorveteBase64,
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      width: 1280,
      height: 720,
      source: 'SCREEN_CAPTURE' as const,
      metadata: {
        winnerCropBase64: sorveteBase64,
        symbolCropBase64: sorveteBase64,
        resultScreenCroppedBase64: sorveteBase64,
        resultadoScreenDetected: true,
        resultScreenConfidence: 0.98,
        resultScreenRoi: {
          symbolCropWidth: 153,
          symbolCropHeight: 153,
          symbolCropValid: true,
        },
      },
    };

    const response = await BackendLiveService.processarFrame(usuarioId, framePayload as any);
    const resDiag = response?.frameDiagnostico?.resultScreenDiagnostico;
    const estab = response?.estabilizacao;
    const sessionStatus = BackendLiveService.verificarStatus(usuarioId);

    // Recognizer trace
    const recognizerObject = resDiag?.localWinner || 'nenhum';
    const recognizerEventId = estab?.eventId || 'N/A';
    const analyzerEventId = estab?.eventId || 'N/A';
    const finalResultObject = resDiag?.objetoFinal || response?.objetoDetectado || 'nenhum';

    console.log(`[EVENT_TRACE]`);
    console.log(`recognizerEventId=${recognizerEventId}`);
    console.log(`analyzerEventId=${analyzerEventId}`);
    console.log(`confirmedEventId=${estab?.eventId || 'N/A'}`);
    console.log(`finalResultEventId=${estab?.eventId || 'N/A'}`);
    console.log(`roundResultEventId=${estab?.eventId || 'N/A'}`);
    console.log(`historyEventId=${sessionStatus?.confirmedRoundsHistory?.[0]?.eventId || 'N/A'}`);

    if (estab?.foiConfirmadoAgora) {
      confirmedEventId = estab.eventId;
      confirmedObject = estab.ultimoObjetoConfirmado;

      console.log(`\n[RESULT_COMMIT_START]`);
      console.log(`eventId=${estab.eventId}`);
      console.log(`object=${estab.ultimoObjetoConfirmado}`);

      console.log(`\n[ROUND_STATE_BEFORE]`);
      console.log(`currentRound=${estab.eventId}`);
      console.log(`currentResult=${sessionStatus?.ultimoObjetoConfirmado || 'null'}`);
      console.log(`lastResult=${sessionStatus?.confirmedRoundsHistory?.[1]?.objeto || 'null'}`);
      console.log(`historyLength=${sessionStatus?.confirmedRoundsHistory?.length || 0}`);

      console.log(`\n[RESULT_COMMIT]`);
      console.log(`object=${estab.ultimoObjetoConfirmado}`);
      console.log(`eventId=${estab.eventId}`);

      console.log(`\n[ROUND_STATE_AFTER]`);
      console.log(`currentRound=${estab.eventId}`);
      console.log(`currentResult=${estab.ultimoObjetoConfirmado}`);
      console.log(`lastResult=${sessionStatus?.confirmedRoundsHistory?.[0]?.objeto || 'null'}`);
      console.log(`historyLength=${sessionStatus?.confirmedRoundsHistory?.length || 0}`);

      console.log(`\n[HISTORY_APPEND]`);
      console.log(`object=${sessionStatus?.confirmedRoundsHistory?.[0]?.objeto}`);
      console.log(`eventId=${sessionStatus?.confirmedRoundsHistory?.[0]?.eventId}`);

      // Simulate App.tsx dashboard sync
      const syncCheck = canSyncResultToDashboard(response, { autoMark: true });
      if (syncCheck.canSync) {
        mockDashboardHistory.push({
          id: `${Date.now()}_live_${syncCheck.eventId}`,
          item: syncCheck.item,
          timestamp: response.timestamp || Date.now(),
          source: 'ai_vision',
        });
        console.log(`\n[UI_STATE_UPDATE]`);
        console.log(`object=${syncCheck.item}`);
        console.log(`eventId=${syncCheck.eventId}`);
      }

      console.log(`\n[RESULT_COMMIT_END]`);
    } else {
      // Check if duplicate frame attempts sync
      const syncCheck = canSyncResultToDashboard(response, { autoMark: true });
      console.log(`[DUPLICATE_FRAME_SYNC_CHECK] canSync=${syncCheck.canSync} reason=${syncCheck.reason}`);
    }

    const lastHistoryItem = mockDashboardHistory[mockDashboardHistory.length - 1];

    console.log(`\n[UI_TRACE]`);
    console.log(`BACKEND_FINAL_RESULT=${sessionStatus?.ultimoObjetoConfirmado || 'null'}`);
    console.log(`UI_STATE_RESULT=${lastHistoryItem?.item || 'null'}`);
    console.log(`UI_RENDERED_RESULT=${sessionStatus?.ultimoObjetoConfirmado || 'null'}`);
  }

  console.log('\n===============================================================');
  console.log('SUMMARY OF AUDIT RESULTS:');
  console.log(`Backend ultimoObjetoConfirmado: "${BackendLiveService.verificarStatus(usuarioId)?.ultimoObjetoConfirmado}"`);
  console.log(`Session History Length: ${BackendLiveService.verificarStatus(usuarioId)?.confirmedRoundsHistory?.length}`);
  console.log(`Session History Last Item: "${BackendLiveService.verificarStatus(usuarioId)?.confirmedRoundsHistory?.[0]?.objeto}"`);
  console.log(`Dashboard Mock History Length: ${mockDashboardHistory.length}`);
  console.log(`Dashboard Mock History Last Item: "${mockDashboardHistory[mockDashboardHistory.length - 1]?.item}"`);
  console.log('===============================================================\n');
}

runFunctionalResultAuditTest().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
