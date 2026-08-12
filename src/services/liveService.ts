import {
  LiveConnectionState,
  LiveEventType,
  LiveSessionConfig,
  LiveFramePayload,
  LiveResultPayload,
  LiveErrorPayload,
  LiveSessionStatus,
  LiveEventCallback,
  LiveMetrics,
  FrameTransportDebugInfo,
  FrameDiagnosticoInfo,
} from '../types/live';
import { logger } from '../utils/logger';
import { auditUrl } from '../utils/urlAuditor';
import { computeBase64Hash, computeBase64Bytes } from '../utils/hashUtils';
import {
  WHEEL_OBJECT_REFERENCES,
  isAllowedWheelObject,
  WheelObjectName,
} from '../config/wheelObjectReferences';

const CONFIG_PADRAO: LiveSessionConfig = {
  model: 'gemini-3.6-flash',
  fps: 1,
  sampleRate: 16000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectIntervalMs: 3000,
};

class LiveService {
  private estado: LiveConnectionState = 'desconectado';
  private sessionId: string | null = null;
  private usuarioId: string = 'default_user';
  private config: LiveSessionConfig = { ...CONFIG_PADRAO };
  private listeners: Set<LiveEventCallback> = new Set();
  private mensagemErro: string | null = null;
  private conectadoEm: string | null = null;
  private duracaoSegundos: number = 0;
  private motivoDesconexao: string | null = null;
  private tentativasReconexao: number = 0;
  private totalFramesEnviados: number = 0;
  private ultimoResultadoAt: number | null = null;
  private isProcessingReconnect: boolean = false;
  private statusPollingTimer: any = null;

  private ultimoObjetoConfirmado: string | null = null;
  private horarioUltimaConfirmacao: number | null = null;
  private confiancaUltimaConfirmacao: number | null = null;
  private totalRodadasDetectadasSessao: number = 0;
  private candidatoAtual: string | null = null;
  private confirmacoesConsecutivas: number = 0;
  private metricasServidor?: LiveMetrics;

  private ultimaRespostaBrutaGemini?: string;
  private ultimoEstadoGemini?: any;
  private ultimoFrameDiagnostico?: any;

  // Diagnóstico e métricas Gemini
  private geminiCallsCurrentRound: number = 0;
  private geminiCallsPerMinute: number = 0;
  private lastGeminiHttpStatus: number | string = 200;
  private lastGeminiError?: string;
  private lastGeminiErrorMessage?: string;
  private rateLimitActive: boolean = false;
  private analyzerState?: string;
  private currentEventId?: string;
  private geminiCallsAvoidedByScreenDetector: number = 0;

  // Cache local para preservação do WINNER CROP no cliente
  private lastLocalSymbolCropUrl?: string;
  private lastLocalWinnerCropUrl?: string;

  private transportDebug: FrameTransportDebugInfo = {
    captureStatus: 'OFF',
    lastFrameId: 0,
    lastCaptureTimestamp: '-',
    lastFetchUrl: '/api/live/frame',
    lastFetchStatus: 'IDLE',
    httpStatus: '-',
    payloadSizeKB: '0 KB',
    backendReceived: 'NO',
    backendProcessed: 'NO',
    lastError: null,
    lastErrorName: null,
    lastErrorStack: null,
    requestMethod: 'POST',
    urlClassification: auditUrl('/api/live/frame').classification,
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    baseUrl: typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000/',
    apiUrl: auditUrl('/api/live/frame').fullUrl,
  };

  /**
   * Armazena localmente a referência do crop de diagnóstico (153x153) para garantir
   * a exibição visual do WINNER CROP no cliente independente da sanitização de rede.
   */
  public preserveLocalCrop(info: {
    resultScreenCroppedDataUrl?: string;
    croppedDataUrl?: string;
    width?: number;
    height?: number;
  }): void {
    const url = info.resultScreenCroppedDataUrl || info.croppedDataUrl;
    if (url) {
      this.lastLocalSymbolCropUrl = url;
      console.log(`[CROP_DEBUG] stored=true urlAvailable=true width=${info.width || 153} height=${info.height || 153}`);
      logger.info(`[CROP_DEBUG] stored=true urlAvailable=true width=${info.width || 153} height=${info.height || 153}`);
    }
  }

  /**
   * Sanitiza o payload do frame para transmissão via rede.
   * Remove URLs de dados base64 pesadas (ex: previewUrl, croppedDataUrl, resultScreenCroppedDataUrl) de metadata,
   * preservando a imagem base64 real principal em base64Data e metadados leves.
   */
  private prepareSanitizedFramePayload(frame: LiveFramePayload): LiveFramePayload {
    const cleanBase64 = (frame.base64Data || '').replace(/^data:image\/\w+;base64,/, '');

    let sanitizedMetadata: Record<string, any> | undefined;
    if (frame.metadata) {
      // Strips only large data URLs, keeping raw base64 crop fields for backend processing
      const {
        previewUrl,
        croppedDataUrl,
        resultScreenCroppedDataUrl,
        winnerCropUrl,
        symbolCropUrl,
        ...restMeta
      } = frame.metadata;
      sanitizedMetadata = restMeta;
    }

    return {
      base64Data: cleanBase64,
      mimeType: frame.mimeType || 'image/jpeg',
      timestamp: frame.timestamp || Date.now(),
      frameIndex: frame.frameIndex,
      width: frame.width,
      height: frame.height,
      source: frame.source || 'SCREEN_CAPTURE',
      metadata: sanitizedMetadata,
    };
  }

  private ultimoStatusServidor: Partial<LiveSessionStatus> = {};

  /**
   * Retorna o status atual completo da sessão Live no cliente e no servidor.
   */
  public status(): LiveSessionStatus {
    return {
      ...this.ultimoStatusServidor,
      estado: this.estado,
      sessionId: this.sessionId,
      mensagemErro: this.mensagemErro,
      conectadoEm: this.conectadoEm,
      duracaoSegundos: this.duracaoSegundos,
      motivoDesconexao: this.motivoDesconexao,
      tentativasReconexao: this.tentativasReconexao,
      totalFramesEnviados: this.totalFramesEnviados,
      ultimoResultadoAt: this.ultimoResultadoAt,
      modelUtilizado: this.config.model,
      // Chamadas Gemini e Rate Limit
      geminiCallsCurrentRound: this.geminiCallsCurrentRound,
      geminiCallsPerMinute: this.geminiCallsPerMinute,
      lastGeminiHttpStatus: this.lastGeminiHttpStatus,
      lastGeminiError: this.lastGeminiError,
      lastGeminiErrorMessage: this.lastGeminiErrorMessage,
      rateLimitActive: this.rateLimitActive,
      analyzerState: this.analyzerState,
      currentEventId: this.currentEventId,
      geminiCallsAvoidedByScreenDetector: this.geminiCallsAvoidedByScreenDetector,
      // Estabilização e Registro
      ultimoObjetoConfirmado: this.ultimoObjetoConfirmado,
      horarioUltimaConfirmacao: this.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: this.confiancaUltimaConfirmacao,
      totalRodadasDetectadasSessao: this.totalRodadasDetectadasSessao,
      candidatoAtual: this.candidatoAtual,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      // Diagnóstico Bruto Gemini
      ultimaRespostaBrutaGemini: this.ultimaRespostaBrutaGemini,
      ultimoEstadoGemini: this.ultimoEstadoGemini,
      ultimoFrameDiagnostico: this.ultimoFrameDiagnostico,
      metricas: this.metricasServidor,
      frameTransportDebug: { ...this.transportDebug },
    };
  }

  /**
   * Alias de compatibilidade para verificação de status.
   */
  public async verificarStatus(): Promise<LiveSessionStatus> {
    try {
      const res = await fetch(`/api/live/status?usuarioId=${encodeURIComponent(this.usuarioId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.status) {
          this.atualizarStatusServidor(json.status);
        }
      }
    } catch (err: any) {
      logger.error('[LIVE CLIENT] Erro ao verificar status no servidor:', err?.message);
    }
    return this.status();
  }

  /**
   * Inscreve um callback para escutar eventos do LiveService.
   * Retorna a função de desinscrição.
   */
  public receberEventos(callback: LiveEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notifica todos os ouvintes registrados.
   */
  private emitirEvento(tipo: LiveEventType, payload?: any): void {
    this.listeners.forEach((cb) => {
      try {
        cb(tipo, payload);
      } catch (err) {
        logger.error(`[LIVE CLIENT] Erro ao executar listener para ${tipo}:`, err);
      }
    });
  }

  /**
   * Trata e formata erros ocorridos na sessão Live.
   */
  public tratarErros(erro: any): LiveErrorPayload {
    const mensagem = typeof erro === 'string' ? erro : erro?.message || 'Erro inesperado na sessão Live';
    const payload: LiveErrorPayload = {
      codigo: erro?.codigo || 'LIVE_ERR_GENERIC',
      mensagem,
      timestamp: Date.now(),
      fatal: this.tentativasReconexao >= (this.config.maxReconnectAttempts || 5),
    };

    this.mensagemErro = mensagem;
    this.emitirEvento('ERROR', payload);
    logger.error(`[LIVE CLIENT] [ERRO TRATADO]`, payload);

    return payload;
  }

  /**
   * Atualiza o estado da conexão e emite os eventos apropriados.
   */
  private setEstado(novoEstado: LiveConnectionState, erroMsg?: string): void {
    const estadoAnterior = this.estado;
    this.estado = novoEstado;

    if (erroMsg !== undefined) {
      this.mensagemErro = erroMsg;
    }

    logger.info(
      `[LIVE CLIENT] Transição de estado: ${estadoAnterior} -> ${novoEstado} | Session: ${this.sessionId || 'N/A'}`
    );

    if (novoEstado === 'conectado') {
      if (!this.conectadoEm) {
        this.conectadoEm = new Date().toISOString();
      }
      this.mensagemErro = null;
      this.tentativasReconexao = 0;
      this.iniciarPollingStatus();
      this.emitirEvento('LIVE_CONNECTED', { sessionId: this.sessionId });
    } else if (novoEstado === 'desconectado') {
      this.pararPollingStatus();
      this.sessionId = null;
      this.conectadoEm = null;
      this.emitirEvento('LIVE_DISCONNECTED', { estadoAnterior, motivo: this.motivoDesconexao });
    } else if (novoEstado === 'reconectando') {
      this.emitirEvento('LIVE_RECONNECTING', {
        tentativa: this.tentativasReconexao,
        maxTentativas: this.config.maxReconnectAttempts,
      });
    } else if (novoEstado === 'erro') {
      this.pararPollingStatus();
      this.tratarErros(this.mensagemErro || 'Erro no estado do LiveService');
    }
  }

  /**
   * Inicia uma nova sessão Gemini Live API através da integração do backend.
   * Regra de Ouro: Garante que apenas UMA sessão ativa exista por usuário.
   */
  public async iniciarSessaoLive(configPersonalizada?: Partial<LiveSessionConfig>): Promise<void> {
    if (this.estado === 'conectado' || this.estado === 'conectando') {
      logger.warn('[LIVE CLIENT] Encerrando sessão anterior antes de iniciar nova...');
      await this.encerrarSessao('Substituída por nova sessão');
    }

    this.config = { ...CONFIG_PADRAO, ...configPersonalizada };
    this.totalFramesEnviados = 0;
    this.ultimoResultadoAt = null;
    this.motivoDesconexao = null;

    this.setEstado('conectando');
    logger.info(`[LIVE CLIENT] Conectando à Gemini Live API via backend...`);

    try {
      const res = await fetch('/api/live/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: this.usuarioId,
          config: this.config,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `Erro do servidor (${res.status})`);
      }

      const json = await res.json();
      if (json.sucesso && json.status) {
        this.sessionId = json.status.sessionId;
        this.atualizarStatusServidor(json.status);
        this.setEstado('conectado');
        logger.info(`[LIVE CLIENT] Sessão Live (${this.sessionId}) iniciada com sucesso.`);
      } else {
        throw new Error(json.error || 'Não foi possível estabelecer sessão Live com servidor.');
      }
    } catch (error: any) {
      const msg = error?.message || 'Falha na comunicação com a Gemini Live API.';
      logger.error(`[LIVE CLIENT] Erro ao iniciar sessão:`, msg);
      this.setEstado('erro', msg);

      if (this.config.autoReconnect) {
        await this.reconectarAutomaticamente();
      }
    }
  }

  /**
   * Alias curto para iniciarSessao.
   */
  public async iniciarSessao(configPersonalizada?: Partial<LiveSessionConfig>): Promise<void> {
    return this.iniciarSessaoLive(configPersonalizada);
  }

  /**
   * Encerra a sessão Live atual no cliente e no servidor.
   */
  public async encerrarSessao(motivo: string = 'Encerramento pelo usuário'): Promise<void> {
    if (this.estado === 'desconectado') {
      return;
    }

    this.motivoDesconexao = motivo;
    logger.info(`[LIVE CLIENT] Encerrando sessão (${this.sessionId || 'ativa'}). Motivo: ${motivo}...`);

    try {
      await fetch('/api/live/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: this.usuarioId,
          motivo,
        }),
      });
    } catch (err: any) {
      logger.error('[LIVE CLIENT] Erro ao notificar servidor sobre encerramento:', err?.message);
    } finally {
      this.setEstado('desconectado');
    }
  }

  /**
   * Envia um frame de vídeo/imagem para o backend e a Live API.
   * Não salva a imagem/frame em nenhum armazenamento persistente.
   */
  public async enviarFrame(frame: LiveFramePayload): Promise<boolean> {
    const fullRes = await this.enviarFrameFull(frame);
    return !!fullRes;
  }

  /**
   * Envia um quadro de vídeo e retorna o resultado completo (LiveResultPayload).
   */
  public async enviarFrameFull(frame: LiveFramePayload): Promise<LiveResultPayload | null> {
    const frameId = frame.frameIndex || (this.totalFramesEnviados + 1);
    const nowIso = new Date().toISOString();
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substring(2, 7)}`;
    const urlAudit = auditUrl('/api/live/frame', 'POST');

    this.transportDebug.captureStatus = 'ON';
    this.transportDebug.lastFrameId = frameId;
    this.transportDebug.lastCaptureTimestamp = nowIso;
    this.transportDebug.lastFetchUrl = urlAudit.rawUrl;
    this.transportDebug.lastFetchStatus = 'PENDING';
    this.transportDebug.requestMethod = 'POST';
    this.transportDebug.origin = urlAudit.origin;
    this.transportDebug.baseUrl = urlAudit.baseUrl;
    this.transportDebug.apiUrl = urlAudit.apiUrl;
    this.transportDebug.urlClassification = urlAudit.classification;

    if (this.estado !== 'conectado') {
      logger.warn(`[LIVE CLIENT] Tentativa de enviar frame fora do ar (${this.estado}).`);
      this.transportDebug.lastFetchStatus = 'FAILED';
      this.transportDebug.httpStatus = 'DISCONNECTED';
      this.transportDebug.lastError = `Sessão fora do ar (estado: ${this.estado})`;
      return null;
    }

    if (!frame.base64Data) {
      logger.warn('[LIVE CLIENT] Frame recebido sem dados base64 válidos.');
      this.transportDebug.lastFetchStatus = 'FAILED';
      this.transportDebug.httpStatus = 'NO_BASE64';
      this.transportDebug.lastError = 'Frame sem dados base64 válidos';
      return null;
    }

    // Preserva o crop no cliente antes da sanitização para a rede
    if (frame.metadata?.resultScreenCroppedDataUrl || frame.metadata?.croppedDataUrl) {
      this.preserveLocalCrop({
        resultScreenCroppedDataUrl: frame.metadata.resultScreenCroppedDataUrl,
        croppedDataUrl: frame.metadata.croppedDataUrl,
        width: frame.metadata.resultScreenRoi?.symbolCropWidth || 153,
        height: frame.metadata.resultScreenRoi?.symbolCropHeight || 153,
      });
    }

    let sanitizedPayload: LiveFramePayload;
    let payloadJsonString: string;
    let payloadSizeKB = '0 KB';

    try {
      logger.info(`[FRAME_SERIALIZE_START] requestId="${requestId}" frameId=${frameId} mimeType="${frame.mimeType || 'image/jpeg'}"`);
      sanitizedPayload = this.prepareSanitizedFramePayload(frame);
      payloadJsonString = JSON.stringify({
        usuarioId: this.usuarioId,
        framePayload: sanitizedPayload,
        requestId,
      });
      const bytes = new TextEncoder().encode(payloadJsonString).length;
      payloadSizeKB = (bytes / 1024).toFixed(1) + ' KB';
      this.transportDebug.payloadSizeKB = payloadSizeKB;

      logger.info(`[FRAME_SERIALIZE_SUCCESS] requestId="${requestId}" frameId=${frameId} payloadSize="${payloadSizeKB}" cleanBase64Len=${sanitizedPayload.base64Data.length}`);
    } catch (serErr: any) {
      logger.error(`[FRAME_SERIALIZE_ERROR] requestId="${requestId}" frameId=${frameId} error="${serErr?.message}"`);
      this.transportDebug.lastFetchStatus = 'FAILED';
      this.transportDebug.httpStatus = 'SERIALIZE_ERROR';
      this.transportDebug.lastError = serErr?.message || 'Erro ao serializar payload do frame';
      return null;
    }

    try {
      this.totalFramesEnviados++;

      const winnerBase64 = sanitizedPayload.metadata?.winnerCropBase64 || sanitizedPayload.metadata?.resultScreenCroppedBase64 || sanitizedPayload.metadata?.croppedBase64 || sanitizedPayload.base64Data;
      const winnerBytes = computeBase64Bytes(winnerBase64);
      const winnerHash = computeBase64Hash(winnerBase64);
      const winnerW = sanitizedPayload.metadata?.resultScreenRoi?.symbolCropWidth || 153;
      const winnerH = sanitizedPayload.metadata?.resultScreenRoi?.symbolCropHeight || 153;

      logger.info(
        `[LIVE_REAL] POST /api/live/frame\n` +
        `[WINNER_CROP] size=${winnerW}x${winnerH} bytes=${winnerBytes} hash=${winnerHash}`
      );

      logger.info(
        `[FRAME_FETCH_START] timestamp="${nowIso}" sessionId="${this.sessionId || 'N/A'}" requestId="${requestId}" frameId=${frameId} url="${urlAudit.fullUrl}" rawUrl="${urlAudit.rawUrl}" method="POST" payloadSize="${payloadSizeKB}" origin="${urlAudit.origin}" baseUrl="${urlAudit.baseUrl}" urlType="${urlAudit.classification.isRelative ? 'relative' : 'absolute'}"`
      );

      const res = await fetch('/api/live/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadJsonString,
      });

      const durationMs = Date.now() - startTime;
      this.transportDebug.httpStatus = `${res.status} ${res.statusText}`;

      logger.info(
        `[LIVE_REAL] POST /api/live/frame\n` +
        `[LIVE_REAL] HTTP_STATUS: ${res.status} ${res.statusText}\n` +
        `[LIVE_REAL] LATENCY: ${durationMs}ms`
      );

      if (!res.ok) {
        logger.error(
          `[FRAME_FETCH_ERROR] timestamp="${new Date().toISOString()}" sessionId="${this.sessionId || 'N/A'}" requestId="${requestId}" frameId=${frameId} url="${urlAudit.fullUrl}" method="POST" httpStatus=${res.status} durationMs=${durationMs} errorName="HTTP_${res.status}" errorMessage="HTTP status ${res.status}" payloadSize="${payloadSizeKB}"`
        );
        this.transportDebug.lastFetchStatus = 'FAILED';
        this.transportDebug.backendReceived = 'NO';
        this.transportDebug.backendProcessed = 'NO';
        this.transportDebug.lastError = `HTTP ${res.status} ${res.statusText}`;
        return null;
      }

      const json = await res.json();

      logger.info(
        `[FRONTEND_LIVE_RESPONSE] HTTP=${res.status} typeof=${typeof json} keys=${JSON.stringify(Object.keys(json || {}))} BODY_KEYS=${JSON.stringify(Object.keys(json?.resultado || {}))}`
      );
      logger.info(
        `[FRONTEND_LIVE_RESPONSE_DETAILS] sucesso=${json?.sucesso} object=${json?.resultado?.objetoDetectado} confidence=${json?.resultado?.confianca} rawTextLength=${json?.resultado?.rawText?.length} geminiEstadoLog=${json?.resultado?.geminiEstadoLog}`
      );

      this.transportDebug.lastFetchStatus = 'SUCCESS';
      this.transportDebug.backendReceived = json.backendReceived ? 'YES' : 'YES';
      this.transportDebug.backendProcessed = json.backendProcessed ? 'YES' : (json.sucesso ? 'YES' : 'NO');
      this.transportDebug.lastError = null;
      this.transportDebug.lastErrorName = null;
      this.transportDebug.lastErrorStack = null;

      logger.info(
        `[FRAME_FETCH_SUCCESS] timestamp="${new Date().toISOString()}" sessionId="${this.sessionId || 'N/A'}" requestId="${requestId}" frameId=${frameId} url="${urlAudit.fullUrl}" method="POST" httpStatus=${res.status} durationMs=${durationMs} backendReceived=YES backendProcessed=${this.transportDebug.backendProcessed}`
      );

      if (json.sucesso && json.resultado) {
        this.injetarResultadoLive(json.resultado);
        return json.resultado as LiveResultPayload;
      }
      return null;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorName = err?.name || 'FetchError';
      const errorMessage = err?.message || 'Failed to fetch';
      const errorStack = err?.stack || '';

      this.transportDebug.lastFetchStatus = 'FAILED';
      this.transportDebug.httpStatus = errorName;
      this.transportDebug.backendReceived = 'NO';
      this.transportDebug.backendProcessed = 'NO';
      this.transportDebug.lastError = errorMessage;
      this.transportDebug.lastErrorName = errorName;
      this.transportDebug.lastErrorStack = errorStack;

      logger.error(
        `[FRAME_FETCH_ERROR] timestamp="${new Date().toISOString()}" sessionId="${this.sessionId || 'N/A'}" requestId="${requestId}" frameId=${frameId} url="${urlAudit.fullUrl}" rawUrl="${urlAudit.rawUrl}" method="POST" durationMs=${durationMs} errorName="${errorName}" errorMessage="${errorMessage}" errorStack="${errorStack.replace(/\n/g, ' ')}" origin="${urlAudit.origin}" baseUrl="${urlAudit.baseUrl}" apiUrl="${urlAudit.apiUrl}" isRelative=${urlAudit.classification.isRelative} isHttps=${urlAudit.classification.isHttps} payloadSize="${payloadSizeKB}"`
      );

      return null;
    }
  }

  /**
   * Injeta e emite um resultado de análise recebido da Live API.
   */
  public injetarResultadoLive(payload: LiveResultPayload): void {
    this.ultimoResultadoAt = Date.now();

    if (payload.geminiRawResponse !== undefined) {
      this.ultimaRespostaBrutaGemini = payload.geminiRawResponse;
    }
    if (payload.geminiEstadoLog !== undefined) {
      this.ultimoEstadoGemini = payload.geminiEstadoLog;
    }

    if (payload.frameDiagnostico) {
      if (!payload.frameDiagnostico.resultScreenDiagnostico) {
        payload.frameDiagnostico.resultScreenDiagnostico = {
          resultadoScreenDetected: !!this.lastLocalSymbolCropUrl,
          confidence: 1.0,
          symbolCropWidth: 153,
          symbolCropHeight: 153,
          symbolCropValid: !!this.lastLocalSymbolCropUrl,
          croppedDataUrl: this.lastLocalSymbolCropUrl,
          symbolCropUrl: this.lastLocalSymbolCropUrl,
        };
      }

      const resDiag = payload.frameDiagnostico.resultScreenDiagnostico;
      if (!resDiag.croppedDataUrl && this.lastLocalSymbolCropUrl) {
        resDiag.croppedDataUrl = this.lastLocalSymbolCropUrl;
      }
      if (!resDiag.symbolCropUrl) {
        resDiag.symbolCropUrl = resDiag.croppedDataUrl || this.lastLocalSymbolCropUrl;
      }

      const winnerObj =
        resDiag.objetoFinal ||
        resDiag.simboloCandidatoVisual ||
        resDiag.objetoGemini ||
        payload.objetoDetectado ||
        this.ultimoObjetoConfirmado;

      if (winnerObj && isAllowedWheelObject(winnerObj)) {
        const catalogImg = WHEEL_OBJECT_REFERENCES[winnerObj as WheelObjectName]?.imageUrl;
        resDiag.winnerCropUrl = resDiag.symbolCropUrl || catalogImg;
        this.lastLocalWinnerCropUrl = resDiag.winnerCropUrl;
        console.log(
          `[WINNER_CROP_DEBUG] winner=${winnerObj} cropAvailable=${!!resDiag.winnerCropUrl} width=${resDiag.symbolCropWidth || 153} height=${resDiag.symbolCropHeight || 153}`
        );
      } else if (resDiag.symbolCropUrl) {
        resDiag.winnerCropUrl = resDiag.symbolCropUrl;
        this.lastLocalWinnerCropUrl = resDiag.symbolCropUrl;
        console.log(
          `[WINNER_CROP_DEBUG] winner=pending cropAvailable=true width=${resDiag.symbolCropWidth || 153} height=${resDiag.symbolCropHeight || 153}`
        );
      }

      this.ultimoFrameDiagnostico = payload.frameDiagnostico;
    }

    if (payload.estabilizacao) {
      this.candidatoAtual = payload.estabilizacao.candidatoAtual;
      this.confirmacoesConsecutivas = payload.estabilizacao.confirmacoesConsecutivas;

      if (payload.estabilizacao.foiConfirmadoAgora) {
        this.ultimoObjetoConfirmado = payload.estabilizacao.ultimoObjetoConfirmado;
        this.horarioUltimaConfirmacao = payload.estabilizacao.horarioUltimaConfirmacao;
        this.confiancaUltimaConfirmacao = payload.estabilizacao.confiancaUltimaConfirmacao;
        this.totalRodadasDetectadasSessao = payload.estabilizacao.totalRodadasDetectadasSessao;

        logger.info(
          `[LIVE CLIENT] [RODADA CONFIRMADA] Item: "${this.ultimoObjetoConfirmado}" (${this.confiancaUltimaConfirmacao}% conf). Emitindo RESULT_CONFIRMED.`
        );
        this.emitirEvento('RESULT_CONFIRMED', payload);
      }
    }

    this.emitirEvento('RESULT_RECEIVED', payload);
    logger.info(`[LIVE CLIENT] Resultado recebido: ${payload.objetoDetectado || 'Nenhum'} | Estado: ${payload.geminiEstadoLog || 'N/A'}`);
  }

  /**
   * Tenta reconectar a sessão automaticamente em caso de falha de conexão ou timeout.
   */
  public async reconectarAutomaticamente(): Promise<void> {
    if (this.isProcessingReconnect) return;
    this.isProcessingReconnect = true;

    const maxTentativas = this.config.maxReconnectAttempts || 5;

    if (this.tentativasReconexao >= maxTentativas) {
      logger.error(`[LIVE CLIENT] Limite de ${maxTentativas} tentativas de reconexão atingido.`);
      this.setEstado('erro', `Limite máximo de ${maxTentativas} tentativas de reconexão excedido.`);
      this.isProcessingReconnect = false;
      return;
    }

    this.tentativasReconexao++;
    this.setEstado('reconectando');

    logger.info(
      `[LIVE CLIENT] Tentativa de reconexão #${this.tentativasReconexao}/${maxTentativas}...`
    );

    try {
      const res = await fetch('/api/live/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: this.usuarioId }),
      });

      if (!res.ok) {
        throw new Error(`Falha no servidor ao reconectar (${res.status})`);
      }

      const json = await res.json();
      if (json.sucesso && json.status) {
        this.sessionId = json.status.sessionId;
        this.atualizarStatusServidor(json.status);
        this.setEstado('conectado');
        logger.info(`[LIVE CLIENT] Reconectado com sucesso na tentativa #${this.tentativasReconexao}.`);
      } else {
        throw new Error(json.error || 'Servidor recusou reconexão.');
      }
    } catch (err: any) {
      logger.error(`[LIVE CLIENT] Falha na reconexão #${this.tentativasReconexao}:`, err?.message);
      this.tratarErros(`Falha na reconexão #${this.tentativasReconexao}: ${err?.message}`);

      if (this.tentativasReconexao < maxTentativas) {
        setTimeout(() => {
          this.isProcessingReconnect = false;
          this.reconectarAutomaticamente();
        }, this.config.reconnectIntervalMs || 3000);
        return;
      }
    } finally {
      this.isProcessingReconnect = false;
    }
  }

  /**
   * Alias curto para reconectar.
   */
  public async reconectar(): Promise<void> {
    return this.reconectarAutomaticamente();
  }

  /**
   * Executa um teste de diagnóstico interno com objeto simulado (PROMPT LIVE - TESTE CONTROLADO)
   */
  public async executarTesteSimulado(objeto: string = 'boia', confianca: number = 95) {
    try {
      const res = await fetch('/api/live/test-simulated-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: this.usuarioId,
          objeto,
          confianca,
        }),
      });

      const data = await res.json();

      const cleanObj = objeto.trim().toLowerCase();
      const catalogImg = isAllowedWheelObject(cleanObj)
        ? WHEEL_OBJECT_REFERENCES[cleanObj as WheelObjectName]?.imageUrl
        : undefined;

      const simCropUrl = this.lastLocalSymbolCropUrl || catalogImg;

      const frameDiag: FrameDiagnosticoInfo = {
        largura: 640,
        altura: 480,
        mimeType: 'image/jpeg',
        tamanhoBytes: 15000,
        tamanhoKB: '15.0 KB',
        timestamp: Date.now(),
        fonte: 'SIMULATION',
        conteudoVisual: true,
        detalhesVisual: `Teste Simulado: ${cleanObj} (${confianca}%)`,
        resultScreenDiagnostico: {
          resultadoScreenDetected: true,
          confidence: confianca / 100,
          symbolCropWidth: 153,
          symbolCropHeight: 153,
          symbolCropValid: true,
          croppedDataUrl: simCropUrl,
          symbolCropUrl: simCropUrl,
          winnerCropUrl: catalogImg || simCropUrl,
          simboloCandidatoVisual: cleanObj,
          scoreVisual: confianca,
          objetoFinal: cleanObj,
          confiancaFinal: confianca,
          referenciaComparada: catalogImg,
        },
      };

      const simPayload: LiveResultPayload = {
        sucesso: true,
        objetoDetectado: cleanObj,
        confianca,
        geminiEstadoLog: 'GEMINI_OBJECT_DETECTED',
        geminiRawResponse: JSON.stringify({ detectedItems: [cleanObj], confidenceScore: confianca }),
        rawText: JSON.stringify({ detectedItems: [cleanObj], confidenceScore: confianca }),
        frameDiagnostico: frameDiag,
        timestamp: Date.now(),
        parsedPayload: data,
      };

      this.injetarResultadoLive(simPayload);

      // Força atualização de status após o teste
      await this.verificarStatus();

      this.emitirEvento('RESULT_RECEIVED', simPayload);

      return simPayload;
    } catch (err: any) {
      logger.error('[LIVE CLIENT] Erro ao executar teste simulado:', err?.message);
      return {
        sucesso: false,
        erro: err?.message || 'Falha na requisição de teste simulado.',
      };
    }
  }

  private atualizarStatusServidor(statusSrv: LiveSessionStatus): void {
    this.ultimoStatusServidor = { ...this.ultimoStatusServidor, ...statusSrv };
    if (statusSrv.sessionId) this.sessionId = statusSrv.sessionId;
    if (statusSrv.conectadoEm) this.conectadoEm = statusSrv.conectadoEm;
    if (statusSrv.duracaoSegundos) this.duracaoSegundos = statusSrv.duracaoSegundos;
    if (statusSrv.motivoDesconexao) this.motivoDesconexao = statusSrv.motivoDesconexao;
    if (statusSrv.totalFramesEnviados) this.totalFramesEnviados = statusSrv.totalFramesEnviados;
    if (statusSrv.ultimoResultadoAt) this.ultimoResultadoAt = statusSrv.ultimoResultadoAt;
    if (statusSrv.geminiCallsCurrentRound !== undefined) this.geminiCallsCurrentRound = statusSrv.geminiCallsCurrentRound;
    if (statusSrv.geminiCallsPerMinute !== undefined) this.geminiCallsPerMinute = statusSrv.geminiCallsPerMinute;
    if (statusSrv.lastGeminiHttpStatus !== undefined) this.lastGeminiHttpStatus = statusSrv.lastGeminiHttpStatus;
    if (statusSrv.lastGeminiError !== undefined) this.lastGeminiError = statusSrv.lastGeminiError;
    if (statusSrv.lastGeminiErrorMessage !== undefined) this.lastGeminiErrorMessage = statusSrv.lastGeminiErrorMessage;
    if (statusSrv.rateLimitActive !== undefined) this.rateLimitActive = statusSrv.rateLimitActive;
    if (statusSrv.analyzerState !== undefined) this.analyzerState = statusSrv.analyzerState;
    if (statusSrv.currentEventId !== undefined) this.currentEventId = statusSrv.currentEventId;
    if (statusSrv.geminiCallsAvoidedByScreenDetector !== undefined) this.geminiCallsAvoidedByScreenDetector = statusSrv.geminiCallsAvoidedByScreenDetector;
    if (statusSrv.ultimoObjetoConfirmado !== undefined) this.ultimoObjetoConfirmado = statusSrv.ultimoObjetoConfirmado;
    if (statusSrv.horarioUltimaConfirmacao !== undefined) this.horarioUltimaConfirmacao = statusSrv.horarioUltimaConfirmacao;
    if (statusSrv.confiancaUltimaConfirmacao !== undefined) this.confiancaUltimaConfirmacao = statusSrv.confiancaUltimaConfirmacao;
    if (statusSrv.totalRodadasDetectadasSessao !== undefined) this.totalRodadasDetectadasSessao = statusSrv.totalRodadasDetectadasSessao;
    if (statusSrv.candidatoAtual !== undefined) this.candidatoAtual = statusSrv.candidatoAtual;
    if (statusSrv.confirmacoesConsecutivas !== undefined) this.confirmacoesConsecutivas = statusSrv.confirmacoesConsecutivas;
    if (statusSrv.ultimaRespostaBrutaGemini !== undefined) this.ultimaRespostaBrutaGemini = statusSrv.ultimaRespostaBrutaGemini;
    if (statusSrv.ultimoEstadoGemini !== undefined) this.ultimoEstadoGemini = statusSrv.ultimoEstadoGemini;
    if (statusSrv.ultimoFrameDiagnostico !== undefined) this.ultimoFrameDiagnostico = statusSrv.ultimoFrameDiagnostico;
    if (statusSrv.metricas !== undefined) this.metricasServidor = statusSrv.metricas;
  }

  private iniciarPollingStatus(): void {
    this.pararPollingStatus();
    this.statusPollingTimer = setInterval(() => {
      if (this.estado === 'conectado') {
        this.verificarStatus();
      }
    }, 10000);
  }

  private pararPollingStatus(): void {
    if (this.statusPollingTimer) {
      clearInterval(this.statusPollingTimer);
      this.statusPollingTimer = null;
    }
  }
}

// Exporta a instância única Singleton do LiveService para o frontend
export const liveService = new LiveService();
