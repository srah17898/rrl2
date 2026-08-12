import { Router } from 'express';
import { BackendLiveService } from '../services/backendLiveService';
import { analyzeCropIsolated } from '../services/cropAnalyzerService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/live/connect
 * Inicia uma nova sessão Gemini Live API com controle de sessão única por usuário.
 */
router.post('/live/connect', async (req, res) => {
  try {
    const { usuarioId = 'default_user', config } = req.body || {};
    const status = await BackendLiveService.iniciarSessao(usuarioId, config);

    return res.json({
      sucesso: status.estado === 'conectado',
      status,
    });
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/connect:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Falha ao conectar à Gemini Live API.',
    });
  }
});

/**
 * POST /api/live/disconnect
 * Encerra a sessão Live ativa, calculando a duração e registrando os motivos.
 */
router.post('/live/disconnect', async (req, res) => {
  try {
    const { usuarioId = 'default_user', motivo = 'Encerramento solicitado pelo cliente' } = req.body || {};
    const status = await BackendLiveService.encerrarSessao(usuarioId, motivo);

    return res.json({
      sucesso: true,
      status,
    });
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/disconnect:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Falha ao encerrar a sessão Live.',
    });
  }
});

/**
 * GET /api/live/status
 * Verifica o status atual da sessão Gemini Live no backend.
 */
router.get('/live/status', (req, res) => {
  try {
    const usuarioId = (req.query.usuarioId as string) || 'default_user';
    const status = BackendLiveService.verificarStatus(usuarioId);

    return res.json({
      sucesso: true,
      status,
    });
  } catch (error: any) {
    logger.error('Erro na rota GET /api/live/status:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Erro ao consultar status da sessão Live.',
    });
  }
});

/**
 * POST /api/live/reconnect
 * Tenta reconectar automaticamente em caso de queda temporária de rede ou timeout.
 */
router.post('/live/reconnect', async (req, res) => {
  try {
    const { usuarioId = 'default_user' } = req.body || {};
    const status = await BackendLiveService.reconectar(usuarioId);

    return res.json({
      sucesso: status.estado === 'conectado',
      status,
    });
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/reconnect:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Falha ao reconectar sessão Live.',
    });
  }
});

/**
 * POST /api/live/frame
 * Recebe e processa efemeramente um frame de vídeo da Live API.
 */
router.post('/live/frame', async (req, res) => {
  const startTime = Date.now();
  const timestampIso = new Date().toISOString();
  try {
    const { usuarioId = 'default_user', framePayload, requestId = `req_${startTime}` } = req.body || {};
    const contentLen = req.headers['content-length'] || JSON.stringify(req.body || {}).length;
    const payloadSizeKB = (Number(contentLen) / 1024).toFixed(1);

    logger.info(`[BACKEND_FRAME_RECEIVED] timestamp="${timestampIso}" requestId="${requestId}" url="${req.originalUrl || req.url}" method="${req.method}" payloadSize="${payloadSizeKB}KB" usuarioId="${usuarioId}"`);

    if (!framePayload || !framePayload.base64Data) {
      logger.warn(`[BACKEND_FRAME_REJECTED] timestamp="${timestampIso}" requestId="${requestId}" reason="Payload do frame inválido ou sem dados base64" payloadSize="${payloadSizeKB}KB"`);
      return res.status(400).json({
        sucesso: false,
        error: 'Payload do frame inválido ou sem dados base64.',
      });
    }

    logger.info(`[BACKEND_FRAME_VALIDATED] timestamp="${timestampIso}" requestId="${requestId}" mimeType="${framePayload.mimeType || 'image/jpeg'}" width=${framePayload.width || 0} height=${framePayload.height || 0} payloadSize="${payloadSizeKB}KB"`);

    const resultado = await BackendLiveService.processarFrame(usuarioId, framePayload);
    const durationMs = Date.now() - startTime;

    const detectedList = resultado?.parsedPayload?.detectedItems || (resultado?.objetoDetectado ? [resultado.objetoDetectado] : []);
    const confidenceVal = resultado?.confianca || 0;
    const rawTxt = resultado?.rawText || resultado?.geminiRawResponse || '';

    logger.info(
      `[LIVE_RESPONSE_BUILD]\n` +
      `frameId: FRAME_${resultado?.frameDiagnostico?.timestamp || Date.now()}\n` +
      `httpStatus: 200\n` +
      `detectedItems: ${JSON.stringify(detectedList)}\n` +
      `confidence: ${confidenceVal}\n` +
      `confidenceScore: ${confidenceVal}\n` +
      `rawText: ${JSON.stringify(rawTxt)}\n` +
      `description: ${resultado?.geminiEstadoLog || ''}\n` +
      `modelUsed: ${resultado?.geminiPayloadInfo?.mimeType || 'gemini-3.6-flash'}\n` +
      `latencyMs: ${durationMs}`
    );

    const responsePayload = {
      sucesso: !!resultado,
      durationMs,
      requestId,
      backendReceived: true,
      backendProcessed: true,
      resultado,
    };

    logger.info(`[LIVE_RESPONSE_JSON] ${JSON.stringify(responsePayload)}`);

    return res.json(responsePayload);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logger.error(`[BACKEND_FRAME_REJECTED] timestamp="${timestampIso}" error="${error?.message}" durationMs=${durationMs}`);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Falha ao processar frame de vídeo da Live API.',
      durationMs,
      backendReceived: true,
      backendProcessed: false,
    });
  }
});

/**
 * GET /api/live/config
 * Retorna as configurações atuais do Reconhecedor Local e Fallback Gemini.
 */
router.get('/live/config', (req, res) => {
  try {
    const config = BackendLiveService.getLocalRecognizerConfig();
    return res.json({
      sucesso: true,
      config,
    });
  } catch (error: any) {
    logger.error('Erro na rota GET /api/live/config:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Erro ao consultar configuração do reconhecedor local.',
    });
  }
});

/**
 * POST /api/live/config
 * Atualiza configurações do Reconhecedor Local (ex: LOCAL_ONLY_MODE, GEMINI_FALLBACK_ENABLED, threshold).
 */
router.post('/live/config', (req, res) => {
  try {
    const newConfig = req.body || {};
    const updated = BackendLiveService.updateLocalRecognizerConfig(newConfig);
    return res.json({
      sucesso: true,
      config: updated,
    });
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/config:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Erro ao atualizar configuração do reconhecedor local.',
    });
  }
});

/**
 * POST /api/live/test-simulated-detection
 * Teste interno de diagnóstico para simulação de detecção e gravação no Supabase
 */
router.post('/live/test-simulated-detection', async (req, res) => {
  try {
    const { usuarioId = 'default_user', objeto = 'boia', confianca = 95 } = req.body || {};
    const resultado = await BackendLiveService.testSimulatedDetection(usuarioId, objeto, Number(confianca));
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/test-simulated-detection:', error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || 'Falha ao executar teste simulado de diagnóstico.',
    });
  }
});

/**
 * POST /api/live/analyze-crop
 * Teste direto do pipeline de visao do Gemini isolando o crop.
 */
router.post('/live/analyze-crop', async (req, res) => {
  try {
    const { imageBase64, base64Image, mimeType = 'image/jpeg' } = req.body || {};
    const imgData = imageBase64 || base64Image;
    const result = await analyzeCropIsolated(imgData, mimeType);
    return res.status(result.httpStatus || 200).json(result);
  } catch (error: any) {
    logger.error('Erro na rota POST /api/live/analyze-crop:', error?.message);
    return res.status(500).json({
      success: false,
      model: 'gemini-3.6-flash',
      httpStatus: 500,
      errorType: 'GEMINI_HTTP_ERROR',
      errorMessage: error?.message || 'Falha ao analisar crop no Gemini.',
      latencyMs: 0,
    });
  }
});

export default router;
