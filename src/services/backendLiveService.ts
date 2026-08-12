import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import {
  LiveConnectionState,
  LiveSessionStatus,
  LiveSessionConfig,
  LiveFramePayload,
  LiveResultPayload,
  LiveStabilizationInfo,
  LiveLatencyInfo,
  GeminiEstadoLog,
  GeminiStatusTag,
  AnalyzerStatusTag,
  RecentFrameTraceEntry,
  ConfirmedRoundHistoryEntry,
  FrameDiagnosticoInfo,
  WheelROIDiagnosticoInfo,
  ResultScreenDiagnosticoInfo,
} from '../types/live';
import { logger } from '../utils/logger';
import {
  registrarResultadoAutomaticamente,
  isAutoPersistEnabled,
  setAutoPersistEnabled,
  OBJETOS_PERMITIDOS,
} from './resultadoService';
import { WheelVisionAnalyzer, VISION_ANALYZER_CONFIG } from './WheelVisionAnalyzer';
import { WheelRegionDetector, WheelROI } from './WheelRegionDetector';
import { WheelResultScreenDetector, ResultScreenDetection } from './WheelResultScreenDetector';
import { WheelObjectVisualMatcher } from './WheelObjectVisualMatcher';
import { WinnerReferenceMatcher } from './WinnerReferenceMatcher';
import { computeBase64Hash, computeBase64Bytes } from '../utils/hashUtils';
import {
  WHEEL_OBJECT_REFERENCES,
  WINNER_REFERENCE_IMAGES,
  WheelObjectName,
  isAllowedWheelObject,
  ALLOWED_WHEEL_OBJECTS,
} from '../config/wheelObjectReferences';
import { LocalWheelRecognizer } from './LocalWheelRecognizer';

export interface ParsedGeminiResult {
  geminiEstadoLog: GeminiEstadoLog;
  parsedPayload: any;
  objetoRaw: WheelObjectName | null;
  confiancaRaw: number;
  isJsonValid: boolean;
  detectedStrLog: string;
  errorMessage?: string;
}

/**
 * Normalização e validação estrita dos objetos permitidos da roda.
 *
 * Mapeamentos obrigatórios:
 * - sorvete -> sorvete
 * - boia, bóia -> boia
 * - balao, balão -> balao
 * - soco -> soco
 * - tedy, teddy -> tedy
 * - princesa -> princesa
 * - camera, câmera -> camera
 * - coroa -> coroa
 * - nenhum, none, null, undefined -> nenhum
 */
export function normalizeObject(raw: string | null | undefined): { normalized: WheelObjectName | 'nenhum' | null; rawTrimmed: string } {
  if (!raw || typeof raw !== 'string') {
    return { normalized: null, rawTrimmed: '' };
  }

  const rawTrimmed = raw.trim();
  if (!rawTrimmed) {
    return { normalized: null, rawTrimmed: '' };
  }

  // Remove acentos e converte para minúsculas
  const s = rawTrimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  if (s === 'sorvete') return { normalized: 'sorvete', rawTrimmed };
  if (s === 'boia') return { normalized: 'boia', rawTrimmed };
  if (s === 'balao') return { normalized: 'balao', rawTrimmed };
  if (s === 'soco') return { normalized: 'soco', rawTrimmed };
  if (s === 'tedy' || s === 'teddy') return { normalized: 'tedy', rawTrimmed };
  if (s === 'princesa') return { normalized: 'princesa', rawTrimmed };
  if (s === 'camera') return { normalized: 'camera', rawTrimmed };
  if (s === 'coroa') return { normalized: 'coroa', rawTrimmed };

  if (
    s === 'nenhum' ||
    s === 'none' ||
    s === 'null' ||
    s === 'undefined' ||
    s === 'aguardando' ||
    s === 'aguarde' ||
    s === 'waiting'
  ) {
    return { normalized: 'nenhum', rawTrimmed };
  }

  // Objeto desconhecido (ex: "bola", "boneco", "BALA0") é estritamente inválido
  return { normalized: null, rawTrimmed };
}

export function parseGeminiResponse(responseText: string, requestId: string = `req_${Date.now()}`): ParsedGeminiResult {
  const raw = responseText ?? '';

  // LOG OBRIGATÓRIO 1: RAW RESPONSE
  logger.info(`[GEMINI_RAW_RESPONSE] requestId=${requestId} raw=${JSON.stringify(raw)}`);

  let clean = raw.trim();
  if (!clean) {
    const reason = 'Resposta do Gemini vazia (0 caracteres)';
    logger.error(`[GEMINI_PARSE_ERROR] requestId=${requestId} reason="${reason}" raw=${JSON.stringify(raw)} clean=""`);
    return {
      geminiEstadoLog: 'GEMINI_NO_RESPONSE',
      parsedPayload: null,
      objetoRaw: null,
      confiancaRaw: 0,
      isJsonValid: false,
      detectedStrLog: 'nenhum',
      errorMessage: reason,
    };
  }

  // Limpeza de blocos de código markdown ```json e ```
  clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();

  // LOG OBRIGATÓRIO 2: CLEAN RESPONSE
  logger.info(`[GEMINI_CLEAN_RESPONSE] requestId=${requestId} clean=${JSON.stringify(clean)}`);

  let jsonObj: any = null;
  let isJsonValid = false;

  // Tentativa 1: Parse JSON direto ou via extração de chaves
  try {
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonObj = JSON.parse(jsonMatch[0]);
      isJsonValid = true;
    } else {
      jsonObj = JSON.parse(clean);
      isJsonValid = true;
    }
  } catch {
    isJsonValid = false;
  }

  // Unpack caso o JSON parseado seja um wrapper de candidato/resposta da SDK
  if (jsonObj && typeof jsonObj === 'object') {
    if (Array.isArray(jsonObj.candidates) && jsonObj.candidates[0]?.content?.parts?.[0]?.text) {
      const candidateText = jsonObj.candidates[0].content.parts[0].text;
      try {
        const innerJson = JSON.parse(candidateText.replace(/```json/gi, '').replace(/```/g, '').trim());
        if (innerJson && typeof innerJson === 'object') {
          jsonObj = innerJson;
        }
      } catch {}
    }
  }

  // Fallback 2: Regex para extrair chaves de objeto e confiança
  if (!isJsonValid || !jsonObj || typeof jsonObj !== 'object') {
    const matchObjStr = clean.match(/"(?:objetoDetectado|objeto|item|result|detectedItem|detectedItems|winner|symbol)"\s*:\s*\[?\s*"([^"]+)"/i);
    const matchConfNum = clean.match(/"(?:confianca|confidence|confidenceScore|confiancaScore)"\s*:\s*([0-9.]+)/i);
    if (matchObjStr) {
      jsonObj = {
        objetoDetectado: matchObjStr[1],
        confianca: matchConfNum ? parseFloat(matchConfNum[1]) : 95,
      };
      isJsonValid = true;
    }
  }

  // Se mesmo com os fallbacks não foi possível extrair um JSON/Estrutura
  if (!isJsonValid || !jsonObj || typeof jsonObj !== 'object') {
    // Tenta fallback de texto bruto apenas se mencionar explicitamente um dos 8 objetos ou nenhum
    const { normalized, rawTrimmed } = normalizeObject(clean);
    if (normalized === 'nenhum') {
      logger.info(`[GEMINI_PARSED] requestId=${requestId} objeto=nenhum confianca=0`);
      return {
        geminiEstadoLog: 'GEMINI_NO_OBJECT',
        parsedPayload: null,
        objetoRaw: null,
        confiancaRaw: 0,
        isJsonValid: false,
        detectedStrLog: 'nenhum',
      };
    } else if (normalized !== null) {
      logger.info(`[GEMINI_PARSED] requestId=${requestId} objeto=${normalized} confianca=95 (fallback texto)`);
      return {
        geminiEstadoLog: 'GEMINI_TEXT_RESPONSE',
        parsedPayload: null,
        objetoRaw: normalized,
        confiancaRaw: 95,
        isJsonValid: false,
        detectedStrLog: normalized,
      };
    }

    const reason = 'JSON completamente corrompido ou resposta não estruturada';
    logger.error(`[GEMINI_PARSE_ERROR] requestId=${requestId} reason="${reason}" raw=${JSON.stringify(raw)} clean=${JSON.stringify(clean)}`);
    return {
      geminiEstadoLog: 'GEMINI_INVALID_JSON',
      parsedPayload: null,
      objetoRaw: null,
      confiancaRaw: 0,
      isJsonValid: false,
      detectedStrLog: 'nenhum',
      errorMessage: reason,
    };
  }

  // Extrai o campo do objeto do JSON parseado
  let rawDetect =
    jsonObj.objetoDetectado ??
    jsonObj.objeto ??
    jsonObj.item ??
    jsonObj.result ??
    jsonObj.detectedItem ??
    jsonObj.winner ??
    jsonObj.symbol ??
    null;

  if (!rawDetect && Array.isArray(jsonObj.detectedItems) && jsonObj.detectedItems.length > 0) {
    rawDetect = jsonObj.detectedItems[0];
  } else if (!rawDetect && typeof jsonObj.detectedItems === 'string') {
    rawDetect = jsonObj.detectedItems;
  } else if (!rawDetect && Array.isArray(jsonObj.detected_items) && jsonObj.detected_items.length > 0) {
    rawDetect = jsonObj.detected_items[0];
  } else if (!rawDetect && typeof jsonObj.detected_items === 'string') {
    rawDetect = jsonObj.detected_items;
  }

  // Normalização estrita
  const { normalized, rawTrimmed } = normalizeObject(
    rawDetect !== null && rawDetect !== undefined ? String(rawDetect) : null
  );

  // Conversão e normalização de Confiança para a escala 0-100
  let confVal = Number(
    jsonObj.confianca ??
    jsonObj.confidence ??
    jsonObj.confidenceScore ??
    jsonObj.confiancaScore ??
    jsonObj.score ??
    0
  );

  if (isNaN(confVal) || confVal === 0) {
    const confStr = String(jsonObj.confidence || jsonObj.confianca || '').toLowerCase();
    if (confStr.includes('alta') || confStr.includes('high')) confVal = 95;
    else if (confStr.includes('media') || confStr.includes('medium')) confVal = 75;
    else if (confStr.includes('baixa') || confStr.includes('low')) confVal = 40;
    else confVal = 95;
  }

  if (confVal > 0 && confVal <= 1) {
    confVal = Math.round(confVal * 100);
  } else {
    confVal = Math.round(confVal);
  }

  if (confVal < 0) confVal = 0;
  if (confVal > 100) confVal = 100;

  // CASO 1: Objeto = "nenhum" (RESPOSTA VÁLIDA -> PARSER_RES ✓)
  if (normalized === 'nenhum') {
    logger.info(`[GEMINI_PARSED] requestId=${requestId} objeto=nenhum confianca=0`);
    return {
      geminiEstadoLog: 'GEMINI_NO_OBJECT',
      parsedPayload: jsonObj,
      objetoRaw: null,
      confiancaRaw: 0,
      isJsonValid: true,
      detectedStrLog: 'nenhum',
    };
  }

  // CASO 2: Objeto Válido dos 8 permitidos (RESPOSTA VÁLIDA -> PARSER_RES ✓)
  if (normalized !== null) {
    logger.info(`[GEMINI_PARSED] requestId=${requestId} objeto=${normalized} confianca=${confVal}`);
    return {
      geminiEstadoLog: 'GEMINI_OBJECT_DETECTED',
      parsedPayload: jsonObj,
      objetoRaw: normalized,
      confiancaRaw: confVal,
      isJsonValid: true,
      detectedStrLog: normalized,
    };
  }

  // CASO 3: Objeto Não Pertencente aos 8 Permitidos (ERRO REAL DE PARSER -> PARSER_RES ✗)
  const reason = `Objeto "${rawTrimmed}" não pertence ao catálogo dos 8 objetos permitidos`;
  logger.error(`[GEMINI_PARSE_ERROR] requestId=${requestId} reason="${reason}" raw=${JSON.stringify(raw)} clean=${JSON.stringify(clean)}`);
  return {
    geminiEstadoLog: 'GEMINI_PARSE_ERROR',
    parsedPayload: jsonObj,
    objetoRaw: null,
    confiancaRaw: 0,
    isJsonValid: false,
    detectedStrLog: `${rawTrimmed} (não permitido)`,
    errorMessage: reason,
  };
}

interface ActiveServerSession {
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
  lastResetAt: number | null;
  geminiRequestInFlight?: boolean;
  mode?: 'LIVE' | 'DIAGNOSTIC';
  diagnosticOnly?: boolean;

  // Analisador Visual Especializado (PROMPT LIVE 009)
  visionAnalyzer: WheelVisionAnalyzer;

  // PROMPT LIVE 004 – Campos de Estabilização
  consecutiveConfirmationsRequired: number;
  minConfidenceRequired: number;
  candidatoAtual: string | null;
  confirmacoesConsecutivas: number;
  ultimoObjetoConfirmado: string | null;
  horarioUltimaConfirmacao: number | null;
  confiancaUltimaConfirmacao: number | null;
  totalRodadasDetectadasSessao: number;

  // PROMPT LIVE 005 & DIAGNÓSTICO BRUTO GEMINI LIVE
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

  // MÉTRICAS DE DIAGNÓSTICO ANTI-DUPLICAÇÃO
  tentativasPersistencia: number;
  registrosCriados: number;
  duplicacoesBloqueadas: number;

  // Rastreamento de Chamadas Gemini e Rate Limit
  geminiCallsCurrentRound: number;
  geminiCallsStartedCurrentRound: number;
  geminiCallsCompletedCurrentRound: number;
  currentRoundId: string | null;
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

  // HISTÓRICOS EM MEMÓRIA
  recentFrameTraces: RecentFrameTraceEntry[];
  confirmedRoundsHistory: ConfirmedRoundHistoryEntry[];
}

// Armazena sessões ativas lógicas por sessionId e mapeamento por usuarioId
const activeSessionStatesMap = new Map<string, ActiveServerSession>();
const userToSessionMap = new Map<string, string>();

// Mapeamentos de deduplicação e controle de concorrência por event_id
const processedEventIds = new Set<string>();
const inFlightPersistence = new Map<string, Promise<any>>();

export async function safeRegistrarResultado(
  objeto: string,
  confianca: number,
  eventId?: string,
  sessionId?: string | number | null
) {
  const effectiveEventId = eventId || `LIVE_EVT_${Date.now()}_${objeto}`;

  if (processedEventIds.has(effectiveEventId)) {
    logger.info(`[DEDUP_LOCK_CHECK] eventId=${effectiveEventId} ALREADY_PROCESSED`);
    return {
      registrado: false,
      motivo: `PERSISTENCE_REJECTED=PROCESSED_EVENT_ID (${effectiveEventId})`,
      sessaoId: sessionId ? String(sessionId) : null,
      rodadaRegistrada: null,
      eventId: effectiveEventId,
    };
  }

  const existingLock = inFlightPersistence.get(effectiveEventId);
  if (existingLock) {
    logger.info(`[DEDUP_LOCK_CHECK] eventId=${effectiveEventId} AWAITING_IN_FLIGHT_LOCK`);
    return {
      registrado: false,
      motivo: `PERSISTENCE_REJECTED=CONCURRENT_LOCK (${effectiveEventId})`,
      sessaoId: sessionId ? String(sessionId) : null,
      rodadaRegistrada: null,
      eventId: effectiveEventId,
    };
  }

  const persistPromise = (async () => {
    processedEventIds.add(effectiveEventId);
    return await registrarResultadoAutomaticamente(objeto, confianca, effectiveEventId, sessionId);
  })();

  inFlightPersistence.set(effectiveEventId, persistPromise);

  try {
    return await persistPromise;
  } finally {
    inFlightPersistence.delete(effectiveEventId);
  }
}

function getSessaoPorUsuario(usuarioId: string): ActiveServerSession | undefined {
  const sessionId = userToSessionMap.get(usuarioId);
  if (sessionId) {
    return activeSessionStatesMap.get(sessionId);
  }
  return undefined;
}

/**
 * Obtém ou inicializa o cliente oficial do SDK GoogleGenAI com a chave do servidor.
 */
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('A chave GEMINI_API_KEY não está configurada no servidor.');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Extrai de forma totalmente segura o texto retornado pela SDK @google/genai,
 * lidando com getters, propriedades ou estruturas de objetos.
 */
export function extractGeminiText(response: any): string {
  if (!response) return '';
  if (typeof response === 'string') return response.trim();

  // 1. Tenta acessar .text como propriedade string
  try {
    if (typeof response.text === 'string' && response.text.trim().length > 0) {
      return response.text.trim();
    }
  } catch {}

  // 2. Tenta chamar .text() como método da classe de resposta da SDK @google/genai
  try {
    if (typeof response.text === 'function') {
      const val = response.text();
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch {}

  // 3. Fallback para a estrutura de candidates / parts
  try {
    const candidateText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof candidateText === 'string' && candidateText.trim().length > 0) {
      return candidateText.trim();
    }

    const combinedParts = response?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (combinedParts) return combinedParts;
  } catch {}

  return '';
}

/**
 * Executa a chamada generateContent com fallback de modelo e timeout estrito de 15s.
 */
async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  timeoutMs: number = 15000
): Promise<{ response: any; modelUsed: string; responseTimeMs: number }> {
  const candidateModels = [
    'gemini-3.6-flash',
    params.model,
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ].filter(Boolean) as string[];

  const modelsToTry = Array.from(new Set(candidateModels));
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const tStart = Date.now();
    try {
      let timeoutId: any;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const err: any = new Error(`Gemini não respondeu dentro do tempo limite (${timeoutMs}ms).`);
          err.code = 'GEMINI_TIMEOUT';
          err.status = 408;
          reject(err);
        }, timeoutMs);
      });

      const callPromise = ai.models.generateContent({
        ...params,
        model: modelName,
      });

      const response = await Promise.race([callPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const responseTimeMs = Date.now() - tStart;
      return { response, modelUsed: modelName, responseTimeMs };
    } catch (err: any) {
      lastError = err;

      if (err?.code === 'GEMINI_TIMEOUT' || err?.status === 408 || err?.message?.includes('tempo limite')) {
        throw err;
      }

      const isRecoverableError =
        err?.status === 429 ||
        err?.code === 429 ||
        err?.status === 404 ||
        err?.code === 404 ||
        (err?.message &&
          (err.message.includes('429') ||
            err.message.includes('404') ||
            err.message.includes('not found') ||
            err.message.includes('Quota exceeded') ||
            err.message.includes('RESOURCE_EXHAUSTED')));

      if (isRecoverableError) {
        logger.warn(
          `[GEMINI FALLBACK] Modelo ${modelName} falhou (${err?.message || err?.status}). Tentando próximo modelo...`
        );
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * Serviço de Backend para gerenciamento seguro e comunicação com Gemini Live API.
 */
export class BackendLiveService {
  /**
   * Inicia uma sessão Live real com a Gemini Live API no backend.
   * Se já existir uma sessão lógica para o usuário, REAPROVEITA o estado e reconecta a Gemini API,
   * garantindo que reconexão NUNCA zere a máquina de estados nem crie uma nova rodada.
   */
  public static async iniciarSessao(
    usuarioId: string = 'default_user',
    config?: Partial<LiveSessionConfig> & { forceNewSession?: boolean; mode?: 'LIVE' | 'DIAGNOSTIC'; diagnosticOnly?: boolean }
  ): Promise<LiveSessionStatus> {
    const sessaoExistente = getSessaoPorUsuario(usuarioId);

    const sessionMode: 'LIVE' | 'DIAGNOSTIC' = config?.mode || (config?.diagnosticOnly ? 'DIAGNOSTIC' : 'LIVE');
    const isDiagnosticOnly = sessionMode === 'DIAGNOSTIC';

    if (sessionMode === 'LIVE') {
      setAutoPersistEnabled(true);
      logger.info('[LIVE_MODE_ENFORCED] MODO LIVE REAL ATIVADO — AUTO_PERSIST_ENABLED = true por padrão');
    }

    // Se já existe uma sessão para o usuário e NÃO foi explicitamente pedido forçar nova sessão:
    // Reutilizar a sessão lógica existente e apenas reconectar a conexão Gemini
    if (sessaoExistente && !config?.forceNewSession) {
      logger.info(
        `[LIVE BACKEND] [REAPROVEITANDO SESSÃO EXISTENTE] Reutilizando sessionId ${sessaoExistente.sessionId} para o usuário ${usuarioId}...`
      );
      sessaoExistente.mode = sessionMode;
      sessaoExistente.diagnosticOnly = isDiagnosticOnly;
      return this.reconectar(usuarioId);
    }

    // Se forçar nova sessão e já existia uma, encerrar explicitamente a anterior
    if (sessaoExistente && config?.forceNewSession) {
      logger.info(
        `[LIVE BACKEND] Encerrando sessão anterior (${sessaoExistente.sessionId}) para abrir nova sessão zerada...`
      );
      await this.encerrarSessao(usuarioId, 'Substituída por nova sessão explícita');
    }

    const reqConfirmations = config?.consecutiveConfirmationsRequired || 3;
    const reqConfidence = config?.minConfidenceRequired || 85;
    const modelTarget = config?.model || 'gemini-3.6-flash';

    const sessionId = config?.sessionId || `LIVE_SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const connectionId = `GEMINI_CONN_${Date.now()}_1`;
    const agora = new Date();

    const novaSessao: ActiveServerSession = {
      sessionId,
      connectionId,
      usuarioId,
      estado: 'conectando',
      conectadoEm: agora,
      model: modelTarget,
      mode: sessionMode,
      diagnosticOnly: isDiagnosticOnly,
      totalFrames: 0,
      tentativasReconexao: 0,
      lastResetAt: null,

      // Controle de Chamadas Gemini e Rate Limit
      geminiCallsCurrentRound: 0,
      geminiCallsStartedCurrentRound: 0,
      geminiCallsCompletedCurrentRound: 0,
      currentRoundId: null,
      geminiCallTimestamps: [],
      lastResultScreenDetected: false,
      geminiRateLimitActive: false,
      geminiRateLimitResetAt: 0,
      geminiRateLimitReason: undefined,
      lastGeminiHttpStatus: undefined,
      lastGeminiError: undefined,
      lastGeminiErrorMessage: undefined,
      framesDiscardedBeforeGemini: 0,
      geminiCallsAvoidedByScreenDetector: 0,

      // Analisador Visual Especializado (PROMPT LIVE 009)
      visionAnalyzer: new WheelVisionAnalyzer(
        reqConfirmations,
        reqConfidence,
        VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS
      ),

      // Estabilização
      consecutiveConfirmationsRequired: reqConfirmations,
      minConfidenceRequired: reqConfidence,
      candidatoAtual: null,
      confirmacoesConsecutivas: 0,
      ultimoObjetoConfirmado: null,
      horarioUltimaConfirmacao: null,
      confiancaUltimaConfirmacao: null,
      totalRodadasDetectadasSessao: 0,

      // Telemetria & Diagnóstico
      totalDetectados: 0,
      totalDescartes: 0,
      totalAguardando: 0,
      totalSemResposta: 0,
      totalErrosParser: 0,
      somaLatenciaMs: 0,
      contadorLatencias: 0,
      ultimoTempoRespostaMs: 0,

      // Anti-Duplicação
      tentativasPersistencia: 0,
      registrosCriados: 0,
      duplicacoesBloqueadas: 0,

      // Históricos Rastreamento
      recentFrameTraces: [],
      confirmedRoundsHistory: [],
    };

    activeSessionStatesMap.set(sessionId, novaSessao);
    userToSessionMap.set(usuarioId, sessionId);

    logger.info(
      `[LIVE BACKEND] [INÍCIO DE SESSÃO LÓGICA] Session ID: ${sessionId} | Connection ID: ${connectionId} | Usuário: ${usuarioId} | Model: ${modelTarget} | Estabilização: ${reqConfirmations} frames @ ${reqConfidence}% conf.`
    );

    try {
      getGenAIClient();

      novaSessao.estado = 'conectado';
      novaSessao.mensagemErro = undefined;

      logger.info(
        `[LIVE BACKEND] [CONECTADO] Sessão ${sessionId} (Conn: ${connectionId}) conectada com sucesso à Gemini Live API.`
      );

      return this.obterStatusStatusSessao(novaSessao);
    } catch (err: any) {
      const msgErro = err?.message || 'Erro ao conectar à Gemini Live API.';
      logger.error(`[LIVE BACKEND] [FALHA CONEXÃO] Erro ao iniciar sessão ${sessionId}:`, msgErro);

      novaSessao.estado = 'erro';
      novaSessao.mensagemErro = msgErro;

      return this.obterStatusStatusSessao(novaSessao);
    }
  }

  /**
   * Encerra a sessão Live ativa do usuário, liberando recursos e calculando a duração.
   */
  public static async encerrarSessao(
    usuarioId: string = 'default_user',
    motivo: string = 'Solicitação do usuário'
  ): Promise<LiveSessionStatus> {
    const sessao = getSessaoPorUsuario(usuarioId);

    if (!sessao) {
      logger.info(`[LIVE BACKEND] Nenhuma sessão ativa encontrada para o usuário ${usuarioId}.`);
      return {
        estado: 'desconectado',
        sessionId: null,
        connectionId: null,
        mensagemErro: null,
        conectadoEm: null,
        tentativasReconexao: 0,
        totalFramesEnviados: 0,
        ultimoResultadoAt: null,
      };
    }

    const agora = new Date();
    const duracaoMs = agora.getTime() - sessao.conectadoEm.getTime();
    const duracaoSegundos = Math.round(duracaoMs / 1000);

    sessao.estado = 'desconectado';
    sessao.desconectadoEm = agora;
    sessao.motivoDesconexao = motivo;
    sessao.lastResetAt = agora.getTime();

    logger.info(
      `[LIVE BACKEND] [ENCERRAMENTO DEFINITIVO DE SESSÃO] Session ID: ${sessao.sessionId} | Connection ID: ${sessao.connectionId} | Duração: ${duracaoSegundos}s | Motivo: ${motivo} | Total Frames: ${sessao.totalFrames} | Rodadas Confirmadas: ${sessao.totalRodadasDetectadasSessao}`
    );

    activeSessionStatesMap.delete(sessao.sessionId);
    userToSessionMap.delete(usuarioId);

    return {
      estado: 'desconectado',
      sessionId: sessao.sessionId,
      connectionId: sessao.connectionId,
      mensagemErro: null,
      conectadoEm: sessao.conectadoEm.toISOString(),
      duracaoSegundos,
      motivoDesconexao: motivo,
      tentativasReconexao: sessao.tentativasReconexao,
      totalFramesEnviados: sessao.totalFrames,
      ultimoResultadoAt: sessao.ultimoResultadoAt || null,
      modelUtilizado: sessao.model,
      ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
      horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
      totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
      lastResetAt: sessao.lastResetAt,
    };
  }

  /**
   * Reseta e limpa os históricos/estados em memória das sessões Live ativas.
   */
  public static limparMemoriaLiveSessao(): void {
    for (const sessao of activeSessionStatesMap.values()) {
      sessao.totalRodadasDetectadasSessao = 0;
      sessao.candidatoAtual = null;
      sessao.confirmacoesConsecutivas = 0;
      sessao.ultimoObjetoConfirmado = null;
      sessao.horarioUltimaConfirmacao = null;
      sessao.confiancaUltimaConfirmacao = null;
      sessao.totalDetectados = 0;
      sessao.totalDescartes = 0;
      sessao.totalAguardando = 0;
      sessao.totalSemResposta = 0;
      sessao.totalErrosParser = 0;
      sessao.registrosCriados = 0;
      sessao.duplicacoesBloqueadas = 0;
      sessao.lastResetAt = Date.now();
      sessao.confirmedRoundsHistory = [];
      sessao.recentFrameTraces = [];
      if (sessao.visionAnalyzer) {
        sessao.visionAnalyzer.resetAnalyzer();
      }
    }
    processedEventIds.clear();
    inFlightPersistence.clear();
    logger.info('[LIVE BACKEND] Memória de sessões Live redefinida/limpa.');
  }

  /**
   * Tenta reconectar automaticamente mantendo integralmente o LiveSessionState e WheelVisionAnalyzer intactos.
   */
  public static async reconectar(
    usuarioId: string = 'default_user'
  ): Promise<LiveSessionStatus> {
    const sessao = getSessaoPorUsuario(usuarioId);

    if (!sessao) {
      logger.info(
        `[LIVE BACKEND] Nenhum LiveSessionState ativo encontrado para ${usuarioId}. Criando nova sessão...`
      );
      return this.iniciarSessao(usuarioId);
    }

    const oldConnectionId = sessao.connectionId;
    const newConnectionId = `GEMINI_CONN_${Date.now()}_${sessao.tentativasReconexao + 1}`;
    const analyzerStateBefore = sessao.visionAnalyzer.getCurrentState();
    const currentEventIdBefore = sessao.visionAnalyzer.getCurrentEventId();
    const lastConfirmedObjectBefore = sessao.visionAnalyzer.getUltimoObjetoConfirmado();
    const lastConfirmedAtBefore = sessao.horarioUltimaConfirmacao;

    sessao.connectionId = newConnectionId;
    sessao.tentativasReconexao++;
    sessao.estado = 'reconectando';

    try {
      getGenAIClient();

      sessao.estado = 'conectado';
      sessao.mensagemErro = undefined;
      sessao.geminiRequestInFlight = false;

      // Reset de segurança na reconexão para liberar contador
      const prevCalls = sessao.geminiCallsStartedCurrentRound || sessao.geminiCallsCurrentRound || 0;
      sessao.geminiCallsStartedCurrentRound = 0;
      sessao.geminiCallsCompletedCurrentRound = 0;
      sessao.geminiCallsCurrentRound = 0;
      sessao.lastResultScreenDetected = false;
      sessao.currentRoundId = null;

      logger.info(
        `[CALL_LIMIT_RESET]\n` +
          `roundId=${currentEventIdBefore || 'N/A'}\n` +
          `previousCalls=${prevCalls}\n` +
          `newCalls=0\n` +
          `reason=SESSION_RECONNECTED`
      );

      const analyzerStateAfter = sessao.visionAnalyzer.getCurrentState();

      // LOG DE RECONEXÃO OBRIGATÓRIO (REQUIREMENT #11)
      logger.info(
        `[SESSION-RECONNECT]\n` +
          `• sessionId: ${sessao.sessionId}\n` +
          `• oldConnectionId: ${oldConnectionId}\n` +
          `• newConnectionId: ${newConnectionId}\n` +
          `• analyzerStateBefore: ${analyzerStateBefore}\n` +
          `• analyzerStateAfter: ${analyzerStateAfter}\n` +
          `• currentEventId: ${currentEventIdBefore || 'N/A'}\n` +
          `• lastConfirmedObject: ${lastConfirmedObjectBefore || 'N/A'}\n` +
          `• lastConfirmedAt: ${lastConfirmedAtBefore ? new Date(lastConfirmedAtBefore).toISOString() : 'N/A'}`
      );

      return this.obterStatusStatusSessao(sessao);
    } catch (err: any) {
      const msgErro = err?.message || 'Falha ao reconectar com Gemini Live API.';
      logger.error(
        `[LIVE BACKEND] [FALHA RECONEXÃO #${sessao.tentativasReconexao}] Session ID: ${sessao.sessionId}:`,
        msgErro
      );

      sessao.estado = 'erro';
      sessao.mensagemErro = msgErro;

      return this.obterStatusStatusSessao(sessao);
    }
  }

  /**
   * Processa um frame de vídeo/imagem transmitido pela Live API sem salvar imagens em armazenamento.
   * Diagnostica a resposta BRUTA da Gemini e a integridade visual do frame.
   */
  public static async processarFrame(
    usuarioId: string = 'default_user',
    framePayload: LiveFramePayload
  ): Promise<LiveResultPayload | null> {
    let sessao = getSessaoPorUsuario(usuarioId);

    if (!sessao || sessao.estado !== 'conectado') {
      logger.info(
        `[LIVE BACKEND] Sessão não encontrada ou desconectada para ${usuarioId}. Auto-inicializando sessão...`
      );
      await this.iniciarSessao(usuarioId);
      sessao = getSessaoPorUsuario(usuarioId);
    }

    if (!sessao) {
      logger.warn(`[LIVE BACKEND] Não foi possível obter ou criar sessão ativa para usuário ${usuarioId}.`);
      return null;
    }

    if (sessao.mode !== 'DIAGNOSTIC' && !isAutoPersistEnabled()) {
      logger.error(
        `[LIVE_PERSISTENCE_CONFIG_ERROR]\n` +
          `AUTO_PERSIST_ENABLED=false\n` +
          `mode=LIVE\n` +
          `persistenceBlocked=true`
      );
      setAutoPersistEnabled(true);
      logger.info('[LIVE_PERSISTENCE_CONFIG_ENFORCED] AUTO_PERSIST_ENABLED re-habilitado para TRUE no MODO LIVE REAL.');
    }

    sessao.totalFrames++;
    const cleanBase64 = framePayload.base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Diagnóstico completo do frame recebido (Requirement #7, #8, #9, #10)
    const largura = framePayload.width || 640;
    const altura = framePayload.height || 480;
    const mimeType = framePayload.mimeType || 'image/jpeg';
    const tamanhoBytes = Math.round((cleanBase64.length * 3) / 4);
    const tamanhoKB = (tamanhoBytes / 1024).toFixed(1) + ' KB';
    const fonte = framePayload.source || 'SCREEN_CAPTURE';
    const conteudoVisual = tamanhoBytes > 3000; // Frames < 3KB em 640x480/1280x720 geralmente representam telas pretas/vazias
    const detalhesVisual = conteudoVisual
      ? `Frame válido com conteúdo visual (${tamanhoKB}, ${largura}x${altura})`
      : `ALERTA: Tamanho do JPEG extremamente reduzido (${tamanhoKB}), possível tela preta, vazia ou congelada.`;

    // Localizar ROI da Roda (PROMPT LIVE 004)
    let roi: WheelROI;
    if (framePayload.metadata?.roi) {
      roi = framePayload.metadata.roi;
    } else {
      roi = WheelRegionDetector.detectWheelRegion({
        width: largura,
        height: altura,
        base64Data: cleanBase64,
        isBlackOrEmpty: !conteudoVisual,
      });
    }

    // Detecção da TELA DE RESULTADO (Resultado da Roda)
    let resScreenDetection: ResultScreenDetection;
    if (framePayload.metadata?.resultadoScreenDetected !== undefined) {
      const metaRoi = framePayload.metadata.resultScreenRoi || {};
      resScreenDetection = {
        resultadoScreenDetected: !!framePayload.metadata.resultadoScreenDetected,
        confidence: framePayload.metadata.resultScreenConfidence || 0.98,
        roi: {
          ...metaRoi,
          symbolCropWidth: metaRoi.symbolCropWidth || 153,
          symbolCropHeight: metaRoi.symbolCropHeight || 153,
          symbolCropValid: metaRoi.symbolCropValid ?? true,
        },
      };
    } else {
      resScreenDetection = WheelResultScreenDetector.detectResultScreen({
        width: largura,
        height: altura,
        base64Data: cleanBase64,
        isBlackOrEmpty: !conteudoVisual,
      });
    }

    const resultScreenDiagnostico: ResultScreenDiagnosticoInfo = {
      resultadoScreenDetected: resScreenDetection.resultadoScreenDetected,
      confidence: resScreenDetection.confidence,
      estadoAtual: sessao.visionAnalyzer.getCurrentState(),
      tempoDesdeDeteccaoMs: sessao.visionAnalyzer.getCandidateState().tempoEstavelMs,
      framesAnalisadosJanela: sessao.visionAnalyzer.getCandidateState().framesAnalisadosJanela || 0,
      candidatoAtual: sessao.visionAnalyzer.getCandidateState().candidato,
      confirmacoesConsecutivas: sessao.visionAnalyzer.getCandidateState().confirmacoesConsecutivas,
      resultadoConfirmado: sessao.visionAnalyzer.getUltimoObjetoConfirmado(),
      eventId: sessao.visionAnalyzer.getCurrentEventId(),

      // Modal metrics
      resultScreenX: resScreenDetection.roi?.resultScreenX,
      resultScreenY: resScreenDetection.roi?.resultScreenY,
      resultScreenWidth: resScreenDetection.roi?.resultScreenWidth,
      resultScreenHeight: resScreenDetection.roi?.resultScreenHeight,
      resultScreenCenterX: resScreenDetection.roi?.resultScreenCenterX,
      resultScreenCenterY: resScreenDetection.roi?.resultScreenCenterY,

      // Symbol crop metrics
      symbolCropX: resScreenDetection.roi?.symbolCropX,
      symbolCropY: resScreenDetection.roi?.symbolCropY,
      symbolCropWidth: resScreenDetection.roi?.symbolCropWidth || 153,
      symbolCropHeight: resScreenDetection.roi?.symbolCropHeight || 153,
      symbolCropCenterX: resScreenDetection.roi?.symbolCropCenterX,
      symbolCropCenterY: resScreenDetection.roi?.symbolCropCenterY,
      symbolCropValid: resScreenDetection.roi?.symbolCropValid ?? true,

      // Aliases
      roiX: resScreenDetection.roi?.x,
      roiY: resScreenDetection.roi?.y,
      roiWidth: resScreenDetection.roi?.width,
      roiHeight: resScreenDetection.roi?.height,
      cropX: resScreenDetection.roi?.cropX,
      cropY: resScreenDetection.roi?.cropY,
      cropWidth: resScreenDetection.roi?.cropWidth,
      cropHeight: resScreenDetection.roi?.cropHeight,
      centerX: resScreenDetection.roi?.centerX,
      centerY: resScreenDetection.roi?.centerY,
      absCropX: resScreenDetection.roi?.absCropX,
      absCropY: resScreenDetection.roi?.absCropY,
      absCropWidth: resScreenDetection.roi?.absCropWidth,
      absCropHeight: resScreenDetection.roi?.absCropHeight,
      posicaoVertical: resScreenDetection.roi?.posicaoVertical || 'CENTRO GEOMÉTRICO MODAL',
      roiValida: resScreenDetection.resultadoScreenDetected && !!resScreenDetection.roi,
      objetoGemini: null,
      confiancaGemini: 0,
      referenciaComparada: null,
      scoreVisual: 0,
      objetoFinal: null,
      confiancaFinal: 0,
      croppedDataUrl: resScreenDetection.roi?.croppedDataUrl || framePayload.metadata?.resultScreenCroppedDataUrl,
      originalDataUrl: framePayload.metadata?.previewUrl || framePayload.base64Data,
    };

    const roiDiagnostico: WheelROIDiagnosticoInfo = {
      roiFound: roi.found,
      roiConfidence: roi.confidence,
      roiX: roi.x,
      roiY: roi.y,
      roiWidth: roi.width,
      roiHeight: roi.height,
      originalWidth: largura,
      originalHeight: altura,
      status: roi.status,
      croppedDataUrl: roi.croppedDataUrl || framePayload.metadata?.croppedDataUrl,
      originalDataUrl: framePayload.metadata?.previewUrl || framePayload.base64Data,
      reason: roi.reason,
    };

    const statusCongelamento = framePayload.metadata?.statusCongelamento;
    const qualidadeJpeg = framePayload.metadata?.qualidadeJpeg;
    const mediaStreamInfo = framePayload.metadata?.mediaStreamInfo;

    const frameDiagnostico: FrameDiagnosticoInfo = {
      largura,
      altura,
      mimeType,
      tamanhoBytes,
      tamanhoKB,
      timestamp: framePayload.timestamp || Date.now(),
      fonte,
      conteudoVisual,
      detalhesVisual,
      statusCongelamento,
      qualidadeJpeg,
      previewUrl: framePayload.metadata?.previewUrl || framePayload.base64Data,
      mediaStreamInfo,
      roiDiagnostico,
      resultScreenDiagnostico,
    };
    sessao.ultimoFrameDiagnostico = frameDiagnostico;

    // Se nem a Roda nem a Tela de Resultado forem detectadas e a tela for inválida, descarta
    if (!roi.found && !resScreenDetection.resultadoScreenDetected) {
      logger.warn(
        `[ROI-DIAGNOSTIC]\nWHEEL_REGION_NOT_FOUND\n` +
          `frameId: FRAME_${String(sessao.totalFrames).padStart(6, '0')}\n` +
          `roiFound: false\n` +
          `roiConfidence: ${roi.confidence}\n` +
          `resultScreenDetected: false\n` +
          `originalWidth: ${largura}\n` +
          `originalHeight: ${altura}\n` +
          `geminiObject: null\n` +
          `geminiConfidence: 0\n` +
          `analyzerState: ${sessao.visionAnalyzer.getCurrentState()}\n` +
          `confirmedNow: false`
      );

      return {
        objetoDetectado: null,
        confianca: 0,
        rawText: 'WHEEL_REGION_NOT_FOUND',
        geminiEstadoLog: 'GEMINI_NO_OBJECT',
        geminiTag: 'GEMINI_NO_OBJECT',
        frameDiagnostico,
        timestamp: Date.now(),
        pipelineSteps: {
          step1_captura: `✓ Frame #${sessao.totalFrames} (${largura}x${altura})`,
          step2_crop: 'RESULT_ZONE inativa',
          step3_base64: 'N/A',
          step4_requestStarted: 'N/A (Fora da Tela de Resultado)',
          step5_requestSent: 'N/A',
          step6_geminiResponded: 'Descartado: Fora da Tela de Resultado',
          step7_responseReceived: 'N/A',
          step8_textExtracted: 'N/A',
          step9_jsonParsed: 'N/A',
          step10_validated: 'Status: Fora da Tela de Resultado',
        },
      };
    }

    // REGRA DE ARQUITETURA #5: Se estiver fora da Tela de Resultado, NÃO enviar para o Gemini
    if (!resScreenDetection.resultadoScreenDetected) {
      sessao.framesDiscardedBeforeGemini = (sessao.framesDiscardedBeforeGemini || 0) + 1;
      sessao.geminiCallsAvoidedByScreenDetector = (sessao.geminiCallsAvoidedByScreenDetector || 0) + 1;
      sessao.lastResultScreenDetected = false;

      logger.info(`[GEMINI_DISCARD] Frame #${sessao.totalFrames} fora da Tela de Resultado (RESULT_ZONE inativa). Gemini não foi acionado.`);

      const analyzerStateBefore = sessao.visionAnalyzer.getCurrentState();
      const analysis = sessao.visionAnalyzer.processarDeteccao(
        null,
        0,
        false,
        0,
        sessao.sessionId,
        sessao.totalFrames
      );

      return {
        objetoDetectado: null,
        confianca: 0,
        rawText: 'FORA_DA_TELA_RESULTADO',
        geminiEstadoLog: 'GEMINI_NO_OBJECT',
        geminiTag: 'GEMINI_NO_OBJECT',
        analyzerTag: 'ANALYZER_DISCARDED',
        frameDiagnostico,
        timestamp: Date.now(),
        pipelineSteps: {
          step1_captura: `✓ Frame #${sessao.totalFrames} (${largura}x${altura})`,
          step2_crop: 'RESULT_ZONE Inativa (Fora da tela de resultado)',
          step3_base64: 'N/A',
          step4_requestStarted: 'N/A (Fora da Tela de Resultado)',
          step5_requestSent: 'N/A',
          step6_geminiResponded: 'Descartado: RESULT_ZONE Inativa',
          step7_responseReceived: 'N/A',
          step8_textExtracted: 'N/A',
          step9_jsonParsed: 'N/A',
          step10_validated: 'Status: Fora da Tela de Resultado',
        },
      };
    }

    // Tela de Resultado detectada: Gerenciar transição de janela de rodada e identificador de rodada
    const activeEventId = sessao.visionAnalyzer.getCurrentEventId();
    if (!sessao.lastResultScreenDetected) {
      const prevCalls = sessao.geminiCallsStartedCurrentRound ?? sessao.geminiCallsCurrentRound ?? 0;
      sessao.geminiCallsStartedCurrentRound = 0;
      sessao.geminiCallsCompletedCurrentRound = 0;
      sessao.geminiCallsCurrentRound = 0;
      sessao.currentRoundId = activeEventId;
      sessao.lastResultScreenDetected = true;

      logger.info(
        `[SCREEN_DETECTED]\n` +
          `score=${Math.round(resScreenDetection.confidence * 100)}\n` +
          `reason=NEW_RESULT_SCREEN_DETECTED`
      );

      logger.info(
        `[CALL_LIMIT_RESET]\n` +
          `roundId=${activeEventId || 'AWAITING_CONFIRMATION'}\n` +
          `previousCalls=${prevCalls}\n` +
          `newCalls=0\n` +
          `reason=NEW_RESULT_SCREEN_DETECTED`
      );
    } else if (activeEventId && activeEventId !== sessao.currentRoundId) {
      const prevCalls = sessao.geminiCallsStartedCurrentRound ?? sessao.geminiCallsCurrentRound ?? 0;
      sessao.geminiCallsStartedCurrentRound = 0;
      sessao.geminiCallsCompletedCurrentRound = 0;
      sessao.geminiCallsCurrentRound = 0;
      sessao.currentRoundId = activeEventId;

      logger.info(
        `[ROUND_START]\n` +
          `roundId=${activeEventId}\n` +
          `eventId=${activeEventId}\n` +
          `reason=NEW_EVENT_ID_CONFIRMED`
      );

      logger.info(
        `[CALL_LIMIT_RESET]\n` +
          `roundId=${activeEventId}\n` +
          `previousCalls=${prevCalls}\n` +
          `newCalls=0\n` +
          `reason=NEW_EVENT_ID_CONFIRMED`
      );
    }

    // Extrair o melhor crop disponível (SYMBOL CROP 153x153 > RESULT SCREEN CROP > ROI > FULL FRAME)
    let imageToSend = cleanBase64;
    let cropSource = 'FRAME_FULL';
    let isResultZoneCrop = false;
    let symbolCrop153Base64: string | null = null;

    if (resScreenDetection.resultadoScreenDetected && resScreenDetection.roi && cleanBase64) {
      const { symbolCropX, symbolCropY, symbolCropWidth, symbolCropHeight } = resScreenDetection.roi;
      const targetW = symbolCropWidth || 153;
      const targetH = symbolCropHeight || 153;
      if (targetW > 0 && targetH > 0) {
        try {
          const fullBuf = Buffer.from(cleanBase64, 'base64');
          const croppedBuf = await sharp(fullBuf)
            .extract({
              left: Math.max(0, Math.min(symbolCropX || 0, (largura || 1280) - targetW)),
              top: Math.max(0, Math.min(symbolCropY || 0, (altura || 720) - targetH)),
              width: targetW,
              height: targetH,
            })
            .resize(153, 153)
            .toBuffer();
          symbolCrop153Base64 = croppedBuf.toString('base64');
          cropSource = 'SYMBOL_CROP_153X153';
          isResultZoneCrop = true;
          imageToSend = symbolCrop153Base64;
        } catch (err) {
          logger.warn(`[SYMBOL_CROP_153] Falha na extração via Sharp: ${err}`);
        }
      }
    }

    if (!symbolCrop153Base64) {
      if (framePayload.metadata?.symbolCropBase64 && framePayload.metadata.symbolCropBase64.length > 50) {
        imageToSend = framePayload.metadata.symbolCropBase64;
        cropSource = 'SYMBOL_CROP_CLIENT';
        isResultZoneCrop = true;
      } else if (framePayload.metadata?.resultScreenCroppedBase64 && framePayload.metadata.resultScreenCroppedBase64.length > 50) {
        imageToSend = framePayload.metadata.resultScreenCroppedBase64;
        cropSource = 'RESULT_SCREEN_CROP';
        isResultZoneCrop = true;
      } else if (framePayload.metadata?.croppedBase64) {
        imageToSend = framePayload.metadata.croppedBase64;
        cropSource = 'ROI';
      }
    }

    const cropBytes = Math.round((imageToSend.length * 3) / 4);
    const cropPixelCount = 153 * 153;
    const isBase64Valid = typeof imageToSend === 'string' && imageToSend.length > 50;

    const cropDiagInfo = {
      width: isResultZoneCrop ? 153 : (resScreenDetection.roi?.width || largura),
      height: isResultZoneCrop ? 153 : (resScreenDetection.roi?.height || altura),
      mime: mimeType,
      bytes: cropBytes,
      pixelCount: cropPixelCount,
      base64Valid: isBase64Valid,
      source: cropSource,
    };

    logger.info(
      `[SYMBOL_CROP_DIAGNOSTIC]\n` +
      `CROP WIDTH: ${cropDiagInfo.width}\n` +
      `CROP HEIGHT: ${cropDiagInfo.height}\n` +
      `MIME: ${cropDiagInfo.mime}\n` +
      `BASE64 VALID: ${cropDiagInfo.base64Valid}\n` +
      `BYTES: ${cropDiagInfo.bytes}\n` +
      `PIXEL COUNT: ${cropDiagInfo.pixelCount}\n` +
      `SOURCE: ${cropDiagInfo.source}`
    );

    // ARQUITETURA DE RECONHECIMENTO LOCAL (REQUISITO FUNDAMENTAL + RESULT SCREEN GATE)
    const isResultScreenConfirmed = sessao.visionAnalyzer.peekResultScreenConfirmed(
      resScreenDetection.resultadoScreenDetected,
      resScreenDetection.confidence
    );

    const gateInfo = sessao.visionAnalyzer.getResultScreenGateInfo();

    // Executar reconhecimento LOCAL somente se a Tela de Resultado estiver validada/confirmada pelo Gate
    const localRes = await LocalWheelRecognizer.recognizeCrop(imageToSend, isResultScreenConfirmed);
    const localConfig = LocalWheelRecognizer.getConfig();

    resultScreenDiagnostico.localRecognitionEnabled = localConfig.LOCAL_RECOGNITION_ENABLED;
    resultScreenDiagnostico.geminiFallbackEnabled = localConfig.GEMINI_FALLBACK_ENABLED;
    resultScreenDiagnostico.localOnlyMode = localConfig.LOCAL_ONLY_MODE;
    resultScreenDiagnostico.localConfidenceThreshold = localConfig.LOCAL_CONFIDENCE_THRESHOLD;
    resultScreenDiagnostico.localWinner = localRes.candidato1;
    resultScreenDiagnostico.localConfidence = localRes.score1;
    resultScreenDiagnostico.localSecondCandidate = localRes.candidato2;
    resultScreenDiagnostico.localGap = localRes.gap;
    resultScreenDiagnostico.localScoresPorObjeto = localRes.scoresPorObjeto;
    resultScreenDiagnostico.gateInfo = gateInfo;
    resultScreenDiagnostico.cropDiagnosticInfo = cropDiagInfo;

    logger.info(
      `[LOCAL_RECOGNIZER]\n` +
      `frameId=${sessao.totalFrames}\n` +
      `object=${localRes.candidato1}\n` +
      `confidence=${Math.round(localRes.score1 * 100)}\n` +
      `valid=${localRes.accepted}\n` +
      `localOnlyMode=${localConfig.LOCAL_ONLY_MODE}`
    );

    logger.info(
      `[LOCAL_RECOGNITION]\n` +
      `frame=${sessao.totalFrames}\n` +
      `gateStatus=${gateInfo.status}\n` +
      `recognitionAllowed=${gateInfo.recognitionAllowed}\n` +
      `stableFrames=${gateInfo.stableFrames}/${gateInfo.maxStableFrames}\n` +
      `winner=${localRes.candidato1}\n` +
      `score=${Math.round(localRes.score1 * 100)}%\n` +
      `second=${localRes.candidato2}\n` +
      `gap=${Math.round(localRes.gap * 100)}%`
    );

    logger.info(
      `[LOCAL_MATCH]\n` +
      `object=${localRes.objetoDetectado}\n` +
      `score=${Math.round(localRes.confianca * 100)}%\n` +
      `method=local`
    );

    const roundId = sessao.currentRoundId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A';
    const callsStarted = sessao.geminiCallsStartedCurrentRound ?? sessao.geminiCallsCurrentRound ?? 0;
    const maxCallsPerRound = 2;
    const currentAnalyzerState = sessao.visionAnalyzer.getCurrentState();
    const isRoundAlreadyConfirmed =
      currentAnalyzerState === 'RESULTADO_CONFIRMADO' ||
      currentAnalyzerState === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
      currentAnalyzerState === 'AGUARDANDO_PROXIMA_RODADA';

    const isLocalAccepted =
      isResultScreenConfirmed &&
      localRes.objetoDetectado !== 'nenhum' &&
      localRes.confianca >= localConfig.LOCAL_CONFIDENCE_THRESHOLD;

    let candidateObject: WheelObjectName | null = null;
    let candidateConfidence = 0;
    let recognitionMethod: 'LOCAL' | 'NENHUM' = 'NENHUM';

    if (!isResultScreenConfirmed) {
      candidateObject = null;
      candidateConfidence = 0;
      recognitionMethod = 'NENHUM';
      resultScreenDiagnostico.localDecision = 'REJECT';
      resultScreenDiagnostico.geminiFallbackTriggered = false;
      resultScreenDiagnostico.geminiFallbackReason = 'RESULT_SCREEN_NOT_CONFIRMED';
      resultScreenDiagnostico.reconhecimentoMetodo = 'NENHUM';

      logger.info(`[FALSE_RESULT_BLOCKED] reason=RESULT_SCREEN_NOT_CONFIRMED matcherSkipped=true`);
    } else {
      const isValidSymbol = localRes.accepted && localRes.candidato1 !== 'nenhum' && isAllowedWheelObject(localRes.candidato1);

      if (isValidSymbol) {
        candidateObject = localRes.candidato1 as WheelObjectName;
        candidateConfidence = Math.round(localRes.score1 * 100);
        recognitionMethod = 'LOCAL';
        resultScreenDiagnostico.localDecision = 'ACCEPT';
      } else {
        candidateObject = null;
        candidateConfidence = 0;
        recognitionMethod = 'NENHUM';
        resultScreenDiagnostico.localDecision = localRes.candidato1 === 'nenhum' ? 'REJECT' : 'AMBIGUOUS';
      }

      logger.info(
        `[LOCAL_DECISION]\n` +
        `decision=${isValidSymbol ? 'ACCEPT' : (localRes.candidato1 === 'nenhum' ? 'REJECT' : 'AMBIGUOUS')}\n` +
        `object=${candidateObject || 'nenhum'}\n` +
        `confidence=${candidateConfidence}\n` +
        `reason=${localRes.reason || 'LOCAL_RECOGNITION'}`
      );

      resultScreenDiagnostico.geminiFallbackTriggered = false;
      resultScreenDiagnostico.geminiFallbackReason = 'GEMINI_DISABLED_LOCAL_ONLY';
      resultScreenDiagnostico.reconhecimentoMetodo = recognitionMethod;
    }

    // ETAPA 4 — ENTRADA DO ANALYZER
    const analyzerInputObj = candidateObject || 'nenhum';
    const analyzerInputConf = candidateConfidence;
    const analyzerInputGap = Math.round(localRes.gap * 100);
    const analyzerInputStatus = localRes.accepted ? 'ACCEPT' : 'REJECT';

    logger.info(
      `[ANALYZER_INPUT]\n` +
      `object = ${analyzerInputObj}\n` +
      `confidence = ${analyzerInputConf}\n` +
      `gap = ${analyzerInputGap}\n` +
      `status = ${analyzerInputStatus}`
    );

    const inputObjStr = String(analyzerInputObj);
    if (!inputObjStr || inputObjStr === 'nenhum' || inputObjStr === 'null' || inputObjStr === 'undefined' || inputObjStr === 'nao_identificado') {
      logger.warn(
        `[ANALYZER_INPUT_ERROR]\n` +
        `reason = Candidate object is empty or invalid (isResultScreenConfirmed=${isResultScreenConfirmed}, localResAccepted=${localRes.accepted}, cand1=${localRes.candidato1}, reason=${localRes.reason})`
      );
    }

    // ETAPA 5 — NORMALIZAÇÃO DO NOME
    const normalizedCandidate = normalizeObject(candidateObject).normalized;
    logger.info(
      `[NORMALIZED_NAME]\n` +
      `raw = ${candidateObject || 'null'}\n` +
      `normalized = ${normalizedCandidate || 'nenhum'}`
    );

    // Passar candidato direto para o Vision Analyzer (Estabilização 3x @ 85%)
    const analysis = sessao.visionAnalyzer.processarDeteccao(
      candidateObject,
      candidateConfidence,
      resScreenDetection.resultadoScreenDetected,
      resScreenDetection.confidence,
      sessao.sessionId,
      sessao.totalFrames
    );

    const finalObjCandidate = analysis.status === 'confirmado' ? analysis.objeto : (analysis.candidateResult?.candidato || (candidateObject || 'nao_identificado'));

    // ETAPA 7 — RESULTADO FINAL
    logger.info(
      `[FINAL_RESULT_INPUT]\n` +
      `object = ${finalObjCandidate}\n` +
      `confidence = ${analysis.confianca}\n` +
      `eventId = ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}`
    );

    resultScreenDiagnostico.objetoFinal = finalObjCandidate;
    resultScreenDiagnostico.confiancaFinal = analysis.confianca;

    logger.info(
      `[FINAL_RESULT]\n` +
      `object = ${resultScreenDiagnostico.objetoFinal}\n` +
      `confidence = ${resultScreenDiagnostico.confiancaFinal}\n` +
      `eventId = ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}`
    );

    if (resultScreenDiagnostico.objetoFinal === 'nao_identificado' && localRes.accepted && localRes.candidato1 !== 'nenhum') {
      logger.error(
        `[FINAL_RESULT_MAPPING_ERROR]\n` +
        `sourceObject = ${localRes.candidato1}\n` +
        `sourceConfidence = ${Math.round(localRes.score1 * 100)}\n` +
        `sourceGap = ${Math.round(localRes.gap * 100)}\n` +
        `finalObject = nao_identificado\n` +
        `reason = Analyzer state is ${analysis.state} (status=${analysis.status})`
      );
    }

    if (analysis.status === 'confirmado') {
      logger.info(
        `[RESULT_CONFIRMED]\n` +
        `roundId=${sessao.currentRoundId || analysis.eventId}\n` +
        `eventId=${analysis.eventId}\n` +
        `object=${analysis.objeto}\n` +
        `confidence=${analysis.confianca}\n` +
        `method=${recognitionMethod}`
      );
    }

    if (localConfig.LOCAL_ONLY_MODE || recognitionMethod === 'LOCAL') {
      const timestampFrameCapturado = framePayload.timestamp || Date.now();
      const analyzerStateBefore = currentAnalyzerState;
      const analyzerStateAfter = analysis.state;

      sessao.candidatoAtual = analysis.candidateResult?.candidato || null;
      sessao.confirmacoesConsecutivas = analysis.candidateResult?.confirmacoesConsecutivas || 0;

      let foiConfirmadoAgora = false;
      let gravadoNoSupabase = false;
      let rodadaRegistrada: number | null = null;
      let motivoEstabilizacao = '';
      let timestampConfirmacao: number | null = null;
      let timestampRegistroSupabase: number | null = null;
      let latenciaDeteccaoParaRegistroMs: number | null = null;

      if (analysis.status === 'nao_identificado') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Objeto não identificado ou resposta nula/aguardando.`;
      } else if (analysis.status === 'descartado_baixa_confianca') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Confiança abaixo do mínimo exigido (${candidateConfidence}% < ${sessao.minConfidenceRequired}%).`;
      } else if (analysis.status === 'descartado_fora_de_tela_resultado') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Fora da Tela de Resultado.`;
      } else if (analysis.status === 'duplicado') {
        sessao.totalDescartes++;
        sessao.duplicacoesBloqueadas++;

        motivoEstabilizacao = `Aguardando saída da Tela de Resultado para a rodada ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'atual'}`;
      } else if (analysis.status === 'em_analise') {
        motivoEstabilizacao = `Analisando candidato "${candidateObject || 'reconhecendo'}" (${sessao.confirmacoesConsecutivas}/${sessao.consecutiveConfirmationsRequired} confirmações consec. | ${candidateConfidence}% conf.)`;
      } else if (analysis.status === 'confirmado' && analysis.objetoPadraoParaBanco && analysis.eventId) {
        foiConfirmadoAgora = true;
        timestampConfirmacao = Date.now();
        sessao.ultimoObjetoConfirmado = analysis.objetoPadraoParaBanco.resultado;
        sessao.horarioUltimaConfirmacao = timestampConfirmacao;
        sessao.confiancaUltimaConfirmacao = analysis.objetoPadraoParaBanco.confianca;
        sessao.totalRodadasDetectadasSessao++;

        logger.info(`[CONFIRMED]\n${analysis.objetoPadraoParaBanco.resultado}`);

        try {
          sessao.tentativasPersistencia++;
          logger.info(`[REGISTER]\nTentando registrar ${analysis.objetoPadraoParaBanco.resultado}`);
          const resAuto = await safeRegistrarResultado(
            analysis.objetoPadraoParaBanco.resultado,
            analysis.objetoPadraoParaBanco.confianca,
            analysis.eventId,
            sessao.sessionId
          );
          timestampRegistroSupabase = Date.now();
          latenciaDeteccaoParaRegistroMs = timestampRegistroSupabase - timestampFrameCapturado;
          gravadoNoSupabase = resAuto.registrado;
          rodadaRegistrada = resAuto.rodadaRegistrada || null;

          const persistEnabled = isAutoPersistEnabled();

          // TELEMETRIA OBRIGATÓRIA: [PERSISTENCE]
          logger.info(
            `[PERSISTENCE]\n` +
            `eventId=${analysis.eventId}\n` +
            `insertAttempt=${persistEnabled}\n` +
            `insertSuccess=${resAuto.registrado}\n` +
            `insertedId=${resAuto.insertedId || 'N/A'}\n` +
            `selectVerification=${resAuto.registrado}\n` +
            `persistenceConfirmed=${resAuto.registrado}`
          );

          // TELEMETRIA OBRIGATÓRIA: [ROUND_PIPELINE_TRACE]
          logger.info(
            `[ROUND_PIPELINE_TRACE]\n` +
              `eventId=${analysis.eventId}\n` +
              `roundId=${rodadaRegistrada || 'N/A'}\n` +
              `object=${analysis.objetoPadraoParaBanco.resultado}\n` +
              `confidence=${analysis.objetoPadraoParaBanco.confianca}\n` +
              `analyzerStatus=${analysis.state}\n` +
              `persistenceEnabled=${persistEnabled}\n` +
              `insertAttempt=${persistEnabled}\n` +
              `insertSuccess=${resAuto.registrado}\n` +
              `insertedId=${resAuto.insertedId || 'N/A'}\n` +
              `selectVerification=${resAuto.registrado}\n` +
              `persistenceConfirmed=${resAuto.registrado}\n` +
              `historyAppend=true\n` +
              `dashboardSync=true`
          );

          const confirmedItem: ConfirmedRoundHistoryEntry = {
            timestamp: timestampConfirmacao,
            objeto: analysis.objetoPadraoParaBanco.resultado,
            confianca: analysis.objetoPadraoParaBanco.confianca,
            eventId: analysis.eventId,
            estado: analysis.state,
            persistido: resAuto.registrado ? 'SIM' : (persistEnabled ? `NÃO (${resAuto.motivo})` : 'NÃO (PERSISTÊNCIA DESABILITADA)'),
          };
          sessao.confirmedRoundsHistory = [confirmedItem, ...sessao.confirmedRoundsHistory].slice(0, 50);

          logger.info(
            `[LIVE_SYNC]\n` +
              `eventId=${analysis.eventId}\n` +
              `rodada=${rodadaRegistrada || 'N/A'}\n` +
              `registrado=${resAuto.registrado}\n` +
              `motivo=${resAuto.motivo}`
          );

          if (resAuto.registrado) {
            sessao.registrosCriados++;
            logger.info(`[REGISTER]\nSucesso: Rodada #${rodadaRegistrada} salva no Supabase (ID: ${resAuto.insertedId || 'OK'})`);
            motivoEstabilizacao = `SISTEMA LIVE: Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" (${analysis.eventId}) salva no Supabase (#${rodadaRegistrada})`;
          } else {
            sessao.duplicacoesBloqueadas++;
            if (!persistEnabled) {
              logger.info(`[REGISTER]\nPersistência Desabilitada: ${resAuto.motivo}`);
              motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada (PERSISTÊNCIA DESABILITADA)`;
            } else {
              logger.info(`[REGISTER]\nFALHA: ${resAuto.motivo}`);
              logger.error(`[PERSISTENCE_FAILED]\neventId=${analysis.eventId}\nroundId=${rodadaRegistrada || 'N/A'}\nobject=${analysis.objetoPadraoParaBanco.resultado}\nreason=${resAuto.motivo}`);
              motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada, mas FALHA ao salvar no Supabase: ${resAuto.motivo}`;
            }
          }
        } catch (errDb: any) {
          logger.error('[WHEEL VISION] Erro ao gravar no Supabase:', errDb?.message);
          motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada, mas erro ao salvar no Supabase: ${errDb?.message}`;
        }
      }

      // TELEMETRIA OBRIGATÓRIA [BALAO_DEBUG]
      if (candidateObject === 'balao' || normalizedCandidate === 'balao' || analysis.objeto === 'balao') {
        logger.info(
          `[BALAO_DEBUG]\n` +
          `raw=${candidateObject || 'null'}\n` +
          `normalized=${normalizedCandidate || 'nenhum'}\n` +
          `confidence=${candidateConfidence}%\n` +
          `gap=${Math.round((localRes?.gap || 0) * 100)}%\n` +
          `recognizer=${localRes?.accepted ? 'PASS' : 'FAIL'}\n` +
          `analyzer=${analysis.status}\n` +
          `confirmed=${foiConfirmadoAgora}\n` +
          `eventId=${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}\n` +
          `round=${rodadaRegistrada || 'N/A'}\n` +
          `dedup=${analysis.status === 'duplicado' ? 'BLOCKED' : 'PASS'}\n` +
          `supabase=${gravadoNoSupabase ? 'SUCCESS' : (foiConfirmadoAgora ? 'FAILED' : 'PENDING')}\n` +
          `history=${foiConfirmadoAgora ? 'APPENDED' : 'WAITING'}`
        );
      }

      let analyzerTag: AnalyzerStatusTag = 'ANALYZER_IDLE';
      if (analysis.status === 'confirmado') {
        analyzerTag = 'ANALYZER_CONFIRMED';
      } else if (analysis.status === 'nao_identificado' || analysis.status === 'descartado_baixa_confianca' || analysis.status === 'descartado_fora_de_tela_resultado') {
        analyzerTag = 'ANALYZER_DISCARDED';
      } else if (analysis.status === 'duplicado' || analyzerStateAfter === 'WAITING_FOR_RESULT_SCREEN_EXIT' || analyzerStateAfter === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || analyzerStateAfter === 'AGUARDANDO_PROXIMA_RODADA') {
        analyzerTag = 'ANALYZER_WAITING_CHANGE';
      } else if (analyzerStateAfter === 'LEITURA_RESULTADO' || analyzerStateAfter === 'TELA_RESULTADO_DETECTADA' || analysis.status === 'em_analise') {
        analyzerTag = 'ANALYZER_CANDIDATE';
      }

      const geminiResultObj = {
        object: null,
        confidence: 0,
        status: 'DISABLED' as const,
        reason: 'LOCAL_ONLY_MODE',
      };

      const localRecognizerResultObj = {
        object: localRes.accepted && isAllowedWheelObject(localRes.candidato1) ? localRes.candidato1 : null,
        confidence: localRes.accepted ? Math.round(localRes.score1 * 100) : 0,
        gap: Math.round(localRes.gap * 100),
        secondCandidate: localRes.candidato2 || null,
        status: (localRes.accepted && isAllowedWheelObject(localRes.candidato1) ? 'VALID' : (localRes.candidato1 === 'nenhum' ? 'NO_MATCH' : 'AMBIGUOUS')) as any,
        scoresPorObjeto: localRes.scoresPorObjeto,
      };

      const finalAnalyzerResultObj = {
        object: analysis.status === 'confirmado' ? analysis.objeto : (sessao.candidatoAtual || null),
        confidence: analysis.status === 'confirmado' ? analysis.confianca : (sessao.candidatoAtual ? candidateConfidence : 0),
        gap: Math.round(localRes.gap * 100),
        confirmationCount: sessao.candidatoAtual ? sessao.confirmacoesConsecutivas : 0,
        requiredConfirmations: sessao.consecutiveConfirmationsRequired,
        status: (analysis.status === 'confirmado' ? 'CONFIRMED' : (sessao.candidatoAtual ? 'CANDIDATE' : 'IDLE')) as any,
        state: analysis.state,
        eventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || null,
      };

      const uiStateObj: UIRecognitionState = {
        geminiStatus: 'DESABILITADO',
        geminiReason: 'LOCAL_ONLY_MODE',
        geminiObject: null,
        geminiConfidence: 0,
        localStatus: 'ATIVO',
        localObject: localRes.accepted && isAllowedWheelObject(localRes.candidato1) ? localRes.candidato1 : null,
        localConfidence: localRes.accepted ? Math.round(localRes.score1 * 100) : 0,
        localGap: Math.round(localRes.gap * 100),
        localDecision: localRes.accepted && isAllowedWheelObject(localRes.candidato1) ? 'ACCEPT' : (localRes.candidato1 === 'nenhum' ? 'REJECT' : 'AMBIGUOUS'),
        analyzerState: analysis.state,
        candidateObject: sessao.candidatoAtual,
        candidateConfidence: sessao.candidatoAtual ? candidateConfidence : 0,
        candidateGap: sessao.candidatoAtual ? Math.round(localRes.gap * 100) : 0,
        confirmationCount: sessao.candidatoAtual ? sessao.confirmacoesConsecutivas : 0,
        requiredConfirmations: sessao.consecutiveConfirmationsRequired,
        confirmedObject: sessao.ultimoObjetoConfirmado,
        confirmedConfidence: sessao.confiancaUltimaConfirmacao || 0,
        confirmedState: analysis.status === 'confirmado' ? 'RESULT_CONFIRMED' : (sessao.visionAnalyzer.isRoundLocked() ? 'WAITING_EXIT' : 'IDLE'),
        eventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || null,
        persisted: foiConfirmadoAgora ? gravadoNoSupabase : false,
      };
      sessao.uiRecognitionState = uiStateObj;

      const traceEntry: RecentFrameTraceEntry = {
        frameId: sessao.totalFrames,
        sessionId: sessao.sessionId,
        connectionId: sessao.connectionId,
        timestamp: Date.now(),
        geminiRaw: 'LOCAL_ONLY_MODE (Gemini Desabilitado)',
        geminiObjeto: '—',
        geminiConfianca: 0,
        parserObjeto: candidateObject || 'nenhum',
        parserConfianca: candidateConfidence,
        analyzerStateBefore,
        analyzerStateAfter,
        candidate: sessao.candidatoAtual,
        confirmationCount: sessao.confirmacoesConsecutivas,
        lastConfirmedObject: sessao.ultimoObjetoConfirmado,
        currentEventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        confirmedNow: foiConfirmadoAgora,
        geminiTag: 'LOCAL_ONLY_MODE',
        analyzerTag,
        persistAttempt: false,
        wheelPhase: analysis.wheelPhase,
        sceneStabilityScore: analysis.sceneStability?.score,
        sceneStabilityState: analysis.sceneStability?.state,
        tempoEstavelMs: analysis.tempoEstavelMs,
      };
      sessao.recentFrameTraces = [traceEntry, ...sessao.recentFrameTraces].slice(0, 20);

      const latenciaTotalMs = Date.now() - timestampFrameCapturado;
      const latenciaObj: LiveLatencyInfo = {
        timestampFrameCapturado,
        timestampFrameEnviado: Date.now(),
        timestampRespostaGemini: Date.now(),
        timestampDeteccao: Date.now(),
        timestampConfirmacao,
        timestampRegistroSupabase,
        latenciaCapturaParaDeteccaoMs: latenciaTotalMs,
        latenciaDeteccaoParaRegistroMs,
        latenciaTotalMs,
      };

      const infoEstabilizacao: LiveStabilizationInfo = {
        candidatoAtual: sessao.candidatoAtual,
        confirmacoesConsecutivas: sessao.confirmacoesConsecutivas,
        confirmacoesNecessarias: sessao.consecutiveConfirmationsRequired,
        minConfidence: sessao.minConfidenceRequired,
        foiConfirmadoAgora,
        ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
        horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
        confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
        totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
        motivoEstabilizacao,
        gravadoNoSupabase,
        rodadaRegistrada,
        estadoAnalyzer: analysis.state,
        eventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        latencia: latenciaObj,
        sceneStability: analysis.sceneStability,
        wheelPhase: analysis.wheelPhase,
        tempoEstavelMs: analysis.tempoEstavelMs,
        framesRecebidos: sessao.totalFrames,
        deteccoesGemini: 0,
        candidatosCriados: sessao.visionAnalyzer.getMetrics().totalCandidatosIniciados,
        confirmacoes: sessao.visionAnalyzer.getMetrics().totalConfirmados,
        tentativasPersistencia: sessao.tentativasPersistencia,
        registrosCriados: sessao.registrosCriados,
        duplicacoesBloqueadas: sessao.duplicacoesBloqueadas + sessao.visionAnalyzer.getMetrics().totalDuplicacoesBloqueadas,
      };

      const pipelineSteps = {
        step1_captura: `✓ Frame #${sessao.totalFrames} (${largura}x${altura}, ${tamanhoKB})`,
        step2_crop: `✓ RESULT_ZONE (${resScreenDetection.roi?.cropWidth || 120}x${resScreenDetection.roi?.cropHeight || 120})`,
        step3_base64: `✓ Base64 Local OK`,
        step4_requestStarted: `✓ Local Recognition (${candidateObject || 'nenhum'} ${candidateConfidence}%)`,
        step5_requestSent: `✓ Local Only Mode (Sem chamada Gemini)`,
        step6_geminiResponded: `✓ Processado Localmente em ${latenciaTotalMs}ms`,
        step7_responseReceived: `✓ Status LOCAL OK`,
        step8_textExtracted: `✓ Matcher Local: ${localRes.candidato1} (${Math.round(localRes.score1 * 100)}%)`,
        step9_jsonParsed: `✓ Decisão: ${candidateObject || 'nenhum'}`,
        step10_validated: `✓ Status: ${analysis.status} | EventId: ${analysis.eventId || 'N/A'}`,
      };

      sessao.ultimoResultadoAt = Date.now();
      sessao.geminiCallsStartedCurrentRound = 0;
      sessao.geminiCallsCurrentRound = 0;

      return {
        objetoDetectado: candidateObject,
        confianca: candidateConfidence,
        transfereContexto: true,
        rawText: `LOCAL_ONLY_MODE: ${candidateObject || 'nenhum'} (${candidateConfidence}%)`,
        geminiEstadoLog: 'LOCAL_ONLY_MODE',
        geminiRawResponse: 'LOCAL_ONLY_MODE',
        geminiHttpStatus: 200,
        parsedPayload: { objetoDetectado: candidateObject || 'nenhum', confianca: candidateConfidence },
        frameDiagnostico,
        timestamp: sessao.ultimoResultadoAt,
        estabilizacao: infoEstabilizacao,
        latencia: latenciaObj,
        geminiTag: 'LOCAL_ONLY_MODE',
        analyzerTag,
        geminiResult: geminiResultObj,
        localRecognizerResult: localRecognizerResultObj,
        finalAnalyzerResult: finalAnalyzerResultObj,
        uiRecognitionState: uiStateObj,
        geminiPayloadInfo: {
          mimeType,
          base64Valid: true,
          base64Length: imageToSend.length,
          width: resScreenDetection.roi?.cropWidth || 120,
          height: resScreenDetection.roi?.cropHeight || 120,
          isResultZoneCrop,
        },
        pipelineSteps,
        recentFrameTraces: sessao.recentFrameTraces,
        confirmedRoundsHistory: sessao.confirmedRoundsHistory,
      };
    }

    // REGRA DE SEGURANÇA: Se a ROI da RESULT_ZONE/SYMBOL_CROP for inválida, NÃO chamar Gemini
    const roiValidation = WinnerReferenceMatcher.validateROI(resScreenDetection.roi, imageToSend);
    if (resScreenDetection.resultadoScreenDetected && (!roiValidation.isValid || (resScreenDetection.roi && resScreenDetection.roi.symbolCropValid === false))) {
      const blockReason = roiValidation.reason || 'SYMBOL_CROP_INVALID';
      logger.warn(`[RESULT-ROI] INVALID: ${blockReason} (Frame #${sessao.totalFrames}). Gemini SKIPPED.`);

      const currCalls = sessao.geminiCallsCurrentRound || 0;

      logger.info(
        `[LIVE_CALL_COUNTER]\n` +
        `frame=${sessao.totalFrames}\n` +
        `before=${currCalls}\n` +
        `after=${currCalls}\n` +
        `max=2\n` +
        `callStarted=false\n` +
        `blocked=true`
      );

      logger.info(
        `[LIVE_GEMINI_STATE]\n` +
        `frame=${sessao.totalFrames}\n` +
        `state=BLOCKED\n` +
        `callCount=${currCalls}\n` +
        `maxCalls=2\n` +
        `httpStatus=400\n` +
        `rawLength=0\n` +
        `parsedObject=null\n` +
        `confidence=null\n` +
        `blockReason=${blockReason}`
      );

      resultScreenDiagnostico.symbolCropValid = false;
      resultScreenDiagnostico.geminiRawResponse = blockReason;
      resultScreenDiagnostico.parserStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.parserObject = null;
      resultScreenDiagnostico.parserConfidence = null;
      resultScreenDiagnostico.matcherStatus = 'SKIPPED';
      resultScreenDiagnostico.matcherObject = null;
      resultScreenDiagnostico.matcherScore = null;
      resultScreenDiagnostico.finalStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.motivoDescarte = blockReason;

      return {
        objetoDetectado: null,
        confianca: null,
        rawText: blockReason,
        geminiEstadoLog: 'GEMINI_REQUEST_BLOCKED',
        geminiTag: 'GEMINI_REQUEST_BLOCKED',
        geminiCallsCurrentRound: currCalls,
        analyzerTag: 'ANALYZER_DISCARDED',
        frameDiagnostico,
        timestamp: Date.now(),
        pipelineSteps: {
          step1_captura: `✓ Frame #${sessao.totalFrames}`,
          step2_crop: `❌ ${blockReason}`,
          step3_base64: 'N/A',
          step4_requestStarted: 'N/A (ROI/Símbolo Inválido)',
          step5_requestSent: 'N/A',
          step6_geminiResponded: `🛑 BLOCKED: ${blockReason}`,
          step7_responseReceived: 'N/A',
          step8_textExtracted: 'SKIPPED',
          step9_jsonParsed: 'SKIPPED',
          step10_validated: 'SKIPPED',
        },
      };
    }

    const cleanImageToSend = imageToSend.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();

    if (!cleanImageToSend || cleanImageToSend.length === 0) {
      logger.error(`[GEMINI_PAYLOAD_ERROR] Base64 da RESULT_ZONE inválido ou vazio no frame #${sessao.totalFrames}.`);
      const currCalls = sessao.geminiCallsCurrentRound || 0;

      logger.info(
        `[LIVE_CALL_COUNTER]\n` +
        `frame=${sessao.totalFrames}\n` +
        `before=${currCalls}\n` +
        `after=${currCalls}\n` +
        `max=2\n` +
        `callStarted=false\n` +
        `blocked=true`
      );

      logger.info(
        `[LIVE_GEMINI_STATE]\n` +
        `frame=${sessao.totalFrames}\n` +
        `state=BLOCKED\n` +
        `callCount=${currCalls}\n` +
        `maxCalls=2\n` +
        `httpStatus=400\n` +
        `rawLength=0\n` +
        `parsedObject=null\n` +
        `confidence=null\n` +
        `blockReason=EMPTY_BASE64_PAYLOAD`
      );

      resultScreenDiagnostico.geminiRawResponse = 'EMPTY_BASE64_PAYLOAD';
      resultScreenDiagnostico.parserStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.parserObject = null;
      resultScreenDiagnostico.parserConfidence = null;
      resultScreenDiagnostico.matcherStatus = 'SKIPPED';
      resultScreenDiagnostico.matcherObject = null;
      resultScreenDiagnostico.matcherScore = null;
      resultScreenDiagnostico.finalStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.motivoDescarte = 'EMPTY_BASE64_PAYLOAD';

      return {
        objetoDetectado: null,
        confianca: null,
        rawText: 'EMPTY_BASE64_PAYLOAD',
        geminiEstadoLog: 'GEMINI_REQUEST_BLOCKED',
        geminiTag: 'GEMINI_REQUEST_BLOCKED',
        geminiHttpStatus: 400,
        geminiErrorCode: 'EMPTY_BASE64_PAYLOAD',
        geminiErrorMessage: 'Payload da imagem Base64 está vazio após remoção do cabeçalho data:image.',
        geminiCallsCurrentRound: currCalls,
        frameDiagnostico,
        timestamp: Date.now(),
        pipelineSteps: {
          step1_captura: `✓ Frame #${sessao.totalFrames}`,
          step2_crop: '✓ RESULT_ZONE',
          step3_base64: '❌ Base64 Inválido ou Vazio',
          step4_requestStarted: 'Cancelado',
          step5_requestSent: 'Cancelado',
          step6_geminiResponded: '🛑 BLOCKED: EMPTY_BASE64_PAYLOAD',
          step7_responseReceived: 'Status: 400 Bad Request',
          step8_textExtracted: 'SKIPPED',
          step9_jsonParsed: 'SKIPPED',
          step10_validated: 'SKIPPED',
        },
      };
    }

    // Incrementar contadores no MOMENTO EXATO em que a chamada real ao Gemini é iniciada
    const beforeCalls = sessao.geminiCallsStartedCurrentRound ?? sessao.geminiCallsCurrentRound ?? 0;
    sessao.geminiCallsStartedCurrentRound = beforeCalls + 1;
    sessao.geminiCallsCurrentRound = sessao.geminiCallsStartedCurrentRound;
    const afterCalls = sessao.geminiCallsCurrentRound;
    const nowMs = Date.now();
    sessao.geminiCallTimestamps = [...(sessao.geminiCallTimestamps || []).filter(ts => nowMs - ts < 60000), nowMs];

    logger.info(
      `[LIVE_CALL_COUNTER]\n` +
      `frame=${sessao.totalFrames}\n` +
      `before=${beforeCalls}\n` +
      `after=${afterCalls}\n` +
      `max=2\n` +
      `callStarted=true\n` +
      `blocked=false`
    );

    try {
      sessao.geminiRequestInFlight = true;
      const ai = getGenAIClient();

      const prompt = `Você está identificando exclusivamente o símbolo vencedor mostrado na Tela de Resultado da Roda Gigante.

Analise somente o símbolo central da imagem recebida.

Os únicos resultados possíveis são:

sorvete
boia
balao
soco
tedy
princesa
camera
coroa
nenhum

Não invente objetos.
Não considere elementos da roda normal.
Não considere textos, botões, moedas, avatares ou elementos externos.
Se o símbolo vencedor não estiver claramente visível, responda nenhum.

Retorne JSON válido exatamente neste formato:

{
  "objetoDetectado": "sorvete|boia|balao|soco|tedy|princesa|camera|coroa|nenhum",
  "confianca": 0.0
}`;

      const timestampFrameCapturado = framePayload.timestamp || Date.now();
      const timestampFrameEnviado = Date.now();
      const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const cropW = resScreenDetection.roi?.symbolCropWidth || 153;
      const cropH = resScreenDetection.roi?.symbolCropHeight || 153;
      const base64Len = cleanImageToSend.length;
      const promptLen = prompt.length;
      const reqModel = sessao.model || 'gemini-3.6-flash';

      const imageToSendBytes = computeBase64Bytes(cleanImageToSend);
      const imageToSendHash = computeBase64Hash(cleanImageToSend);

      logger.info(
        `[LIVE_REAL_BACKEND] FRAME_RECEIVED #${sessao.totalFrames}\n` +
        `[LIVE_REAL_BACKEND] WINNER_CROP_AVAILABLE: ${!!cleanImageToSend}\n` +
        `[LIVE_REAL_BACKEND] WINNER_CROP_SIZE: ${cropW}x${cropH}\n` +
        `[LIVE_REAL_BACKEND] WINNER_CROP_BASE64_LENGTH: ${cleanImageToSend.length}\n` +
        `[WINNER_CROP] size=${cropW}x${cropH} bytes=${imageToSendBytes} hash=${imageToSendHash}\n` +
        `[GEMINI_IMAGE] size=${cropW}x${cropH} bytes=${imageToSendBytes} hash=${imageToSendHash}\n` +
        `[LIVE_REAL_BACKEND] GEMINI_REQUEST_START`
      );

      logger.info(
        `[LIVE_DEBUG] FRAME_RECEIVED #${sessao.totalFrames}\n` +
        `[LIVE_DEBUG] BASE64_LENGTH: ${cleanBase64.length}\n` +
        `[LIVE_DEBUG] MIME_TYPE: ${mimeType}\n` +
        `[LIVE_DEBUG] RESULT_SCREEN_DETECTED: ${resScreenDetection.resultadoScreenDetected}\n` +
        `[LIVE_DEBUG] RESULT_SCREEN_CROP_AVAILABLE: ${!!framePayload.metadata?.resultScreenCroppedBase64}\n` +
        `[LIVE_DEBUG] SYMBOL_CROP_AVAILABLE: ${!!framePayload.metadata?.symbolCropBase64}\n` +
        `[LIVE_DEBUG] SYMBOL_CROP_SIZE: ${cropW}x${cropH}\n` +
        `[LIVE_DEBUG] WINNER_CROP_AVAILABLE: ${!!framePayload.metadata?.winnerCropBase64 || !!framePayload.metadata?.resultScreenCroppedBase64}\n` +
        `[LIVE_DEBUG] WINNER_CROP_SIZE: ${cropW}x${cropH}\n` +
        `[LIVE_DEBUG] GEMINI_REQUEST_START`
      );

      logger.info(
        `[GEMINI_REQUEST]\n` +
        `source=${cropSource}\n` +
        `width=${cropW}\n` +
        `height=${cropH}\n` +
        `base64Length=${base64Len}\n` +
        `mimeType=${mimeType}`
      );

      const { response, modelUsed, responseTimeMs } = await generateContentWithFallback(
        ai,
        {
          model: reqModel,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanImageToSend,
                  mimeType,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                objetoDetectado: { type: Type.STRING },
                confianca: { type: Type.NUMBER },
              },
              required: ['objetoDetectado', 'confianca'],
            },
          },
        },
        15000 // Timeout estrito de 15s (REQUIREMENT #3)
      );

      logger.info(`[GEMINI_RESPONSE] requestId=${requestId} httpStatus=200 latencyMs=${responseTimeMs} responseReceived=true`);
      sessao.geminiCallsCompletedCurrentRound = (sessao.geminiCallsCompletedCurrentRound || 0) + 1;
      sessao.lastGeminiHttpStatus = 200;
      sessao.lastGeminiError = undefined;
      sessao.lastGeminiErrorMessage = undefined;

      if (modelUsed !== sessao.model) {
        sessao.model = modelUsed;
      }

      const timestampRespostaGemini = Date.now();
      const timestampDeteccao = timestampRespostaGemini;
      const latenciaCapturaParaDeteccaoMs = timestampDeteccao - timestampFrameCapturado;

      sessao.ultimoTempoRespostaMs = responseTimeMs;
      sessao.somaLatenciaMs += responseTimeMs;
      sessao.contadorLatencias++;

      // Extração de Texto via Camada Segura (REQUIREMENT #9)
      const responseText = extractGeminiText(response);
      sessao.ultimaRespostaBrutaGemini = responseText || '(sem resposta do modelo)';

      // Parser de Resposta do Gemini (REQUIREMENT #10)
      const parsedResult = parseGeminiResponse(responseText);
      let { geminiEstadoLog, parsedPayload, objetoRaw, confiancaRaw, isJsonValid, detectedStrLog } = parsedResult;

      if (geminiEstadoLog === 'GEMINI_NO_RESPONSE') {
        sessao.totalSemResposta++;
      } else if (geminiEstadoLog === 'GEMINI_NO_OBJECT' || geminiEstadoLog === 'GEMINI_AGUARDANDO') {
        sessao.totalAguardando++;
      } else if (geminiEstadoLog === 'GEMINI_INVALID_JSON' || geminiEstadoLog === 'GEMINI_PARSE_ERROR') {
        sessao.totalErrosParser++;
      }

      logger.info(
        `[RESULT-PARSER]\n` +
          `raw=${JSON.stringify(responseText)}\n` +
          `jsonValid=${isJsonValid}\n` +
          `objetoDetectado=${detectedStrLog}\n` +
          `parserStatus=${geminiEstadoLog}`
      );

      sessao.ultimoEstadoGemini = geminiEstadoLog;
      sessao.ultimoResultadoAt = Date.now();

      const originalGeminiObject = objetoRaw;
      const originalGeminiConfidence = confiancaRaw;

      logger.info(
        `[LIVE_GEMINI_STATE]\n` +
        `frame=${sessao.totalFrames}\n` +
        `state=${geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' ? 'OBJECT_DETECTED' : geminiEstadoLog === 'GEMINI_NO_OBJECT' ? 'NO_OBJECT' : 'BLOCKED'}\n` +
        `callCount=${sessao.geminiCallsCurrentRound}\n` +
        `maxCalls=2\n` +
        `httpStatus=200\n` +
        `rawLength=${responseText?.length || 0}\n` +
        `parsedObject=${originalGeminiObject || 'nenhum'}\n` +
        `confidence=${originalGeminiConfidence || 0}\n` +
        `blockReason=none`
      );

      logger.info(`[GEMINI_RESULT]\nFrame #${sessao.totalFrames} → ${originalGeminiObject || 'nenhum'}`);

      // Comparação visual direta contra as 8 referências oficiais (Async Feature Matching)
      const bestVisualMatch = await WheelObjectVisualMatcher.findBestVisualMatchAsync(cleanImageToSend);

      // COMPARAÇÃO VISUAL E MOTOR DE CONSENSO (GEMINI É A FONTE SEMÂNTICA PRINCIPAL)
      const visualCandidate = bestVisualMatch.simboloCandidatoVisual;
      const visualObject: WheelObjectName | null = (visualCandidate && visualCandidate !== 'nenhum' && isAllowedWheelObject(visualCandidate)) ? visualCandidate : null;
      const visualConf = bestVisualMatch.scoreVisual || 0;

      const geminiObject: WheelObjectName | null = (originalGeminiObject && isAllowedWheelObject(originalGeminiObject)) ? originalGeminiObject : null;
      const geminiConf = originalGeminiConfidence || 0;

      let finalObject: WheelObjectName | null = null;
      let finalConfidence = 0;
      let consensusType: 'MATCH' | 'GEMINI_DOMINATES' | 'DIVERGENCIA' | 'NO_OBJECT' = 'NO_OBJECT';

      if (!geminiObject) {
        consensusType = 'NO_OBJECT';
        finalObject = null;
        finalConfidence = 0;
      } else if (visualObject === geminiObject) {
        consensusType = 'MATCH';
        finalObject = geminiObject;
        finalConfidence = Math.max(geminiConf, Math.round((geminiConf * 0.7) + (visualConf * 0.3)));
      } else if (geminiConf >= 75 && (!visualObject || visualConf < 70)) {
        consensusType = 'GEMINI_DOMINATES';
        finalObject = geminiObject;
        finalConfidence = geminiConf;
      } else if (visualObject && geminiObject && visualObject !== geminiObject && geminiConf >= 75 && visualConf >= 70) {
        consensusType = 'DIVERGENCIA';
        finalObject = null;
        finalConfidence = 0;
        logger.warn(`[CONSENSUS_DIVERGENCE] Gemini='${geminiObject}' (${geminiConf}%) vs Visual='${visualObject}' (${visualConf}%). Descartando por divergência.`);
      } else if (geminiConf >= 70) {
        consensusType = 'GEMINI_DOMINATES';
        finalObject = geminiObject;
        finalConfidence = geminiConf;
      } else {
        consensusType = 'NO_OBJECT';
        finalObject = null;
        finalConfidence = 0;
      }

      logger.info(
        `[LIVE_REAL_BACKEND] GEMINI_RESPONSE (${responseTimeMs}ms)\n` +
        `[LIVE_REAL_BACKEND] RAW_LENGTH: ${responseText ? responseText.length : 0}\n` +
        `[LIVE_REAL_BACKEND] PARSED_OBJECT: ${originalGeminiObject || 'nenhum'}\n` +
        `[LIVE_REAL_BACKEND] PARSED_CONFIDENCE: ${originalGeminiConfidence || 0}\n` +
        `[LIVE_REAL_BACKEND] MATCH_OBJECT: ${bestVisualMatch.simboloCandidatoVisual || 'nenhum'}\n` +
        `[LIVE_REAL_BACKEND] MATCH_SCORE: ${bestVisualMatch.scoreVisual || 0}\n` +
        `[LIVE_REAL_BACKEND] FINAL_OBJECT: ${finalObject || 'nenhum'}\n` +
        `[LIVE_REAL_BACKEND] FINAL_CONFIDENCE: ${finalConfidence}`
      );

      logger.info(
        `[LIVE_DEBUG] GEMINI_RESPONSE_RECEIVED (${responseTimeMs}ms)\n` +
        `[LIVE_DEBUG] RAW_TEXT_LENGTH: ${responseText.length}\n` +
        `[LIVE_DEBUG] RAW_TEXT: ${responseText}\n` +
        `[LIVE_DEBUG] PARSER_START\n` +
        `[LIVE_DEBUG] PARSER_OBJECT: ${originalGeminiObject || 'nenhum'}\n` +
        `[LIVE_DEBUG] PARSER_CONFIDENCE: ${originalGeminiConfidence || 0}\n` +
        `[LIVE_DEBUG] MATCHER_OBJECT: ${bestVisualMatch.simboloCandidatoVisual || 'nenhum'}\n` +
        `[LIVE_DEBUG] FINAL_OBJECT: ${finalObject || 'nenhum'}\n` +
        `[LIVE_DEBUG] FINAL_CONFIDENCE: ${finalConfidence}`
      );

      // LOGS OBRIGATÓRIOS DO PIPELINE
      logger.info(`[GEMINI_RAW_RESPONSE] requestId=${requestId} raw=${JSON.stringify(responseText)}`);
      logger.info(`[GEMINI_RESPONSE_LENGTH] requestId=${requestId} length=${responseText ? responseText.length : 0}`);
      logger.info(`[GEMINI_RESPONSE_TYPE] requestId=${requestId} type=${typeof responseText}`);

      logger.info(`[PARSER_INPUT] requestId=${requestId} input=${JSON.stringify(responseText)}`);
      logger.info(`[PARSER_STATUS] requestId=${requestId} status=${geminiEstadoLog}`);
      logger.info(`[PARSER_OBJECT] requestId=${requestId} object=${originalGeminiObject || 'nenhum'}`);
      logger.info(`[PARSER_CONFIDENCE] requestId=${requestId} confidence=${originalGeminiConfidence || 0}%`);
      logger.info(`[PARSER_ERROR] requestId=${requestId} error=${parsedResult.errorMessage || 'null'}`);

      logger.info(`[MATCHER_INPUT] requestId=${requestId} input=SYMBOL_CROP_${resScreenDetection.roi?.symbolCropWidth || 0}x${resScreenDetection.roi?.symbolCropHeight || 0}`);
      logger.info(`[MATCHER_OBJECT] requestId=${requestId} object=${bestVisualMatch.simboloCandidatoVisual || 'nenhum'}`);
      logger.info(`[MATCHER_SCORE] requestId=${requestId} score=${bestVisualMatch.scoreVisual}%`);
      logger.info(`[MATCHER_STATUS] requestId=${requestId} status=${bestVisualMatch.simboloCandidatoVisual !== 'nenhum' ? 'MATCH' : 'NO_MATCH'}`);
      logger.info(`[MATCHER_SECOND_BEST] requestId=${requestId} secondBest=${bestVisualMatch.segundoMelhorCandidato || 'nenhum'}`);
      logger.info(`[MATCHER_GAP] requestId=${requestId} gap=${bestVisualMatch.distanciaScoreComparacao}pts`);

      logger.info(`[FINAL_OBJECT] requestId=${requestId} object=${finalObject || 'nenhum'}`);
      logger.info(`[FINAL_CONFIDENCE] requestId=${requestId} confidence=${finalConfidence}%`);
      logger.info(`[FINAL_STATUS] requestId=${requestId} status=${consensusType}`);

      logger.info(`[MATCH_REF]\nGemini: ${geminiObject || 'nenhum'} (${geminiConf}%) | Matcher Visual: ${visualObject || 'nenhum'} (${visualConf}%) -> Consenso: ${consensusType}`);
      logger.info(`[FINAL_CONF]\n${finalObject || 'nenhum'} → ${finalConfidence}%`);

      logger.info(
        `[LIVE_PIPELINE_TRACE]\n` +
        `Frame: #${sessao.totalFrames}\n` +
        `Crop: ${resScreenDetection.roi?.symbolCropWidth || 153}x${resScreenDetection.roi?.symbolCropHeight || 153} ✓\n` +
        `CropSent: ✓\n` +
        `HTTP: 200\n` +
        `Latency: ${responseTimeMs}ms\n` +
        `GeminiResponse: ✓\n` +
        `RawLength: ${responseText ? responseText.length : 0}\n` +
        `ParsedObject: ${originalGeminiObject || 'NONE'}\n` +
        `ParsedConfidence: ${originalGeminiConfidence || 0}\n` +
        `ReferenceMatch: ${visualObject || 'NONE'} (${visualConf}%)\n` +
        `FinalObject: ${finalObject || 'NONE'}\n` +
        `FinalConfidence: ${finalConfidence}\n` +
        `Decision: ${finalObject ? 'ACCEPTED' : 'REJECTED'}`
      );

      objetoRaw = finalObject;
      confiancaRaw = finalConfidence;

      // ETAPA 4 — ENTRADA DO ANALYZER
      const analyzerInputObj = objetoRaw || 'nenhum';
      const analyzerInputConf = confiancaRaw;
      const analyzerInputGap = bestVisualMatch.distanciaScoreComparacao || 0;
      const analyzerInputStatus = finalObject ? 'ACCEPT' : 'REJECT';

      logger.info(
        `[ANALYZER_INPUT]\n` +
        `object = ${analyzerInputObj}\n` +
        `confidence = ${analyzerInputConf}\n` +
        `gap = ${analyzerInputGap}\n` +
        `status = ${analyzerInputStatus}`
      );

      const geminiInputObjStr = String(analyzerInputObj);
      if (!geminiInputObjStr || geminiInputObjStr === 'nenhum' || geminiInputObjStr === 'null' || geminiInputObjStr === 'undefined' || geminiInputObjStr === 'nao_identificado') {
        logger.warn(
          `[ANALYZER_INPUT_ERROR]\n` +
          `reason = Candidate object is empty or invalid in Gemini path (finalObject=${finalObject}, consensus=${consensusType})`
        );
      }

      // ETAPA 5 — NORMALIZAÇÃO DO NOME
      const normalizedCandidate = normalizeObject(objetoRaw).normalized;
      logger.info(
        `[NORMALIZED_NAME]\n` +
        `raw = ${objetoRaw || 'null'}\n` +
        `normalized = ${normalizedCandidate || 'nenhum'}`
      );

      // Máquina de Estados e Confirmação Temporal (REQUIREMENT #11)
      const analyzerStateBefore = sessao.visionAnalyzer.getCurrentState();
      const analysis = sessao.visionAnalyzer.processarDeteccao(
        objetoRaw,
        confiancaRaw,
        resScreenDetection.resultadoScreenDetected,
        resScreenDetection.confidence,
        sessao.sessionId,
        sessao.totalFrames
      );
      const analyzerStateAfter = analysis.state;

      const finalObjCandidate = analysis.status === 'confirmado' ? analysis.objeto : (analysis.candidateResult?.candidato || (objetoRaw || 'nao_identificado'));

      // ETAPA 7 — RESULTADO FINAL
      logger.info(
        `[FINAL_RESULT_INPUT]\n` +
        `object = ${finalObjCandidate}\n` +
        `confidence = ${analysis.confianca}\n` +
        `eventId = ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}`
      );

      resultScreenDiagnostico.objetoFinal = finalObjCandidate;
      resultScreenDiagnostico.confiancaFinal = analysis.confianca;

      logger.info(
        `[FINAL_RESULT]\n` +
        `object = ${resultScreenDiagnostico.objetoFinal}\n` +
        `confidence = ${resultScreenDiagnostico.confiancaFinal}\n` +
        `eventId = ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}`
      );

      const rawObjStr = String(objetoRaw || '');
      if (resultScreenDiagnostico.objetoFinal === 'nao_identificado' && rawObjStr && rawObjStr !== 'nenhum') {
        logger.error(
          `[FINAL_RESULT_MAPPING_ERROR]\n` +
          `sourceObject = ${objetoRaw}\n` +
          `sourceConfidence = ${confiancaRaw}\n` +
          `sourceGap = ${bestVisualMatch.distanciaScoreComparacao || 0}\n` +
          `finalObject = nao_identificado\n` +
          `reason = Analyzer state is ${analysis.state} (status=${analysis.status})`
        );
      }

      if (analysis.candidateResult?.candidato) {
        logger.info(`[STABILIZATION]\n${analysis.candidateResult.candidato} → ${analysis.candidateResult.confirmacoesConsecutivas}/${sessao.consecutiveConfirmationsRequired}`);
      }

      // Logs Estruturados Oficiais do Pipeline
      const roiInfo = resScreenDetection.roi;
      logger.info(
        `[RESULT-DETECTION] Tela resultado: ${resScreenDetection.resultadoScreenDetected ? 'SIM' : 'NÃO'} | Confiança: ${Math.round(resScreenDetection.confidence * 100)}%\n` +
        `[RESULT-CROP] Dimensão: ${roiInfo?.resultScreenWidth || 0} x ${roiInfo?.resultScreenHeight || 0}\n` +
        `[SYMBOL-CROP] Centro: ${roiInfo?.symbolCropCenterX || 0},${roiInfo?.symbolCropCenterY || 0} | Dimensão: ${roiInfo?.symbolCropWidth || 0} x ${roiInfo?.symbolCropHeight || 0}\n` +
        `[WINNER-CROP] source=RESULT_ZONE crop=${roiInfo?.symbolCropWidth || 0}x${roiInfo?.symbolCropHeight || 0}\n` +
        `[WINNER-MATCH] candidato=${bestVisualMatch.simboloCandidatoVisual || 'nenhum'} score=${bestVisualMatch.scoreVisual}%\n` +
        `[GEMINI] Objeto: ${originalGeminiObject || 'nenhum'} | Confiança: ${originalGeminiConfidence}%\n` +
        `[REFERENCE-MATCH] Referência: ${bestVisualMatch.simboloCandidatoVisual || 'nenhum'} | Score: ${bestVisualMatch.scoreVisual}%\n` +
        `[ANALYZER] Resultado: ${analysis.status === 'confirmado' ? analysis.objeto : 'em_analise'} | EventId: ${analysis.eventId || 'N/A'}`
      );

      resultScreenDiagnostico.simboloCandidatoVisual = bestVisualMatch.simboloCandidatoVisual;
      resultScreenDiagnostico.scoreVisual = bestVisualMatch.scoreVisual;
      resultScreenDiagnostico.segundoMelhorCandidato = bestVisualMatch.segundoMelhorCandidato;
      resultScreenDiagnostico.scoreSegundoMelhor = bestVisualMatch.scoreSegundoMelhor;
      resultScreenDiagnostico.referenciaComparada = bestVisualMatch.referenciaComparada || (originalGeminiObject && isAllowedWheelObject(originalGeminiObject)
        ? WHEEL_OBJECT_REFERENCES[originalGeminiObject as WheelObjectName]?.imageUrl || null
        : null);
      resultScreenDiagnostico.distanciaScoreComparacao = bestVisualMatch.distanciaScoreComparacao;
      resultScreenDiagnostico.motivoDescarteVisual = bestVisualMatch.motivoDescarteVisual;

      resultScreenDiagnostico.objetoGemini = originalGeminiObject;
      resultScreenDiagnostico.confiancaGemini = originalGeminiConfidence;
      resultScreenDiagnostico.objetoFinal = analysis.status === 'confirmado' ? analysis.objeto : (analysis.candidateResult?.candidato || (objetoRaw || 'nao_identificado'));
      resultScreenDiagnostico.confiancaFinal = analysis.confianca;
      resultScreenDiagnostico.motivoDescarte = consensusType === 'DIVERGENCIA' ? 'Divergência entre Gemini e Matcher Visual' : (finalObject ? null : 'Sem objeto validado');

      // NOVAS MÉTRICAS DE TELEMETRIA OBJECT_RECOGNITION_DEBUG
      resultScreenDiagnostico.geminiRawResponse = responseText || '';
      resultScreenDiagnostico.geminiResponseLength = responseText ? responseText.length : 0;
      resultScreenDiagnostico.geminiResponseType = typeof responseText;

      resultScreenDiagnostico.parserInput = responseText || '';
      resultScreenDiagnostico.parserStatus = geminiEstadoLog;
      resultScreenDiagnostico.parserObject = originalGeminiObject || 'nenhum';
      resultScreenDiagnostico.parserConfidence = originalGeminiConfidence || 0;
      resultScreenDiagnostico.parserError = parsedResult.errorMessage || null;

      resultScreenDiagnostico.matcherInput = `SYMBOL_CROP_${resScreenDetection.roi?.symbolCropWidth || 0}x${resScreenDetection.roi?.symbolCropHeight || 0}`;
      resultScreenDiagnostico.matcherObject = bestVisualMatch.simboloCandidatoVisual || 'nenhum';
      resultScreenDiagnostico.matcherScore = bestVisualMatch.scoreVisual || 0;
      resultScreenDiagnostico.matcherStatus = (bestVisualMatch.simboloCandidatoVisual && bestVisualMatch.simboloCandidatoVisual !== 'nenhum') ? 'MATCH' : 'NO_MATCH';
      resultScreenDiagnostico.matcherSecondBest = bestVisualMatch.segundoMelhorCandidato || 'nenhum';
      resultScreenDiagnostico.matcherGap = bestVisualMatch.distanciaScoreComparacao || 0;

      resultScreenDiagnostico.finalObject = finalObject || 'nenhum';
      resultScreenDiagnostico.finalConfidence = finalConfidence;
      resultScreenDiagnostico.finalStatus = consensusType;

      sessao.candidatoAtual = analysis.candidateResult?.candidato || null;
      sessao.confirmacoesConsecutivas = analysis.candidateResult?.confirmacoesConsecutivas || 0;

      let foiConfirmadoAgora = false;
      let gravadoNoSupabase = false;
      let rodadaRegistrada: number | null = null;
      let motivoEstabilizacao = '';
      let timestampConfirmacao: number | null = null;
      let timestampRegistroSupabase: number | null = null;
      let latenciaDeteccaoParaRegistroMs: number | null = null;

      if (analysis.status === 'nao_identificado') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Objeto não identificado ou resposta nula/aguardando.`;
      } else if (analysis.status === 'descartado_baixa_confianca') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Confiança abaixo do mínimo exigido (${confiancaRaw}% < ${sessao.minConfidenceRequired}%).`;
      } else if (analysis.status === 'descartado_fora_de_tela_resultado') {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Fora da Tela de Resultado.`;
      } else if (analysis.status === 'duplicado') {
        sessao.totalDescartes++;
        sessao.duplicacoesBloqueadas++;
        motivoEstabilizacao = `Ignorado: Objeto "${objetoRaw}" é idêntico ao último confirmado.`;
      } else if (analysis.status === 'em_analise') {
        motivoEstabilizacao = `Analisando candidato "${objetoRaw}" (${sessao.confirmacoesConsecutivas}/${sessao.consecutiveConfirmationsRequired} confirmações consec. | ${confiancaRaw}% conf.)`;
      } else if (analysis.status === 'confirmado' && analysis.objetoPadraoParaBanco && analysis.eventId) {
        foiConfirmadoAgora = true;
        timestampConfirmacao = Date.now();
        sessao.ultimoObjetoConfirmado = analysis.objetoPadraoParaBanco.resultado;
        sessao.horarioUltimaConfirmacao = timestampConfirmacao;
        sessao.confiancaUltimaConfirmacao = analysis.objetoPadraoParaBanco.confianca;
        sessao.totalRodadasDetectadasSessao++;

        logger.info(`[CONFIRMED]\n${analysis.objetoPadraoParaBanco.resultado}`);

        try {
          sessao.tentativasPersistencia++;
          logger.info(`[REGISTER]\nTentando registrar ${analysis.objetoPadraoParaBanco.resultado}`);
          const resAuto = await safeRegistrarResultado(
            analysis.objetoPadraoParaBanco.resultado,
            analysis.objetoPadraoParaBanco.confianca,
            analysis.eventId,
            sessao.sessionId
          );
          timestampRegistroSupabase = Date.now();
          latenciaDeteccaoParaRegistroMs = timestampRegistroSupabase - timestampDeteccao;
          gravadoNoSupabase = resAuto.registrado;
          rodadaRegistrada = resAuto.rodadaRegistrada || null;

          const persistEnabled = isAutoPersistEnabled();

          // TELEMETRIA OBRIGATÓRIA: [ROUND_PIPELINE_TRACE]
          logger.info(
            `[ROUND_PIPELINE_TRACE]\n` +
              `eventId=${analysis.eventId}\n` +
              `roundId=${rodadaRegistrada || 'N/A'}\n` +
              `object=${analysis.objetoPadraoParaBanco.resultado}\n` +
              `confidence=${analysis.objetoPadraoParaBanco.confianca}\n` +
              `analyzerStatus=${analysis.state}\n` +
              `persistenceEnabled=${persistEnabled}\n` +
              `insertAttempt=${persistEnabled}\n` +
              `insertSuccess=${resAuto.registrado}\n` +
              `insertedId=${resAuto.insertedId || 'N/A'}\n` +
              `selectVerification=${resAuto.registrado}\n` +
              `persistenceConfirmed=${resAuto.registrado}\n` +
              `historyAppend=true\n` +
              `dashboardSync=true`
          );

          const confirmedItem: ConfirmedRoundHistoryEntry = {
            timestamp: timestampConfirmacao,
            objeto: analysis.objetoPadraoParaBanco.resultado,
            confianca: analysis.objetoPadraoParaBanco.confianca,
            eventId: analysis.eventId,
            estado: analysis.state,
            persistido: resAuto.registrado ? 'SIM' : (persistEnabled ? `NÃO (${resAuto.motivo})` : 'NÃO (PERSISTÊNCIA DESABILITADA)'),
          };
          sessao.confirmedRoundsHistory = [confirmedItem, ...sessao.confirmedRoundsHistory].slice(0, 50);

          logger.info(
            `[LIVE_SYNC]\n` +
              `eventId=${analysis.eventId}\n` +
              `rodada=${rodadaRegistrada || 'N/A'}\n` +
              `registrado=${resAuto.registrado}\n` +
              `motivo=${resAuto.motivo}`
          );

          if (resAuto.registrado) {
            sessao.registrosCriados++;
            logger.info(`[REGISTER]\nSucesso: Rodada #${rodadaRegistrada} salva no Supabase (ID: ${resAuto.insertedId || 'OK'})`);
            motivoEstabilizacao = `SISTEMA LIVE: Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" (${analysis.eventId}) salva no Supabase (#${rodadaRegistrada})`;
          } else {
            sessao.duplicacoesBloqueadas++;
            if (!persistEnabled) {
              logger.info(`[REGISTER]\nPersistência Desabilitada: ${resAuto.motivo}`);
              motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada (PERSISTÊNCIA DESABILITADA)`;
            } else {
              logger.info(`[REGISTER]\nFALHA: ${resAuto.motivo}`);
              logger.error(`[PERSISTENCE_FAILED]\neventId=${analysis.eventId}\nroundId=${rodadaRegistrada || 'N/A'}\nobject=${analysis.objetoPadraoParaBanco.resultado}\nreason=${resAuto.motivo}`);
              motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada, mas FALHA ao salvar no Supabase: ${resAuto.motivo}`;
            }
          }
        } catch (errDb: any) {
          logger.error('[WHEEL VISION] Erro ao gravar no Supabase:', errDb?.message);
          motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada, mas erro ao salvar no Supabase: ${errDb?.message}`;
        }
      }

      // TELEMETRIA OBRIGATÓRIA [BALAO_DEBUG]
      if (candidateObject === 'balao' || normalizedCandidate === 'balao' || analysis.objeto === 'balao') {
        logger.info(
          `[BALAO_DEBUG]\n` +
          `raw=${candidateObject || 'null'}\n` +
          `normalized=${normalizedCandidate || 'nenhum'}\n` +
          `confidence=${candidateConfidence}%\n` +
          `gap=${Math.round((localRes?.gap || 0) * 100)}%\n` +
          `recognizer=${localRes?.accepted ? 'PASS' : 'FAIL'}\n` +
          `analyzer=${analysis.status}\n` +
          `confirmed=${foiConfirmadoAgora}\n` +
          `eventId=${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || 'N/A'}\n` +
          `round=${rodadaRegistrada || 'N/A'}\n` +
          `dedup=${analysis.status === 'duplicado' ? 'BLOCKED' : 'PASS'}\n` +
          `supabase=${gravadoNoSupabase ? 'SUCCESS' : (foiConfirmadoAgora ? 'FAILED' : 'PENDING')}\n` +
          `history=${foiConfirmadoAgora ? 'APPENDED' : 'WAITING'}`
        );
      }

      let geminiTag: GeminiStatusTag = 'GEMINI_NO_RESPONSE';
      if (geminiEstadoLog === 'GEMINI_NO_OBJECT') {
        geminiTag = 'GEMINI_NO_OBJECT';
      } else if (geminiEstadoLog === 'GEMINI_AGUARDANDO') {
        geminiTag = 'GEMINI_AGUARDANDO';
      } else if (geminiEstadoLog === 'GEMINI_INVALID_JSON' || geminiEstadoLog === 'GEMINI_PARSE_ERROR') {
        geminiTag = 'GEMINI_INVALID_JSON';
      } else if (geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' || geminiEstadoLog === 'GEMINI_TEXT_RESPONSE') {
        geminiTag = 'GEMINI_OBJECT_DETECTED';
      }

      let analyzerTag: AnalyzerStatusTag = 'ANALYZER_IDLE';
      if (analysis.status === 'confirmado') {
        analyzerTag = 'ANALYZER_CONFIRMED';
      } else if (analysis.status === 'nao_identificado' || analysis.status === 'descartado_baixa_confianca' || analysis.status === 'descartado_fora_de_tela_resultado') {
        analyzerTag = 'ANALYZER_DISCARDED';
      } else if (analysis.status === 'duplicado' || analyzerStateAfter === 'WAITING_FOR_RESULT_SCREEN_EXIT' || analyzerStateAfter === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || analyzerStateAfter === 'AGUARDANDO_PROXIMA_RODADA') {
        analyzerTag = 'ANALYZER_WAITING_CHANGE';
      } else if (analyzerStateAfter === 'LEITURA_RESULTADO' || analyzerStateAfter === 'TELA_RESULTADO_DETECTADA' || analysis.status === 'em_analise') {
        analyzerTag = 'ANALYZER_CANDIDATE';
      }

      const traceEntry: RecentFrameTraceEntry = {
        frameId: sessao.totalFrames,
        sessionId: sessao.sessionId,
        connectionId: sessao.connectionId,
        timestamp: timestampRespostaGemini,
        geminiRaw: responseText || '(vazio)',
        geminiObjeto: originalGeminiObject || 'nenhum',
        geminiConfianca: originalGeminiConfidence || 0,
        parserObjeto: originalGeminiObject || 'nenhum',
        parserConfianca: originalGeminiConfidence || 0,
        analyzerStateBefore,
        analyzerStateAfter,
        candidate: sessao.candidatoAtual,
        confirmationCount: sessao.confirmacoesConsecutivas,
        lastConfirmedObject: sessao.ultimoObjetoConfirmado,
        currentEventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        confirmedNow: foiConfirmadoAgora,
        geminiTag,
        analyzerTag,
        persistAttempt: false,
        wheelPhase: analysis.wheelPhase,
        sceneStabilityScore: analysis.sceneStability?.score,
        sceneStabilityState: analysis.sceneStability?.state,
        tempoEstavelMs: analysis.tempoEstavelMs,
      };
      sessao.recentFrameTraces = [traceEntry, ...sessao.recentFrameTraces].slice(0, 20);

      const latenciaTotalMs = (timestampRegistroSupabase || timestampConfirmacao || timestampDeteccao) - timestampFrameCapturado;

      const latenciaObj: LiveLatencyInfo = {
        timestampFrameCapturado,
        timestampFrameEnviado,
        timestampRespostaGemini,
        timestampDeteccao,
        timestampConfirmacao,
        timestampRegistroSupabase,
        latenciaCapturaParaDeteccaoMs,
        latenciaDeteccaoParaRegistroMs,
        latenciaTotalMs,
      };

      const infoEstabilizacao: LiveStabilizationInfo = {
        candidatoAtual: sessao.candidatoAtual,
        confirmacoesConsecutivas: sessao.confirmacoesConsecutivas,
        confirmacoesNecessarias: sessao.consecutiveConfirmationsRequired,
        minConfidence: sessao.minConfidenceRequired,
        foiConfirmadoAgora,
        ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
        horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
        confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
        totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
        motivoEstabilizacao,
        gravadoNoSupabase,
        rodadaRegistrada,
        estadoAnalyzer: analysis.state,
        eventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        latencia: latenciaObj,
        sceneStability: analysis.sceneStability,
        wheelPhase: analysis.wheelPhase,
        tempoEstavelMs: analysis.tempoEstavelMs,
        framesRecebidos: sessao.totalFrames,
        deteccoesGemini: sessao.totalDetectados,
        candidatosCriados: sessao.visionAnalyzer.getMetrics().totalCandidatosIniciados,
        confirmacoes: sessao.visionAnalyzer.getMetrics().totalConfirmados,
        tentativasPersistencia: 0,
        registrosCriados: 0,
        duplicacoesBloqueadas: sessao.duplicacoesBloqueadas + sessao.visionAnalyzer.getMetrics().totalDuplicacoesBloqueadas,
      };

      const pipelineSteps = {
        step1_captura: `✓ Frame #${sessao.totalFrames} (${largura}x${altura}, ${tamanhoKB})`,
        step2_crop: `✓ RESULT_ZONE (${resScreenDetection.roi?.cropWidth || 120}x${resScreenDetection.roi?.cropHeight || 120})`,
        step3_base64: `✓ Base64 válido (${(cleanImageToSend.length / 1024).toFixed(1)} KB)`,
        step4_requestStarted: `✓ Request Gemini iniciado (${modelUsed})`,
        step5_requestSent: `✓ Request enviado ao backend/Gemini`,
        step6_geminiResponded: `✓ Gemini respondeu em ${responseTimeMs}ms`,
        step7_responseReceived: `✓ HTTP 200 OK recebido`,
        step8_textExtracted: `✓ Texto extraído (${responseText.length} chars)`,
        step9_jsonParsed: `✓ JSON parseado (${isJsonValid ? 'VÁLIDO' : 'INVÁLIDO'})`,
        step10_validated: `✓ Objeto: "${objetoRaw || 'nenhum'}" (${confiancaRaw}%) | Status: ${analysis.status}`,
      };

      const resultado: LiveResultPayload = {
        objetoDetectado: objetoRaw,
        confianca: confiancaRaw,
        transfereContexto: true,
        rawText: responseText,
        geminiEstadoLog,
        geminiRawResponse: responseText,
        geminiHttpStatus: 200,
        parsedPayload,
        frameDiagnostico,
        timestamp: sessao.ultimoResultadoAt,
        estabilizacao: infoEstabilizacao,
        latencia: latenciaObj,
        geminiTag,
        analyzerTag,
        geminiPayloadInfo: {
          mimeType,
          base64Valid: true,
          base64Length: cleanImageToSend.length,
          width: resScreenDetection.roi?.cropWidth || 120,
          height: resScreenDetection.roi?.cropHeight || 120,
          isResultZoneCrop,
        },
        pipelineSteps,
        recentFrameTraces: sessao.recentFrameTraces,
        confirmedRoundsHistory: sessao.confirmedRoundsHistory,
      };

      sessao.lastGeminiHttpStatus = 200;
      sessao.lastGeminiError = undefined;
      sessao.lastGeminiErrorMessage = undefined;

      logger.info(
        `[LIVE BACKEND] Frame #${sessao.totalFrames} -> Status: 200 OK | State: ${geminiEstadoLog} | Objeto: "${objetoRaw || 'nenhum'}" (${confiancaRaw}%) em ${responseTimeMs}ms`
      );

      return resultado;
    } catch (err: any) {
      const is429 =
        err?.status === 429 ||
        err?.code === 429 ||
        err?.code === 'RESOURCE_EXHAUSTED' ||
        (err?.message &&
          (err.message.includes('429') ||
            err.message.includes('RESOURCE_EXHAUSTED') ||
            err.message.includes('Quota exceeded')));

      if (is429) {
        const backoffMs = 20000;
        sessao.geminiRateLimitActive = true;
        sessao.geminiRateLimitResetAt = Date.now() + backoffMs;
        sessao.geminiRateLimitReason = err?.message || 'Quota de requisições excedida (HTTP 429 RESOURCE_EXHAUSTED).';
        sessao.lastGeminiHttpStatus = 429;
        sessao.lastGeminiError = 'RESOURCE_EXHAUSTED';
        sessao.lastGeminiErrorMessage = err?.message || 'Quota de requisições excedida (HTTP 429 RESOURCE_EXHAUSTED).';

        logger.error(`[GEMINI_RATE_LIMITED] Tag: GEMINI_RATE_LIMITED | Status: 429 | Backoff: ${backoffMs}ms | Motivo: ${sessao.lastGeminiErrorMessage}`);

        const currCalls = sessao.geminiCallsCurrentRound || 0;

        logger.info(
          `[LIVE_GEMINI_STATE]\n` +
          `frame=${sessao.totalFrames}\n` +
          `state=BLOCKED\n` +
          `callCount=${currCalls}\n` +
          `maxCalls=2\n` +
          `httpStatus=429\n` +
          `rawLength=0\n` +
          `parsedObject=null\n` +
          `confidence=null\n` +
          `blockReason=RESOURCE_EXHAUSTED`
        );

        resultScreenDiagnostico.geminiRawResponse = sessao.lastGeminiErrorMessage;
        resultScreenDiagnostico.parserStatus = 'GEMINI_REQUEST_BLOCKED';
        resultScreenDiagnostico.parserObject = null;
        resultScreenDiagnostico.parserConfidence = null;
        resultScreenDiagnostico.matcherStatus = 'SKIPPED';
        resultScreenDiagnostico.matcherObject = null;
        resultScreenDiagnostico.matcherScore = null;
        resultScreenDiagnostico.finalStatus = 'GEMINI_REQUEST_BLOCKED';
        resultScreenDiagnostico.motivoDescarte = sessao.lastGeminiErrorMessage;

        return {
          objetoDetectado: null,
          confianca: null,
          rawText: sessao.lastGeminiErrorMessage,
          geminiEstadoLog: 'GEMINI_REQUEST_BLOCKED',
          geminiRawResponse: sessao.lastGeminiErrorMessage,
          geminiHttpStatus: 429,
          geminiErrorCode: 'RESOURCE_EXHAUSTED',
          geminiErrorMessage: sessao.lastGeminiErrorMessage,
          geminiCallsCurrentRound: currCalls,
          frameDiagnostico,
          timestamp: Date.now(),
          geminiTag: 'GEMINI_REQUEST_BLOCKED',
          analyzerTag: 'ANALYZER_DISCARDED',
          pipelineSteps: {
            step1_captura: `✓ Frame #${sessao.totalFrames}`,
            step2_crop: `✓ RESULT_ZONE (${resScreenDetection.roi?.cropWidth || 120}x${resScreenDetection.roi?.cropHeight || 120})`,
            step3_base64: `✓ Base64 pronto (${(cleanImageToSend.length / 1024).toFixed(1)} KB)`,
            step4_requestStarted: `✓ Request (${sessao.model})`,
            step5_requestSent: `✓ Payload enviado`,
            step6_geminiResponded: '🛑 HTTP 429 Rate Limit Exceeded',
            step7_responseReceived: 'Status: 429 RESOURCE_EXHAUSTED',
            step8_textExtracted: 'Rate Limit Ativo (Bloqueado)',
            step9_jsonParsed: `Backoff: ${backoffMs / 1000}s`,
            step10_validated: 'Sem confirmação/Event ID devido ao 429',
          },
        };
      }

      const isTimeout = err?.code === 'GEMINI_TIMEOUT' || err?.status === 408 || err?.message?.includes('tempo limite');
      const isRateLimit = err?.status === 429 || err?.code === 429 || err?.message?.includes('429') || err?.message?.includes('Quota exceeded') || err?.message?.includes('RESOURCE_EXHAUSTED');
      const isAuthError = err?.status === 401 || err?.status === 403 || err?.message?.includes('API Key') || err?.message?.includes('unauthorized');
      const isNotFound = err?.status === 404 || err?.message?.includes('not found');
      const isNetworkError = err?.code === 'ECONNRESET' || err?.code === 'ENOTFOUND' || err?.message?.includes('fetch failed');

      let errorType = 'GEMINI_HTTP_ERROR';
      if (isTimeout) errorType = 'GEMINI_TIMEOUT';
      else if (isRateLimit) errorType = 'GEMINI_RATE_LIMITED';
      else if (isAuthError) errorType = 'GEMINI_AUTH_ERROR';
      else if (isNotFound) errorType = 'GEMINI_MODEL_UNAVAILABLE';
      else if (isNetworkError) errorType = 'GEMINI_NETWORK_ERROR';

      const httpStatus = isTimeout ? 408 : isRateLimit ? 429 : isAuthError ? 401 : (err?.status || err?.code || 500);
      const errorCode = isTimeout ? 'GEMINI_TIMEOUT' : (err?.code || errorType);
      const errorMessage = isTimeout
        ? 'Gemini não respondeu dentro do tempo limite de 15 segundos (GEMINI_TIMEOUT).'
        : (err?.message || 'Erro de comunicação com a API do Gemini.');

      sessao.lastGeminiHttpStatus = httpStatus;
      sessao.lastGeminiError = String(errorCode);
      sessao.lastGeminiErrorMessage = errorMessage;

      const currCalls = sessao.geminiCallsCurrentRound || 0;

      logger.error(`[GEMINI_ERROR] errorName=${err?.name || 'Error'} errorMessage="${errorMessage}" httpStatus=${httpStatus} errorCode=${errorCode}`);

      logger.info(
        `[LIVE_GEMINI_STATE]\n` +
        `frame=${sessao.totalFrames}\n` +
        `state=BLOCKED\n` +
        `callCount=${currCalls}\n` +
        `maxCalls=2\n` +
        `httpStatus=${httpStatus}\n` +
        `rawLength=0\n` +
        `parsedObject=null\n` +
        `confidence=null\n` +
        `blockReason=${errorCode}`
      );

      resultScreenDiagnostico.geminiRawResponse = errorMessage;
      resultScreenDiagnostico.parserStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.parserObject = null;
      resultScreenDiagnostico.parserConfidence = null;
      resultScreenDiagnostico.matcherStatus = 'SKIPPED';
      resultScreenDiagnostico.matcherObject = null;
      resultScreenDiagnostico.matcherScore = null;
      resultScreenDiagnostico.finalStatus = 'GEMINI_REQUEST_BLOCKED';
      resultScreenDiagnostico.motivoDescarte = errorMessage;

      return {
        objetoDetectado: null,
        confianca: null,
        rawText: errorMessage,
        geminiEstadoLog: 'GEMINI_REQUEST_BLOCKED',
        geminiRawResponse: errorMessage,
        geminiHttpStatus: httpStatus,
        geminiErrorCode: errorCode,
        geminiErrorMessage: errorMessage,
        geminiCallsCurrentRound: currCalls,
        frameDiagnostico,
        timestamp: Date.now(),
        geminiTag: 'GEMINI_REQUEST_BLOCKED',
        analyzerTag: 'ANALYZER_DISCARDED',
        pipelineSteps: {
          step1_captura: `✓ Frame #${sessao.totalFrames} (${largura}x${altura})`,
          step2_crop: `✓ RESULT_ZONE (${resScreenDetection.roi?.cropWidth || 120}x${resScreenDetection.roi?.cropHeight || 120})`,
          step3_base64: `✓ Base64 pronto (${(cleanImageToSend.length / 1024).toFixed(1)} KB)`,
          step4_requestStarted: `✓ Request iniciado (${sessao.model})`,
          step5_requestSent: `✓ Payload enviado`,
          step6_geminiResponded: isTimeout ? '⏱️ GEMINI_TIMEOUT (15s Excedido)' : '❌ Erro na Chamada Gemini',
          step7_responseReceived: `HTTP Status: ${httpStatus}`,
          step8_textExtracted: `Código: ${errorCode}`,
          step9_jsonParsed: `Mensagem: ${errorMessage}`,
          step10_validated: 'Falha no Processamento Gemini',
        },
      };
    } finally {
      sessao.geminiRequestInFlight = false;
    }
  }

  /**
   * Consulta o status atual da sessão no backend.
   */
  public static verificarStatus(usuarioId: string = 'default_user'): LiveSessionStatus {
    const sessao = getSessaoPorUsuario(usuarioId);

    if (!sessao) {
      return {
        estado: 'desconectado',
        sessionId: null,
        connectionId: null,
        mensagemErro: null,
        conectadoEm: null,
        tentativasReconexao: 0,
        totalFramesEnviados: 0,
        ultimoResultadoAt: null,
      };
    }

    return this.obterStatusStatusSessao(sessao);
  }

  /**
   * Teste de diagnóstico controlled com detecção simulada (PROMPT LIVE - TESTE CONTROLADO)
   */
  public static async testSimulatedDetection(
    usuarioId: string = 'default_user',
    objetoSimulado: string = 'boia',
    confiancaSimulada: number = 95,
    timestampOverride?: number,
    isResultZoneDetected: boolean = true
  ) {
    let sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao) {
      await this.iniciarSessao(usuarioId, {});
      sessao = getSessaoPorUsuario(usuarioId)!;
    }

    const tStart = Date.now();
    const objetoFormatado = objetoSimulado.trim().toLowerCase();

    const simRaw = JSON.stringify({ objetoDetectado: objetoFormatado, confianca: confiancaSimulada });
    sessao.ultimaRespostaBrutaGemini = simRaw;
    sessao.lastGeminiHttpStatus = 200;
    sessao.lastGeminiError = undefined;
    sessao.lastGeminiErrorMessage = undefined;

    sessao.ultimoFrameDiagnostico = {
      largura: 1920,
      altura: 1080,
      mimeType: 'image/jpeg',
      tamanhoBytes: 50000,
      tamanhoKB: '50 KB',
      timestamp: Date.now(),
      fonte: 'simulado',
      conteudoVisual: true,
      detalhesVisual: 'Teste simulado',
      resultScreenDiagnostico: {
        resultadoScreenDetected: true,
        confidence: 1.0,
        symbolCropWidth: 153,
        symbolCropHeight: 153,
        symbolCropValid: true,
        objetoGemini: objetoFormatado,
        confiancaGemini: confiancaSimulada,
        geminiRawResponse: simRaw,
        geminiResponseLength: simRaw.length,
        geminiResponseType: 'string',
        parserInput: simRaw,
        parserStatus: 'GEMINI_OBJECT_DETECTED',
        parserObject: objetoFormatado,
        parserConfidence: confiancaSimulada,
        parserError: null,
        matcherObject: objetoFormatado,
        matcherScore: 100,
        matcherStatus: 'MATCH',
        finalObject: objetoFormatado,
        finalConfidence: confiancaSimulada,
        finalStatus: 'MATCH',
      },
    };

    // Passa pelo WheelVisionAnalyzer (respeitando isResultZoneDetected)
    const analysis = sessao.visionAnalyzer.processarDeteccao(
      objetoFormatado,
      confiancaSimulada,
      isResultZoneDetected,
      isResultZoneDetected ? 1.0 : 0.0,
      sessao.sessionId,
      sessao.totalFrames,
      timestampOverride
    );
    sessao.candidatoAtual = analysis.candidateResult?.candidato || null;
    sessao.confirmacoesConsecutivas = analysis.candidateResult?.confirmacoesConsecutivas || 0;

    let foiConfirmadoAgora = false;
    let gravadoNoSupabase = false;
    let rodadaRegistrada: number | null = null;
    let motivoEstabilizacao = '';
    let erroSupabase: string | null = null;

    if (analysis.status === 'confirmado' && analysis.objetoPadraoParaBanco) {
      foiConfirmadoAgora = true;
      sessao.ultimoObjetoConfirmado = analysis.objetoPadraoParaBanco.resultado;
      sessao.horarioUltimaConfirmacao = Date.now();
      sessao.confiancaUltimaConfirmacao = analysis.objetoPadraoParaBanco.confianca;
      sessao.totalRodadasDetectadasSessao++;

      try {
        sessao.tentativasPersistencia++;
        const resAuto = await safeRegistrarResultado(
          analysis.objetoPadraoParaBanco.resultado,
          analysis.objetoPadraoParaBanco.confianca,
          analysis.eventId,
          sessao.sessionId
        );
        gravadoNoSupabase = resAuto.registrado;
        rodadaRegistrada = resAuto.rodadaRegistrada || null;
        if (resAuto.registrado) {
          sessao.registrosCriados++;
        } else {
          sessao.duplicacoesBloqueadas++;
        }
        if (!resAuto.registrado) {
          erroSupabase = resAuto.motivo;
        }
        motivoEstabilizacao = `TESTE SIMULADO: Rodada "${analysis.objetoPadraoParaBanco.resultado}" (${analysis.eventId}) confirmada -> Supabase: ${resAuto.motivo}`;
      } catch (errDb: any) {
        erroSupabase = errDb?.message || 'Erro desconhecido ao salvar no Supabase';
        motivoEstabilizacao = `TESTE SIMULADO: Rodada confirmada, mas erro no Supabase: ${erroSupabase}`;
      }
    } else {
      motivoEstabilizacao = `TESTE SIMULADO: Objeto "${objetoFormatado}" (${confiancaSimulada}%) processado pelo Analyzer. Status: ${analysis.status}`;
    }

    return {
      sucesso: true,
      objetoSimulado: objetoFormatado,
      confiancaSimulada,
      analyzerState: analysis.state,
      analyzerStatus: analysis.status,
      foiConfirmadoAgora,
      gravadoNoSupabase,
      rodadaRegistrada,
      erroSupabase,
      motivoEstabilizacao,
      tempoExecucaoMs: Date.now() - tStart,
    };
  }

  private static obterStatusStatusSessao(sessao: ActiveServerSession): LiveSessionStatus {
    const duracaoSegundos = Math.round((Date.now() - sessao.conectadoEm.getTime()) / 1000);
    const mediaLatencia = sessao.contadorLatencias > 0
      ? Math.round(sessao.somaLatenciaMs / sessao.contadorLatencias)
      : 0;

    return {
      estado: sessao.estado,
      sessionId: sessao.sessionId,
      connectionId: sessao.connectionId,
      mensagemErro: sessao.mensagemErro || null,
      conectadoEm: sessao.conectadoEm.toISOString(),
      duracaoSegundos,
      motivoDesconexao: sessao.motivoDesconexao || null,
      tentativasReconexao: sessao.tentativasReconexao,
      totalFramesEnviados: sessao.totalFrames,
      ultimoResultadoAt: sessao.ultimoResultadoAt || null,
      modelUtilizado: sessao.model || 'gemini-3.6-flash',

      // Métricas de Diagnóstico Gemini Atuais (REQUIREMENT #11)
      geminiCallsCurrentRound: sessao.geminiCallsStartedCurrentRound ?? sessao.geminiCallsCurrentRound ?? 0,
      geminiCallsPerMinute: (sessao.geminiCallTimestamps || []).filter(ts => Date.now() - ts < 60000).length,
      lastGeminiHttpStatus: sessao.lastGeminiHttpStatus || 200,
      lastGeminiError: sessao.lastGeminiError,
      lastGeminiErrorMessage: sessao.lastGeminiErrorMessage,
      rateLimitActive: !!sessao.geminiRateLimitActive && Date.now() < sessao.geminiRateLimitResetAt,
      rateLimitRetryAfterMs: (sessao.geminiRateLimitActive && Date.now() < sessao.geminiRateLimitResetAt)
        ? Math.max(0, sessao.geminiRateLimitResetAt - Date.now())
        : 0,
      framesDiscardedBeforeGemini: sessao.framesDiscardedBeforeGemini || 0,
      geminiCallsAvoidedByScreenDetector: sessao.geminiCallsAvoidedByScreenDetector || 0,

      // PROMPT LIVE 004
      ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
      horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
      totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
      candidatoAtual: sessao.candidatoAtual,
      confirmacoesConsecutivas: sessao.confirmacoesConsecutivas,

      // Estado do Analyzer e Identificador de Evento Ativo
      analyzerState: sessao.visionAnalyzer.getCurrentState(),
      currentEventId: sessao.visionAnalyzer.getCurrentEventId(),
      lastResetAt: sessao.lastResetAt,

      // Diagnóstico Bruto Gemini
      ultimaRespostaBrutaGemini: sessao.ultimaRespostaBrutaGemini,
      ultimoEstadoGemini: sessao.ultimoEstadoGemini,
      ultimoFrameDiagnostico: sessao.ultimoFrameDiagnostico,

      // Históricos Rastreamento MODO DIAGNÓSTICO
      recentFrameTraces: sessao.recentFrameTraces || [],
      confirmedRoundsHistory: sessao.confirmedRoundsHistory || [],

      // Contadores Detalhados
      totalFramesCapturados: sessao.totalFrames,
      totalFramesProcessados: sessao.totalFrames,
      totalRespostasGemini: sessao.contadorLatencias,
      totalGeminiSemResposta: sessao.totalSemResposta,
      totalGeminiAguardando: sessao.totalAguardando,
      totalGeminiObjetoDetectado: sessao.totalDetectados,
      totalDeteccoesValidas: sessao.totalDetectados,
      totalAbaixoConfiancaMinima: sessao.totalDescartes,
      totalCandidatosCriados: sessao.visionAnalyzer.getMetrics().totalCandidatosIniciados,
      totalConfirmacoes: sessao.totalRodadasDetectadasSessao,
      totalDuplicacoesBloqueadas: sessao.duplicacoesBloqueadas + sessao.visionAnalyzer.getMetrics().totalDuplicacoesBloqueadas,
      totalInstabilidades: sessao.totalDescartes,
      totalReconexoes: sessao.tentativasReconexao,
      totalEventIdsCriados: sessao.totalRodadasDetectadasSessao,
      resultadosConfirmados: sessao.visionAnalyzer.getMetrics().resultadosConfirmados || sessao.totalRodadasDetectadasSessao,
      telasResultadoDetectadas: sessao.visionAnalyzer.getMetrics().telasResultadoDetectadas || 0,
      telasResultadoEncerradas: sessao.visionAnalyzer.getMetrics().telasResultadoEncerradas || 0,
      rodadasLiberadas: sessao.visionAnalyzer.getMetrics().rodadasLiberadas || 0,
      rodadasBloqueadas: sessao.visionAnalyzer.getMetrics().rodadasBloqueadas || 0,
      tentativasPersistencia: sessao.tentativasPersistencia,
      registrosSupabase: sessao.registrosCriados,
      autoPersistEnabled: isAutoPersistEnabled(),

      // PROMPT LIVE 005 – Painel Técnico de Telemetria
      localRecognitionEnabled: LocalWheelRecognizer.getConfig().LOCAL_RECOGNITION_ENABLED,
      geminiFallbackEnabled: LocalWheelRecognizer.getConfig().GEMINI_FALLBACK_ENABLED,
      localOnlyMode: LocalWheelRecognizer.getConfig().LOCAL_ONLY_MODE,
      localConfidenceThreshold: LocalWheelRecognizer.getConfig().LOCAL_CONFIDENCE_THRESHOLD,
      reconhecimentoMetodo: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.reconhecimentoMetodo || 'LOCAL',
      ultimoMetodoUtilizado: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.reconhecimentoMetodo || 'LOCAL',
      ultimoObjetoLocal: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.localWinner || null,
      confiancaLocal: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.localConfidence || 0,
      segundoCandidatoLocal: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.localSecondCandidate || null,
      gapLocal: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.localGap || 0,
      localScoresPorObjeto: sessao.ultimoFrameDiagnostico?.resultScreenDiagnostico?.localScoresPorObjeto,
      uiRecognitionState: sessao.uiRecognitionState,
      metricas: {
        captureFps: 1, // Medido no client
        sentFps: 1, // Medido no client
        latenciaMediaMs: mediaLatencia,
        tempoRespostaGeminiMs: sessao.ultimoTempoRespostaMs,
        totalDetectados: sessao.totalDetectados,
        totalConfirmados: sessao.totalRodadasDetectadasSessao,
        totalDescartes: sessao.totalDescartes,
        totalAguardando: sessao.totalAguardando,
        totalSemResposta: sessao.totalSemResposta,
        totalErrosParser: sessao.totalErrosParser,
        numeroReconexoes: sessao.tentativasReconexao,
        ultimaRespostaBrutaGemini: sessao.ultimaRespostaBrutaGemini,
        ultimoEstadoGemini: sessao.ultimoEstadoGemini,
        ultimoFrameDiagnostico: sessao.ultimoFrameDiagnostico,
      },
    };
  }

  public static getLocalRecognizerConfig() {
    return LocalWheelRecognizer.getConfig();
  }

  public static updateLocalRecognizerConfig(config: Parameters<typeof LocalWheelRecognizer.updateConfig>[0]) {
    return LocalWheelRecognizer.updateConfig(config);
  }
}

