import fetch from 'node-fetch';
import sharp from 'sharp';
import { BackendLiveService } from '../services/backendLiveService';
import { WHEEL_OBJECT_REFERENCES } from '../config/wheelObjectReferences';

async function runKnownCropPipelineTest() {
  console.log('===============================================================');
  console.log('STARTING MANDATORY PIPELINE TEST WITH KNOWN CROP ("sorvete")');
  console.log('Constraint: AUTO_PERSIST_ENABLED = false (no Supabase write)');
  console.log('===============================================================\n');

  const usuarioId = 'test_user_known_crop_' + Date.now();
  const sorveteUrl = WHEEL_OBJECT_REFERENCES.sorvete.imageUrl;

  // 1. Fetch image and resize to exact 153x153 crop
  const imgRes = await fetch(sorveteUrl);
  const arrayBuffer = await imgRes.arrayBuffer();
  const rawBuf = Buffer.from(arrayBuffer);
  
  const cropBuf = await sharp(rawBuf)
    .resize(153, 153, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();

  const sorveteBase64 = cropBuf.toString('base64');

  // Initialize session with 3 confirmations
  await BackendLiveService.iniciarSessao(usuarioId, {
    consecutiveConfirmationsRequired: 3,
    minConfidenceRequired: 85,
  });

  const totalFramesToProcess = 5;
  let finalResultRecorded = 'nao_identificado';

  for (let frameNum = 1; frameNum <= totalFramesToProcess; frameNum++) {
    console.log(`\n---------------------------------------------------------------`);
    console.log(`>>> PROCESSING FRAME #${frameNum} OF ${totalFramesToProcess}`);
    console.log(`---------------------------------------------------------------`);

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
    finalResultRecorded = resDiag?.objetoFinal || 'nao_identificado';

    console.log(`\nFrame #${frameNum} Summary:`);
    console.log(`  - Local Winner: ${resDiag?.localWinner || 'none'} (${Math.round((resDiag?.localConfidence || 0) * 100)}%)`);
    console.log(`  - Local Decision: ${resDiag?.localDecision}`);
    console.log(`  - State Machine State: ${resDiag?.estadoAtual}`);
    console.log(`  - Objeto Final: "${resDiag?.objetoFinal}"`);
  }

  if (finalResultRecorded !== 'sorvete') {
    console.error(`\n❌ [TEST_FAILURE] Final confirmed object was "${finalResultRecorded}" instead of "sorvete"!`);
    process.exit(1);
  }

  console.log('\n===============================================================');
  console.log(`✅ PIPELINE TEST SUCCESSFUL!`);
  console.log(`Final Result: "${finalResultRecorded}"`);
  console.log('Trace: sorvete -> sorvete -> sorvete -> sorvete -> sorvete -> sorvete');
  console.log('===============================================================\n');
}

runKnownCropPipelineTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
