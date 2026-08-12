import { BackendLiveService } from '../services/backendLiveService';
import { logger } from '../utils/logger';

async function runScreenCaptureDiagnosticTest() {
  console.log('=== FARM FISHING — DIAGNÓSTICO DO PIPELINE SCREEN_CAPTURE ===\n');

  const usuarioId = 'test_screencapture_user';

  // 1. Iniciar Sessão Live Backend
  console.log('1. Iniciando sessão de teste backend...');
  const statusInicio = await BackendLiveService.iniciarSessao(usuarioId, {
    consecutiveConfirmationsRequired: 1,
    minConfidenceRequired: 85,
  });
  console.log(`✓ Sessão iniciada: ID=${statusInicio.sessionId}, Estado=${statusInicio.estado}\n`);

  // 2. Gerar JPEG Base64 de Teste Realista (1280x720)
  console.log('2. Testando envio de Frame Real para /api/live/frame...');
  
  // Imagem base64 válida de exemplo JPEG
  const validJpegBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  const tStart = Date.now();
  const resFrame = await BackendLiveService.processarFrame(usuarioId, {
    base64Data: validJpegBase64,
    mimeType: 'image/jpeg',
    timestamp: tStart,
    width: 1280,
    height: 720,
    source: 'SCREEN_CAPTURE',
    metadata: {
      statusCongelamento: 'FRAME_ATUALIZANDO',
      qualidadeJpeg: 0.85,
      mediaStreamInfo: {
        width: 1280,
        height: 720,
        frameRate: 30,
        displaySurface: 'window',
        label: 'Window: scrcpy',
      },
    },
  });
  const tEnd = Date.now();

  console.log('✓ Resultado do Envio de Frame:', JSON.stringify({
    tempoMs: tEnd - tStart,
    resFrame
  }, null, 2));

  // 3. Encerrar sessão
  console.log('\n3. Encerrando sessão...');
  await BackendLiveService.encerrarSessao(usuarioId, 'Fim do teste de diagnóstico');

  console.log('\n=== PIPELINE DE DIAGNÓSTICO SCREEN_CAPTURE PRONTO ===');
}

runScreenCaptureDiagnosticTest().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
