/**
 * Definições do Módulo Gemini Live API (PROMPT LIVE 001 - LIVE 004)
 */

export type LiveConnectionState =
  | 'desconectado'
  | 'conectando'
  | 'conectado'
  | 'reconectando'
  | 'erro';

export type LiveEventType =
  | 'LIVE_CONNECTED'
  | 'LIVE_DISCONNECTED'
  | 'LIVE_RECONNECTING'
  | 'FRAME_SENT'
  | 'RESULT_RECEIVED'
  | 'RESULT_CONFIRMED'
  | 'ERROR';

export interface LiveSessionConfig {
  sessionId?: string;
  model?: string;
  fps?: number;
  sampleRate?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectIntervalMs?: number;
  consecutiveConfirmationsRequired?: number; // Padrão: 3 confirmações
  minConfidenceRequired?: number; // Padrão: 90%
}

export interface LiveFramePayload {
  base64Data: string; // Base64 da imagem/frame
  mimeType?: string; // 'image/jpeg' ou 'image/png'
  timestamp?: number;
  frameIndex?: number;
  width?: number;
  height?: number;
  source?: string;
  metadata?: Record<string, any>;
}

export interface LiveLatencyInfo {
  timestampFrameCapturado: number;
  timestampFrameEnviado: number;
  timestampRespostaGemini: number;
  timestampDeteccao: number;
  timestampConfirmacao?: number | null;
  timestampRegistroSupabase?: number | null;
  latenciaCapturaParaDeteccaoMs: number;
  latenciaDeteccaoParaRegistroMs?: number | null;
  latenciaTotalMs: number;
}

export interface LiveStabilizationInfo {
  candidatoAtual: string | null;
  confirmacoesConsecutivas: number;
  confirmacoesNecessarias: number;
  minConfidence: number;
  foiConfirmadoAgora: boolean;
  ultimoObjetoConfirmado: string | null;
  horarioUltimaConfirmacao: number | null;
  confiancaUltimaConfirmacao: number | null;
  totalRodadasDetectadasSessao: number;
  motivoEstabilizacao: string;
  gravadoNoSupabase: boolean;
  rodadaRegistrada?: number | null;
  estadoAnalyzer?: string;
  eventId?: string | null;
  syncedToDashboard?: boolean;
  syncedEventId?: string | null;
  latencia?: LiveLatencyInfo;
  // Métricas de Diagnóstico Anti-Duplicação e Estabilidade
  sceneStability?: {
    score: number;
    state: 'ESTÁVEL' | 'TRANSIÇÃO' | 'INSTÁVEL';
  };
  wheelPhase?: 'DETECÇÃO' | 'ESTABILIZAÇÃO' | 'RESULTADO' | 'TRANSIÇÃO';
  tempoEstavelMs?: number;
  framesRecebidos?: number;
  deteccoesGemini?: number;
  candidatosCriados?: number;
  confirmacoes?: number;
  tentativasPersistencia?: number;
  registrosCriados?: number;
  duplicacoesBloqueadas?: number;
}

export type GeminiEstadoLog =
  | 'GEMINI_NO_RESPONSE'
  | 'GEMINI_TEXT_RESPONSE'
  | 'GEMINI_OBJECT_DETECTED'
  | 'GEMINI_NO_OBJECT'
  | 'GEMINI_AGUARDANDO'
  | 'GEMINI_INVALID_JSON'
  | 'GEMINI_PARSE_ERROR'
  | 'GEMINI_REQUEST_PENDING'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_REQUEST_ERROR'
  | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_REQUEST_BLOCKED'
  | 'LOCAL_ONLY_MODE'
  | 'LOCAL_RECOGNIZER_ACTIVE';

export type GeminiStatusTag =
  | 'GEMINI_AGUARDANDO'
  | 'GEMINI_NO_RESPONSE'
  | 'GEMINI_NO_OBJECT'
  | 'GEMINI_INVALID_JSON'
  | 'GEMINI_OBJECT_DETECTED'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_REQUEST_ERROR'
  | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_REQUEST_BLOCKED'
  | 'LOCAL_ONLY_MODE'
  | 'LOCAL_RECOGNIZER_ACTIVE';

export type AnalyzerStatusTag =
  | 'ANALYZER_DISCARDED'
  | 'ANALYZER_CONFIRMED'
  | 'ANALYZER_CANDIDATE'
  | 'ANALYZER_WAITING_CHANGE'
  | 'ANALYZER_IDLE';

export interface RecentFrameTraceEntry {
  frameId: number;
  sessionId: string;
  connectionId: string;
  timestamp: number;
  geminiRaw: string;
  geminiObjeto: string;
  geminiConfianca: number;
  parserObjeto: string;
  parserConfianca: number;
  analyzerStateBefore: string;
  analyzerStateAfter: string;
  candidate: string | null;
  confirmationCount: number;
  lastConfirmedObject: string | null;
  currentEventId: string | null;
  confirmedNow: boolean;
  geminiTag: GeminiStatusTag;
  analyzerTag: AnalyzerStatusTag;
  persistAttempt: boolean; // Sempre false
  wheelPhase?: string;
  sceneStabilityScore?: number;
  sceneStabilityState?: string;
  tempoEstavelMs?: number;
}

export interface ConfirmedRoundHistoryEntry {
  timestamp: number;
  objeto: string;
  confianca: number;
  eventId: string;
  estado: string;
  persistido: string; // Ex: "NÃO (PERSISTÊNCIA DESABILITADA)"
}

export interface MediaStreamDiagnosticoInfo {
  width?: number;
  height?: number;
  frameRate?: number;
  displaySurface?: string;
  logicalSurface?: boolean;
  label?: string;
  videoWidth?: number;
  videoHeight?: number;
}

export interface WheelROIDiagnosticoInfo {
  roiFound: boolean;
  roiConfidence: number;
  roiX: number;
  roiY: number;
  roiWidth: number;
  roiHeight: number;
  originalWidth: number;
  originalHeight: number;
  status: 'RODA LOCALIZADA' | 'RODA NÃO LOCALIZADA';
  croppedDataUrl?: string;
  originalDataUrl?: string;
  reason?: string;
}

export interface ResultScreenDiagnosticoInfo {
  resultadoScreenDetected: boolean;
  confidence: number;
  estadoAtual?: string;
  tempoDesdeDeteccaoMs?: number;
  framesAnalisadosJanela?: number;
  candidatoAtual?: string | null;
  confirmacoesConsecutivas?: number;
  resultadoConfirmado?: string | null;
  eventId?: string | null;

  // Métricas do Modal da Tela de Resultado (RESULT_SCREEN)
  resultScreenX?: number;
  resultScreenY?: number;
  resultScreenWidth?: number;
  resultScreenHeight?: number;
  resultScreenCenterX?: number;
  resultScreenCenterY?: number;

  // Métricas do Recorte Quadrado do Símbolo Vencedor (SYMBOL_CROP)
  symbolCropX?: number;
  symbolCropY?: number;
  symbolCropWidth?: number;
  symbolCropHeight?: number;
  symbolCropCenterX?: number;
  symbolCropCenterY?: number;
  symbolCropValid?: boolean;
  distanciaCentroModalParaCentroCrop?: number;
  misaligned?: boolean;

  // Compatibilidade com campos antigos
  roiX?: number;
  roiY?: number;
  roiWidth?: number;
  roiHeight?: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  centerX?: number;
  centerY?: number;
  absCropX?: number;
  absCropY?: number;
  absCropWidth?: number;
  absCropHeight?: number;
  posicaoVertical?: string;
  roiValida?: boolean;

  // Comparação Visual com 8 Referências Oficiais (Reconhecedor Local)
  reconhecimentoMetodo?: 'LOCAL' | 'GEMINI' | 'NENHUM';
  localRecognitionEnabled?: boolean;
  geminiFallbackEnabled?: boolean;
  localOnlyMode?: boolean;
  localConfidenceThreshold?: number;
  localWinner?: string | null;
  localConfidence?: number;
  localSecondCandidate?: string | null;
  localGap?: number;
  localDecision?: 'ACCEPT' | 'REJECT' | 'AMBIGUOUS';
  geminiFallbackTriggered?: boolean;
  geminiFallbackReason?: string;
  localScoresPorObjeto?: Record<string, number>;

  gateInfo?: {
    status: 'NORMAL' | 'CANDIDATE' | 'CONFIRMED';
    score: number;
    stableFrames: number;
    maxStableFrames: number;
    recognitionAllowed: boolean;
    blockReason: string;
  };

  cropDiagnosticInfo?: {
    width: number;
    height: number;
    mime: string;
    bytes: number;
    pixelCount: number;
    base64Valid: boolean;
    source: string;
  };

  simboloCandidatoVisual?: string | null;
  scoreVisual?: number;
  segundoMelhorCandidato?: string | null;
  scoreSegundoMelhor?: number;
  referenciaComparada?: string | null;
  distanciaScoreComparacao?: number;
  motivoDescarteVisual?: string | null;

  // Métricas do Gemini
  objetoGemini?: string | null;
  confiancaGemini?: number;

  // Métricas de Saída Final
  objetoFinal?: string | null;
  confiancaFinal?: number;
  motivoDescarte?: string | null;

  // Imagens de Prévia & Estados Separados
  croppedDataUrl?: string; // Prévia do SYMBOL_CROP
  originalDataUrl?: string;
  originalFrameUrl?: string;
  roiFrameUrl?: string;
  resultZoneUrl?: string;
  symbolCropUrl?: string;
  winnerCropUrl?: string;

  // Telemetria Object Recognition Debug
  geminiRawResponse?: string;
  geminiResponseLength?: number;
  geminiResponseType?: string;

  parserInput?: string;
  parserStatus?: string;
  parserObject?: string | null;
  parserConfidence?: number;
  parserError?: string | null;

  matcherInput?: string | null;
  matcherObject?: string | null;
  matcherScore?: number;
  matcherStatus?: string;
  matcherSecondBest?: string | null;
  matcherGap?: number;

  finalObject?: string | null;
  finalConfidence?: number;
  finalStatus?: string;
}

export interface FrameDiagnosticoInfo {
  largura: number;
  altura: number;
  mimeType: string;
  tamanhoBytes: number;
  tamanhoKB: string;
  timestamp: number;
  fonte: string;
  conteudoVisual: boolean; // false se frame preto/escuro/vazio
  detalhesVisual: string;
  statusCongelamento?: 'FRAME_ATUALIZANDO' | 'FRAME_CONGELADO';
  qualidadeJpeg?: number;
  previewUrl?: string;
  mediaStreamInfo?: MediaStreamDiagnosticoInfo;
  roiDiagnostico?: WheelROIDiagnosticoInfo;
  resultScreenDiagnostico?: ResultScreenDiagnosticoInfo;
}

export interface UIRecognitionState {
  geminiStatus: 'DESABILITADO' | 'ATIVO' | 'ERRO';
  geminiReason: string;
  geminiObject: string | null;
  geminiConfidence: number;
  localStatus: 'ATIVO' | 'DESABILITADO';
  localObject: string | null;
  localConfidence: number;
  localGap: number;
  localDecision: 'ACCEPT' | 'REJECT' | 'AMBIGUOUS';
  analyzerState: string;
  candidateObject: string | null;
  candidateConfidence: number;
  candidateGap: number;
  confirmationCount: number;
  requiredConfirmations: number;
  confirmedObject: string | null;
  confirmedConfidence: number;
  confirmedState: 'RESULT_CONFIRMED' | 'WAITING_EXIT' | 'IDLE';
  eventId: string | null;
  persisted: boolean;
}

export interface LiveResultPayload {
  sucesso?: boolean;
  objetoDetectado?: string | null;
  confianca?: number;
  transfereContexto?: boolean;
  rawText?: string;
  geminiEstadoLog?: GeminiEstadoLog;
  geminiRawResponse?: string;
  parsedPayload?: any;
  matcherObject?: string | null;
  matcherScore?: number;
  finalObject?: string | null;
  finalConfidence?: number;
  finalStatus?: string;
  frameDiagnostico?: FrameDiagnosticoInfo;
  timestamp: number;
  estabilizacao?: LiveStabilizationInfo;
  latencia?: LiveLatencyInfo;

  // 3 Resultados Independentes & Estado Unificado de UI
  geminiResult?: {
    object: string | null;
    confidence: number;
    status: 'DISABLED' | 'ACTIVE' | 'ERROR' | 'TIMEOUT' | 'NO_RESPONSE';
    reason?: string;
  };
  localRecognizerResult?: {
    object: string | null;
    confidence: number;
    gap: number;
    secondCandidate?: string | null;
    status: 'VALID' | 'AMBIGUOUS' | 'NO_MATCH' | 'REJECT' | 'DISABLED';
    scoresPorObjeto?: Record<string, number>;
  };
  finalAnalyzerResult?: {
    object: string | null;
    confidence: number;
    gap: number;
    confirmationCount: number;
    requiredConfirmations: number;
    status: 'CANDIDATE' | 'CONFIRMED' | 'DISCARDED' | 'WAITING_EXIT' | 'IDLE';
    state: string;
    eventId?: string | null;
  };
  uiRecognitionState?: UIRecognitionState;
  // Diagnóstico de Erro Real & Status da Requisição Gemini
  geminiCallsCurrentRound?: number;
  geminiHttpStatus?: string | number;
  geminiErrorCode?: string | number;
  geminiErrorMessage?: string;
  geminiPayloadInfo?: {
    mimeType: string;
    base64Valid: boolean;
    base64Length: number;
    width: number;
    height: number;
    isResultZoneCrop: boolean;
  };
  pipelineSteps?: {
    step1_captura: string;
    step2_crop: string;
    step3_base64: string;
    step4_requestStarted: string;
    step5_requestSent: string;
    step6_geminiResponded: string;
    step7_responseReceived: string;
    step8_textExtracted: string;
    step9_jsonParsed: string;
    step10_validated: string;
  };
  // Rastreamento MODO DIAGNÓSTICO
  geminiTag?: GeminiStatusTag;
  analyzerTag?: AnalyzerStatusTag;
  recentFrameTraces?: RecentFrameTraceEntry[];
  confirmedRoundsHistory?: ConfirmedRoundHistoryEntry[];
}

export interface LiveErrorPayload {
  codigo?: string;
  mensagem: string;
  timestamp: number;
  fatal?: boolean;
}

export interface LiveMetrics {
  captureFps: number;
  sentFps: number;
  processingFps?: number;
  tempoMedioEntreFramesMs?: number;
  latenciaMediaMs: number;
  tempoRespostaGeminiMs: number;
  totalDetectados: number;
  totalConfirmados: number;
  totalDescartes: number;
  totalAguardando?: number;
  totalSemResposta?: number;
  totalErrosParser?: number;
  numeroReconexoes: number;
  usoMemoriaEstimadoMB?: number;
  ultimaRespostaBrutaGemini?: string;
  ultimoEstadoGemini?: GeminiEstadoLog;
  ultimoFrameDiagnostico?: FrameDiagnosticoInfo;
}

export interface LiveSessionState {
  sessionId: string;
  connectionId: string;
  usuarioId: string;
  estado: LiveConnectionState;
  conectadoEm: Date;
  desconectadoEm?: Date;
  model: string;
  totalFrames: number;
  ultimoResultadoAt?: number;
  motivoDesconexao?: string;
  mensagemErro?: string;
  tentativasReconexao: number;

  analyzerState: string;
  currentCandidate: string | null;
  currentEventId: string | null;
  lastConfirmedObject: string | null;
  lastConfirmedAt: number | null;
  confirmationCount: number;
  framesSinceLastConfirmation: number;
  lastFrameId: number;
  lastResetAt: number | null;

  consecutiveConfirmationsRequired: number;
  minConfidenceRequired: number;
  confiancaUltimaConfirmacao: number | null;
  totalRodadasDetectadasSessao: number;

  totalDetectados: number;
  totalDescartes: number;
  totalAguardando: number;
  totalSemResposta: number;
  totalErrosParser: number;
  somaLatenciaMs: number;
  contadorLatencias: number;
  ultimoTempoRespostaMs: number;
  ultimaRespostaBrutaGemini?: string;
  ultimoEstadoGemini?: GeminiEstadoLog;
  ultimoFrameDiagnostico?: FrameDiagnosticoInfo;

  tentativasPersistencia: number;
  registrosCriados: number;
  duplicacoesBloqueadas: number;

  // Rastreamento de Chamadas Gemini e Rate Limit
  geminiCallsCurrentRound: number;
  geminiCallTimestamps: number[];
  lastResultScreenDetected: boolean;
  geminiRateLimitActive: boolean;
  geminiRateLimitResetAt: number;
  geminiRateLimitReason?: string;
  lastGeminiHttpStatus?: number | string;
  lastGeminiError?: string;
  lastGeminiErrorMessage?: string;
  framesDiscardedBeforeGemini: number;
  geminiCallsAvoidedByScreenDetector: number;
}

export interface FrameTransportDebugInfo {
  captureStatus: 'ON' | 'OFF';
  lastFrameId: number;
  lastCaptureTimestamp: string;
  lastFetchUrl: string;
  lastFetchStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'IDLE';
  httpStatus: string;
  payloadSizeKB: string;
  backendReceived: 'YES' | 'NO';
  backendProcessed: 'YES' | 'NO';
  lastError: string | null;
  lastErrorName: string | null;
  lastErrorStack: string | null;
  requestMethod: string;
  urlClassification: {
    isRelative: boolean;
    isAbsolute: boolean;
    isLocalhost: boolean;
    isExternal: boolean;
    isHttps: boolean;
    isHttp: boolean;
  };
  origin: string;
  baseUrl: string;
  apiUrl: string;
}

export interface LiveSessionStatus {
  estado: LiveConnectionState;
  sessionId: string | null;
  connectionId?: string | null;
  mensagemErro: string | null;
  conectadoEm: string | null;
  duracaoSegundos?: number;
  motivoDesconexao?: string | null;
  tentativasReconexao: number;
  totalFramesEnviados: number;
  ultimoResultadoAt: number | null;
  modelUtilizado?: string;

  // Métricas de Diagnóstico Gemini Atuais (REQUIREMENT #11)
  localRecognitionEnabled?: boolean;
  geminiFallbackEnabled?: boolean;
  localOnlyMode?: boolean;
  localConfidenceThreshold?: number;
  reconhecimentoMetodo?: 'LOCAL' | 'GEMINI' | 'NENHUM';
  ultimoMetodoUtilizado?: 'LOCAL' | 'GEMINI' | 'NENHUM';
  ultimoObjetoLocal?: string | null;
  confiancaLocal?: number;
  segundoCandidatoLocal?: string | null;
  gapLocal?: number;
  localScoresPorObjeto?: Record<string, number>;
  geminiCallsCurrentRound?: number;
  geminiCallsPerMinute?: number;
  lastGeminiHttpStatus?: number | string;
  lastGeminiError?: string;
  lastGeminiErrorMessage?: string;
  rateLimitActive?: boolean;
  rateLimitRetryAfterMs?: number;
  framesDiscardedBeforeGemini?: number;
  geminiCallsAvoidedByScreenDetector?: number;
  // Campos de Estabilização e Registro
  analyzerState?: string;
  currentEventId?: string | null;
  ultimoObjetoConfirmado?: string | null;
  horarioUltimaConfirmacao?: number | null;
  confiancaUltimaConfirmacao?: number | null;
  totalRodadasDetectadasSessao?: number;
  candidatoAtual?: string | null;
  confirmacoesConsecutivas?: number;
  lastResetAt?: number | null;
  // Diagnóstico Bruto Gemini
  ultimaRespostaBrutaGemini?: string;
  ultimoEstadoGemini?: GeminiEstadoLog;
  ultimoFrameDiagnostico?: FrameDiagnosticoInfo;
  // Métricas do Painel Técnico (PROMPT LIVE 005)
  metricas?: LiveMetrics;
  uiRecognitionState?: UIRecognitionState;
  // Históricos e Rastreamento MODO DIAGNÓSTICO
  recentFrameTraces?: RecentFrameTraceEntry[];
  confirmedRoundsHistory?: ConfirmedRoundHistoryEntry[];
  // Contadores Detalhados
  totalFramesCapturados?: number;
  totalFramesProcessados?: number;
  totalRespostasGemini?: number;
  totalGeminiSemResposta?: number;
  totalGeminiAguardando?: number;
  totalGeminiObjetoDetectado?: number;
  totalDeteccoesValidas?: number;
  totalAbaixoConfiancaMinima?: number;
  totalCandidatosCriados?: number;
  totalConfirmacoes?: number;
  totalDuplicacoesBloqueadas?: number;
  totalInstabilidades?: number;
  totalReconexoes?: number;
  totalEventIdsCriados?: number;
  resultadosConfirmados?: number;
  telasResultadoDetectadas?: number;
  telasResultadoEncerradas?: number;
  rodadasLiberadas?: number;
  rodadasBloqueadas?: number;
  tentativasPersistencia?: number;
  registrosSupabase?: number;
  autoPersistEnabled?: boolean;
  frameTransportDebug?: FrameTransportDebugInfo;
}

export interface LiveEventCallback {
  (tipo: LiveEventType, payload?: any): void;
}

