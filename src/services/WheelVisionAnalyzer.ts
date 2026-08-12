import { logger } from '../utils/logger';
import { notificarSaidaTelaResultado } from './resultadoService';

export type VisionState =
  | 'WAITING_FOR_RESULT'
  | 'RESULT_SCREEN_DETECTED'
  | 'RECOGNIZING_RESULT'
  | 'RESULT_CANDIDATE'
  | 'RESULT_CONFIRMING'
  | 'RESULT_CONFIRMED'
  | 'WAITING_FOR_RESULT_SCREEN_EXIT'
  | 'RESULT_SCREEN_EXITED'
  | 'WAITING_FOR_NEXT_ROUND'
  | 'NEXT_ROUND_READY'
  // Compatibilidade com aliases legado
  | 'IDLE'
  | 'RODA_NORMAL'
  | 'RODA_EM_TRANSICAO'
  | 'TELA_RESULTADO_DETECTADA'
  | 'LEITURA_RESULTADO'
  | 'RESULTADO_CONFIRMANDO'
  | 'RESULTADO_CONFIRMADO'
  | 'AGUARDANDO_SAIDA_TELA_RESULTADO'
  | 'NOVA_RODADA_LIBERADA'
  | 'AGUARDANDO_PROXIMA_RODADA';

export type WheelPhase = 'DETECÇÃO' | 'ESTABILIZAÇÃO' | 'RESULTADO' | 'TRANSIÇÃO';

export interface SceneStabilityInfo {
  score: number; // 0 a 100
  state: 'ESTÁVEL' | 'TRANSIÇÃO' | 'INSTÁVEL';
}

export interface ResultScreenDiagnosticoInfo {
  resultadoScreenDetected: boolean;
  confidence: number; // 0.0 - 1.0
  estadoAtual: VisionState;
  tempoDesdeDeteccaoMs: number;
  framesAnalisadosJanela: number;
  candidatoAtual: string | null;
  confirmacoesConsecutivas: number;
  resultadoConfirmado: string | null;
  eventId: string | null;
}

export interface WheelVisionAnalyzerSnapshot {
  currentState: VisionState;
  candidateResult: string | null;
  confirmacoesConsecutivas: number;
  primeiraDeteccaoTimestamp: number | null;
  ultimaDeteccaoTimestamp: number | null;
  lastConfidence: number;
  ultimoObjetoConfirmado: string | null;
  currentEventId: string | null;
  horarioUltimaConfirmacao: number | null;
  confiancaUltimaConfirmacao: number | null;
  motivoUltimoDescarte: string | null;
  naoIdentificadoCountConsecutivo: number;
  roundSequenceCounter: number;
  resultadoScreenDetected: boolean;
  resultScreenConfidence: number;
  framesAnalisadosJanela: number;
  resultScreenDetectedAtTimestamp: number | null;
  metrics: AnalyzerMetrics;
}

export interface WheelVisionAnalysisResult {
  objeto: string; // 'sorvete' | 'boia' | 'balao' | 'soco' | 'tedy' | 'princesa' | 'camera' | 'coroa' | 'não identificado'
  confianca: number; // 0-100
  timestamp: number;
  eventId?: string; // Identificador único da rodada confirmada
  status:
    | 'confirmado'
    | 'em_analise'
    | 'descartado_baixa_confianca'
    | 'descartado_fora_de_tela_resultado'
    | 'nao_identificado'
    | 'duplicado'
    | 'instabilidade';
  state: VisionState;
  confirmedNow: boolean;
  wheelPhase: WheelPhase;
  sceneStability: SceneStabilityInfo;
  tempoEstavelMs: number;
  resultScreenInfo: ResultScreenDiagnosticoInfo;
  candidateResult?: {
    candidato: string | null;
    confirmacoesConsecutivas: number;
    confirmacoesNecessarias: number;
    primeiraDeteccaoTimestamp: number | null;
    ultimaDeteccaoTimestamp: number | null;
    lastConfidence: number;
    tempoEstavelMs: number;
  };
  ultimoResultadoConfirmado?: {
    objeto: string | null;
    horario: number | null;
    confianca: number | null;
    eventId: string | null;
  };
  motivoDescarte?: string;
  objetoPadraoParaBanco?: {
    resultado: string;
    confianca: number;
    origem: 'gemini_live';
    criado_em: string;
    eventId: string;
  };
}

export const OBJETOS_RODA_PERMITIDOS = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
] as const;

export type ObjetoRodaPermitido = (typeof OBJETOS_RODA_PERMITIDOS)[number];

export interface AnalyzerMetrics {
  totalFramesProcessados: number;
  totalDeteccoesValidas: number;
  totalCandidatosIniciados: number;
  totalConfirmados: number;
  totalDuplicacoesBloqueadas: number;
  totalDescartesBaixaConfianca: number;
  totalNaoIdentificados: number;
  totalInstabilidadesDetectadas: number;
  totalJanelasExcedidas: number;
  motivoUltimoDescarte: string | null;
  // Métricas do Ciclo de Rodada
  resultadosConfirmados: number;
  telasResultadoDetectadas: number;
  telasResultadoEncerradas: number;
  rodadasLiberadas: number;
  rodadasBloqueadas: number;
  eventIdsCriados: number;
}

export const VISION_ANALYZER_CONFIG = {
  MIN_CONFIRMATIONS: 3,
  MIN_CONFIDENCE: 85,
  STABILITY_WINDOW_MS: 1000,
  MAX_CONFIRMATION_WINDOW_MS: 3000,
  SUSTAINED_UNIDENTIFIED_FRAMES_TO_RESET: 3,
} as const;

/**
 * WheelVisionAnalyzer
 * Máquina de Estados da Tela de Resultado para a Roda da Farm Fishing.
 *
 * Estados:
 * IDLE -> RODA_NORMAL -> RODA_EM_TRANSICAO -> TELA_RESULTADO_DETECTADA -> LEITURA_RESULTADO -> RESULTADO_CONFIRMADO -> AGUARDANDO_PROXIMA_RODADA
 */
export function normalizeWheelObjectName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (s === 'sorvete') return 'sorvete';
  if (s === 'boia' || s === 'bóia') return 'boia';
  if (s === 'balao' || s === 'balão') return 'balao';
  if (s === 'soco') return 'soco';
  if (s === 'tedy' || s === 'teddy') return 'tedy';
  if (s === 'princesa') return 'princesa';
  if (s === 'camera' || s === 'câmera') return 'camera';
  if (s === 'coroa') return 'coroa';
  return null;
}

export class WheelVisionAnalyzer {
  private currentState: VisionState = 'WAITING_FOR_RESULT';
  private candidateResult: string | null = null;
  private confirmacoesConsecutivas: number = 0;
  private primeiraDeteccaoTimestamp: number | null = null;
  private ultimaDeteccaoTimestamp: number | null = null;
  private lastConfidence: number = 0;

  private minimumConfirmations: number = VISION_ANALYZER_CONFIG.MIN_CONFIRMATIONS;
  private minConfidence: number = VISION_ANALYZER_CONFIG.MIN_CONFIDENCE;
  private stabilityWindowMs: number = VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS;
  private maxConfirmationWindowMs: number = VISION_ANALYZER_CONFIG.MAX_CONFIRMATION_WINDOW_MS;

  private ultimoObjetoConfirmado: string | null = null;
  private currentEventId: string | null = null;
  private previousEventId: string | null = null;
  private lastConfirmedEventId: string | null = null;
  private horarioUltimaConfirmacao: number | null = null;
  private confiancaUltimaConfirmacao: number | null = null;
  private motivoUltimoDescarte: string | null = null;

  private naoIdentificadoCountConsecutivo: number = 0;
  private roundSequenceCounter: number = 0;

  // Rastreamento da Tela de Resultado e Result Screen Gate (2 Frames para confirmação de entrada)
  private resultadoScreenDetected: boolean = false;
  private resultScreenConfidence: number = 0;
  private framesAnalisadosJanela: number = 0;
  private resultScreenDetectedAtTimestamp: number | null = null;
  private resultScreenGoneFramesCount: number = 0;
  private readonly MIN_GONE_FRAMES_FOR_EXIT: number = 3;
  private roundLock: boolean = false;

  private stableResultScreenFramesCount: number = 0;
  private readonly MIN_STABLE_RESULT_SCREEN_FRAMES: number = 1;
  private resultScreenConfirmed: boolean = false;
  private resultScreenGateStatus: 'NORMAL' | 'CANDIDATE' | 'CONFIRMED' = 'NORMAL';
  private resultScreenGateScore: number = 0;
  private resultScreenBlockReason: string = 'RODA_NORMAL_OU_TRANSICAO';

  // Métricas
  private metrics: AnalyzerMetrics = {
    totalFramesProcessados: 0,
    totalDeteccoesValidas: 0,
    totalCandidatosIniciados: 0,
    totalConfirmados: 0,
    totalDuplicacoesBloqueadas: 0,
    totalDescartesBaixaConfianca: 0,
    totalNaoIdentificados: 0,
    totalInstabilidadesDetectadas: 0,
    totalJanelasExcedidas: 0,
    motivoUltimoDescarte: null,
    resultadosConfirmados: 0,
    telasResultadoDetectadas: 0,
    telasResultadoEncerradas: 0,
    rodadasLiberadas: 0,
    rodadasBloqueadas: 0,
    eventIdsCriados: 0,
  };

  constructor(
    minimumConfirmations: number = VISION_ANALYZER_CONFIG.MIN_CONFIRMATIONS,
    minConfidence: number = VISION_ANALYZER_CONFIG.MIN_CONFIDENCE,
    stabilityWindowMs: number = VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS,
    maxConfirmationWindowMs: number = VISION_ANALYZER_CONFIG.MAX_CONFIRMATION_WINDOW_MS
  ) {
    this.minimumConfirmations = minimumConfirmations;
    this.minConfidence = minConfidence;
    this.stabilityWindowMs = stabilityWindowMs;
    this.maxConfirmationWindowMs = maxConfirmationWindowMs;
  }

  public resetAnalyzer(): void {
    this.currentState = 'WAITING_FOR_RESULT';
    this.candidateResult = null;
    this.confirmacoesConsecutivas = 0;
    this.primeiraDeteccaoTimestamp = null;
    this.ultimaDeteccaoTimestamp = null;
    this.lastConfidence = 0;
    this.ultimoObjetoConfirmado = null;
    this.currentEventId = null;
    this.previousEventId = null;
    this.lastConfirmedEventId = null;
    this.horarioUltimaConfirmacao = null;
    this.confiancaUltimaConfirmacao = null;
    this.motivoUltimoDescarte = null;
    this.naoIdentificadoCountConsecutivo = 0;
    this.roundSequenceCounter = 0;
    this.resultadoScreenDetected = false;
    this.resultScreenConfidence = 0;
    this.framesAnalisadosJanela = 0;
    this.resultScreenDetectedAtTimestamp = null;
    this.resultScreenGoneFramesCount = 0;
    this.stableResultScreenFramesCount = 0;
    this.resultScreenConfirmed = false;
    this.resultScreenGateStatus = 'NORMAL';
    this.resultScreenGateScore = 0;
    this.resultScreenBlockReason = 'RODA_NORMAL_OU_TRANSICAO';
    this.roundLock = false;
  }

  public isRoundLocked(): boolean {
    return this.roundLock;
  }

  private logStateTransition(fromState: VisionState, toState: VisionState, reason: string, extra: Record<string, any> = {}) {
    const details = [
      `from=${fromState}`,
      `to=${toState}`,
      `reason=${reason}`,
      extra.candidate ? `object=${extra.candidate}` : null,
      extra.conf !== undefined ? `confidence=${extra.conf}%` : null,
      extra.gap !== undefined ? `gap=${extra.gap}%` : null,
      extra.eventId ? `eventId=${extra.eventId}` : null,
      extra.frame !== undefined ? `frame=${extra.frame}` : null,
    ].filter(Boolean).join(' ');

    logger.info(`[STATE_TRANSITION] ${fromState} -> ${toState} | ${details}`);
    console.log(
      `[STATE_TRANSITION]\n` +
      `CURRENT_STATE = ${fromState}\n` +
      `INPUT_OBJECT = ${extra.candidate || 'nenhum'}\n` +
      `INPUT_CONFIDENCE = ${extra.conf ?? 0}\n` +
      `INPUT_GAP = ${extra.gap ?? 0}\n` +
      `NEXT_STATE = ${toState}\n` +
      `reason = ${reason}`
    );
  }

  public setUltimoObjetoConfirmado(objeto: string | null, eventId: string | null = null) {
    this.ultimoObjetoConfirmado = objeto;
    this.currentEventId = eventId;
    if (objeto) {
      this.currentState = 'WAITING_FOR_RESULT_SCREEN_EXIT';
      this.horarioUltimaConfirmacao = Date.now();
    } else {
      this.currentState = 'WAITING_FOR_RESULT';
    }
  }

  public getUltimoObjetoConfirmado(): string | null {
    return this.ultimoObjetoConfirmado;
  }

  public getCurrentEventId(): string | null {
    return this.currentEventId;
  }

  public getCurrentState(): VisionState {
    return this.currentState;
  }

  public isResultScreenConfirmed(): boolean {
    return this.resultScreenConfirmed;
  }

  public getResultScreenGateInfo() {
    return {
      status: this.resultScreenGateStatus,
      score: this.resultScreenGateScore,
      stableFrames: this.stableResultScreenFramesCount,
      maxStableFrames: this.MIN_STABLE_RESULT_SCREEN_FRAMES,
      recognitionAllowed: this.resultScreenConfirmed,
      blockReason: this.resultScreenBlockReason,
    };
  }

  /**
   * Prever/Verificar se o próximo frame de tela de resultado atinge a estabilidade necessária (2 frames consecutivos).
   */
  public peekResultScreenConfirmed(resultadoScreenDetected: boolean, resultScreenConfidence: number = 0): boolean {
    if (!resultadoScreenDetected || resultScreenConfidence < 0.85) {
      return false;
    }
    return (this.stableResultScreenFramesCount + 1) >= this.MIN_STABLE_RESULT_SCREEN_FRAMES || this.resultScreenConfirmed;
  }

  public getMetrics(): AnalyzerMetrics {
    return { ...this.metrics, motivoUltimoDescarte: this.motivoUltimoDescarte };
  }

  public getCandidateState() {
    const tempoDesdeDeteccaoMs = this.resultScreenDetectedAtTimestamp
      ? Math.max(0, Date.now() - this.resultScreenDetectedAtTimestamp)
      : 0;

    return {
      candidato: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      confirmacoesNecessarias: this.minimumConfirmations,
      primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
      ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
      lastConfidence: this.lastConfidence,
      state: this.currentState,
      eventId: this.currentEventId,
      motivoUltimoDescarte: this.motivoUltimoDescarte,
      tempoEstavelMs: tempoDesdeDeteccaoMs,
      resultadoScreenDetected: this.resultadoScreenDetected,
      resultScreenConfidence: this.resultScreenConfidence,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      ultimoObjetoConfirmado: this.ultimoObjetoConfirmado,
    };
  }

  public getStateSnapshot(): WheelVisionAnalyzerSnapshot {
    return {
      currentState: this.currentState,
      candidateResult: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
      ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
      lastConfidence: this.lastConfidence,
      ultimoObjetoConfirmado: this.ultimoObjetoConfirmado,
      currentEventId: this.currentEventId,
      horarioUltimaConfirmacao: this.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: this.confiancaUltimaConfirmacao,
      motivoUltimoDescarte: this.motivoUltimoDescarte,
      naoIdentificadoCountConsecutivo: this.naoIdentificadoCountConsecutivo,
      roundSequenceCounter: this.roundSequenceCounter,
      resultadoScreenDetected: this.resultadoScreenDetected,
      resultScreenConfidence: this.resultScreenConfidence,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      resultScreenDetectedAtTimestamp: this.resultScreenDetectedAtTimestamp,
      metrics: { ...this.metrics },
    };
  }

  public restoreState(snapshot: Partial<WheelVisionAnalyzerSnapshot>): void {
    if (snapshot.currentState !== undefined) this.currentState = snapshot.currentState;
    if (snapshot.candidateResult !== undefined) this.candidateResult = snapshot.candidateResult;
    if (snapshot.confirmacoesConsecutivas !== undefined) this.confirmacoesConsecutivas = snapshot.confirmacoesConsecutivas;
    if (snapshot.primeiraDeteccaoTimestamp !== undefined) this.primeiraDeteccaoTimestamp = snapshot.primeiraDeteccaoTimestamp;
    if (snapshot.ultimaDeteccaoTimestamp !== undefined) this.ultimaDeteccaoTimestamp = snapshot.ultimaDeteccaoTimestamp;
    if (snapshot.lastConfidence !== undefined) this.lastConfidence = snapshot.lastConfidence;
    if (snapshot.ultimoObjetoConfirmado !== undefined) this.ultimoObjetoConfirmado = snapshot.ultimoObjetoConfirmado;
    if (snapshot.currentEventId !== undefined) this.currentEventId = snapshot.currentEventId;
    if (snapshot.horarioUltimaConfirmacao !== undefined) this.horarioUltimaConfirmacao = snapshot.horarioUltimaConfirmacao;
    if (snapshot.confiancaUltimaConfirmacao !== undefined) this.confiancaUltimaConfirmacao = snapshot.confiancaUltimaConfirmacao;
    if (snapshot.motivoUltimoDescarte !== undefined) this.motivoUltimoDescarte = snapshot.motivoUltimoDescarte;
    if (snapshot.naoIdentificadoCountConsecutivo !== undefined) this.naoIdentificadoCountConsecutivo = snapshot.naoIdentificadoCountConsecutivo;
    if (snapshot.roundSequenceCounter !== undefined) this.roundSequenceCounter = snapshot.roundSequenceCounter;
    if (snapshot.resultadoScreenDetected !== undefined) this.resultadoScreenDetected = snapshot.resultadoScreenDetected;
    if (snapshot.resultScreenConfidence !== undefined) this.resultScreenConfidence = snapshot.resultScreenConfidence;
    if (snapshot.framesAnalisadosJanela !== undefined) this.framesAnalisadosJanela = snapshot.framesAnalisadosJanela;
    if (snapshot.resultScreenDetectedAtTimestamp !== undefined) this.resultScreenDetectedAtTimestamp = snapshot.resultScreenDetectedAtTimestamp;
    if (snapshot.metrics) this.metrics = { ...snapshot.metrics };
  }

  public getUltimoResultadoConfirmado() {
    return {
      objeto: this.ultimoObjetoConfirmado,
      horario: this.horarioUltimaConfirmacao,
      confianca: this.confiancaUltimaConfirmacao,
      eventId: this.currentEventId,
    };
  }

  private calculateWheelPhase(state: VisionState): WheelPhase {
    switch (state) {
      case 'WAITING_FOR_RESULT':
      case 'IDLE':
      case 'RODA_NORMAL':
        return 'DETECÇÃO';
      case 'RESULT_SCREEN_DETECTED':
      case 'RECOGNIZING_RESULT':
      case 'RESULT_CANDIDATE':
      case 'RESULT_CONFIRMING':
      case 'TELA_RESULTADO_DETECTADA':
      case 'LEITURA_RESULTADO':
      case 'RESULTADO_CONFIRMANDO':
        return 'ESTABILIZAÇÃO';
      case 'RESULT_CONFIRMED':
      case 'RESULTADO_CONFIRMADO':
        return 'RESULTADO';
      case 'WAITING_FOR_RESULT_SCREEN_EXIT':
      case 'RESULT_SCREEN_EXITED':
      case 'WAITING_FOR_NEXT_ROUND':
      case 'NEXT_ROUND_READY':
      case 'RODA_EM_TRANSICAO':
      case 'AGUARDANDO_SAIDA_TELA_RESULTADO':
      case 'AGUARDANDO_PROXIMA_RODADA':
      case 'NOVA_RODADA_LIBERADA':
      default:
        return 'TRANSIÇÃO';
    }
  }

  private calculateSceneStability(
    state: VisionState,
    tempoEstavelMs: number,
    confianca: number
  ): SceneStabilityInfo {
    if (state === 'RESULT_CONFIRMED' || state === 'RESULTADO_CONFIRMADO') {
      return { score: 98, state: 'ESTÁVEL' };
    }
    if (
      state === 'RECOGNIZING_RESULT' ||
      state === 'RESULT_CANDIDATE' ||
      state === 'RESULT_CONFIRMING' ||
      state === 'RESULT_SCREEN_DETECTED' ||
      state === 'LEITURA_RESULTADO' ||
      state === 'TELA_RESULTADO_DETECTADA'
    ) {
      return { score: Math.round(70 + (confianca / 100) * 25), state: 'TRANSIÇÃO' };
    }
    if (state === 'WAITING_FOR_RESULT' || state === 'RODA_NORMAL') {
      return { score: 80, state: 'ESTÁVEL' };
    }
    return { score: 40, state: 'TRANSIÇÃO' };
  }

  public isResultScreenActuallyGone(): boolean {
    return !this.resultadoScreenDetected && this.resultScreenGoneFramesCount >= this.MIN_GONE_FRAMES_FOR_EXIT;
  }

  /**
   * Processa detecção seguindo rigorosamente a máquina de estados em 10 etapas:
   * 1. WAITING_FOR_RESULT
   * 2. RESULT_SCREEN_DETECTED
   * 3. RECOGNIZING_RESULT
   * 4. RESULT_CANDIDATE
   * 5. RESULT_CONFIRMING (3/3)
   * 6. RESULT_CONFIRMED
   * 7. WAITING_FOR_RESULT_SCREEN_EXIT
   * 8. RESULT_SCREEN_EXITED
   * 9. WAITING_FOR_NEXT_ROUND
   * 10. NEXT_ROUND_READY
   */
  public processarDeteccao(
    rawObjeto: string | null | undefined,
    confiancaRaw: number,
    resultadoScreenDetected: boolean = false,
    resultScreenConfidence: number = 0,
    sessionId?: string,
    currentFrameId?: number,
    timestampOverride?: number,
    gapRaw?: number
  ): WheelVisionAnalysisResult {
    this.metrics.totalFramesProcessados++;
    const timestamp = timestampOverride !== undefined ? timestampOverride : Date.now();
    const objetoNormalizado = rawObjeto ? (normalizeWheelObjectName(rawObjeto) || rawObjeto.trim().toLowerCase()) : null;
    const gapPct = gapRaw !== undefined ? gapRaw : 10;

    this.resultadoScreenDetected = resultadoScreenDetected;
    this.resultScreenConfidence = resultScreenConfidence;
    const isScreenDetectedAndStable = resultadoScreenDetected && resultScreenConfidence >= 0.85;

    // INVARIANTE E REPARO DE ESTADO: WAITING_FOR_RESULT_SCREEN_EXIT só é válido se roundLock === true (rodada confirmada)
    const isAwaitingExitState =
      this.currentState === 'WAITING_FOR_RESULT_SCREEN_EXIT' ||
      this.currentState === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
      this.currentState === 'RESULT_CONFIRMED' ||
      this.currentState === 'RESULTADO_CONFIRMADO';

    if (isAwaitingExitState && !this.roundLock && this.confirmacoesConsecutivas < this.minimumConfirmations) {
      if (isScreenDetectedAndStable) {
        logger.warn(
          `[STATE_REPAIR] state=${this.currentState} inconsistente sem roundLock. Corrigindo para RECOGNIZING_RESULT pois a tela de resultado está detectada e estável.`
        );
        this.currentState = 'RECOGNIZING_RESULT';
        if (!this.resultScreenDetectedAtTimestamp) {
          this.resultScreenDetectedAtTimestamp = timestamp;
        }
      } else {
        logger.warn(
          `[STATE_REPAIR] state=${this.currentState} inconsistente sem roundLock. Corrigindo para WAITING_FOR_RESULT pois a tela está ausente.`
        );
        this.currentState = 'WAITING_FOR_RESULT';
      }
    }

    // TELEMETRIA OBRIGATÓRIA: [RESULT_SCREEN_STATE]
    logger.info(
      `[RESULT_SCREEN_STATE]\n` +
      `screenDetected=${resultadoScreenDetected}\n` +
      `screenScore=${Math.round(resultScreenConfidence * 100)}\n` +
      `previousState=${this.currentState}\n` +
      `nextState=${this.currentState}\n` +
      `roundLock=${this.roundLock}\n` +
      `confirmedRound=${this.confirmacoesConsecutivas >= this.minimumConfirmations}\n` +
      `exitCounter=${this.resultScreenGoneFramesCount}`
    );

    // TRACE DE ESTADO OBRIGATÓRIO EM CADA FRAME
    logger.info(
      `STATE_TRACE state=${this.currentState} object=${objetoNormalizado || 'nenhum'} lastConfirmedObject=${this.ultimoObjetoConfirmado || 'nenhum'} confirmacoesConsecutivas=${this.confirmacoesConsecutivas} resultScreenGoneFramesCount=${this.resultScreenGoneFramesCount} eventId=${this.currentEventId || 'N/A'} roundId=${this.currentEventId || 'N/A'}`
    );

    // 1. TELA DE RESULTADO AUSENTE (RESULT_ZONE INATIVA / RODA GIRANDO)
    if (!isScreenDetectedAndStable) {
      this.stableResultScreenFramesCount = 0;
      this.resultScreenConfirmed = false;
      this.resultScreenGateStatus = 'NORMAL';
      this.resultScreenBlockReason = 'RODA_NORMAL_OU_TRANSICAO';
      if (!resultadoScreenDetected) {
        this.resultScreenGoneFramesCount++;
      } else {
        this.resultScreenGoneFramesCount = 0;
      }

      if (objetoNormalizado && objetoNormalizado !== 'nenhum' && objetoNormalizado !== 'não identificado') {
        logger.info(
          `[STATE_REJECTION] state=${this.currentState} object=${objetoNormalizado} reason=WAITING_FOR_RESULT_SCREEN_EXIT lastConfirmedObject=${this.ultimoObjetoConfirmado || 'nenhum'} lastEventId=${this.previousEventId || 'N/A'} currentEventId=${this.currentEventId || 'N/A'}`
        );
        logger.info(
          `[PERSISTENCE_SKIPPED] eventId=${this.currentEventId || 'N/A'} roundId=${this.currentEventId || 'N/A'} object=${objetoNormalizado} reason=WAITING_FOR_RESULT_SCREEN_EXIT`
        );
      }

      const wasAwaitingExit =
        this.currentState === 'WAITING_FOR_RESULT_SCREEN_EXIT' ||
        this.currentState === 'RESULT_CONFIRMED' ||
        this.currentState === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
        this.currentState === 'RESULTADO_CONFIRMADO' ||
        this.currentState === 'RECOGNIZING_RESULT' ||
        this.currentState === 'RESULT_CANDIDATE' ||
        this.currentState === 'RESULT_CONFIRMING' ||
        this.currentState === 'LEITURA_RESULTADO' ||
        this.currentState === 'RESULTADO_CONFIRMANDO';

      if (wasAwaitingExit) {
        if (!this.isResultScreenActuallyGone()) {
          // 1º frame de ausência: aguardar 2º frame antes de liberar
          if (this.currentState !== 'WAITING_FOR_RESULT_SCREEN_EXIT') {
            this.currentState = 'WAITING_FOR_RESULT_SCREEN_EXIT';
          }
        } else {
          // 3 frames ausentes confirmados -> RESULT_SCREEN_EXITED -> WAITING_FOR_NEXT_ROUND -> NEXT_ROUND_READY -> WAITING_FOR_RESULT
          this.metrics.telasResultadoEncerradas++;
          if (this.roundLock) {
            this.metrics.rodadasLiberadas++;
            this.roundLock = false;
          }

          const prevEvt = this.currentEventId || this.lastConfirmedEventId;
          this.previousEventId = prevEvt;

          this.logStateTransition(this.currentState, 'RESULT_SCREEN_EXITED', 'RESULT_ZONE_EXIT_CONFIRMED_2_FRAMES', { eventId: prevEvt, frame: currentFrameId });
          this.currentState = 'RESULT_SCREEN_EXITED';
          notificarSaidaTelaResultado(sessionId);

          this.logStateTransition('RESULT_SCREEN_EXITED', 'WAITING_FOR_NEXT_ROUND', 'CLEANUP_ROUND_FLAGS', { eventId: prevEvt, frame: currentFrameId });
          this.currentState = 'WAITING_FOR_NEXT_ROUND';

          // Limpar candidato, contador, eventId, etc.
          this.currentEventId = null;
          this.candidateResult = null;
          this.confirmacoesConsecutivas = 0;
          this.framesAnalisadosJanela = 0;
          this.resultScreenDetectedAtTimestamp = null;
          this.primeiraDeteccaoTimestamp = null;

          this.logStateTransition('WAITING_FOR_NEXT_ROUND', 'NEXT_ROUND_READY', 'ROUND_RELEASED_FOR_NEXT_DETECTION', { frame: currentFrameId });
          this.currentState = 'NEXT_ROUND_READY';

          this.logStateTransition('NEXT_ROUND_READY', 'WAITING_FOR_RESULT', 'READY_FOR_NEW_ROUND', { frame: currentFrameId });
          this.currentState = 'WAITING_FOR_RESULT';
        }
      } else {
        this.currentState = 'WAITING_FOR_RESULT';
      }

      const resultScreenInfo: ResultScreenDiagnosticoInfo = {
        resultadoScreenDetected: false,
        confidence: resultScreenConfidence,
        estadoAtual: this.currentState,
        tempoDesdeDeteccaoMs: 0,
        framesAnalisadosJanela: 0,
        candidatoAtual: null,
        confirmacoesConsecutivas: 0,
        resultadoConfirmado: this.ultimoObjetoConfirmado,
        eventId: this.currentEventId,
      };

      return {
        objeto: 'não identificado',
        confianca: 0,
        timestamp,
        eventId: undefined, // NUNCA criar eventId fora da tela de resultado
        status: 'descartado_fora_de_tela_resultado',
        state: this.currentState,
        confirmedNow: false,
        wheelPhase: this.calculateWheelPhase(this.currentState),
        sceneStability: this.calculateSceneStability(this.currentState, 0, confiancaRaw),
        tempoEstavelMs: 0,
        resultScreenInfo,
        candidateResult: {
          candidato: null,
          confirmacoesConsecutivas: 0,
          confirmacoesNecessarias: this.minimumConfirmations,
          primeiraDeteccaoTimestamp: null,
          ultimaDeteccaoTimestamp: null,
          lastConfidence: 0,
          tempoEstavelMs: 0,
        },
        ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
        motivoDescarte: 'Fora da Tela de Resultado (Resultado Bloqueado)',
      };
    }

    // 2. TELA DE RESULTADO DETECTADA
    const goneFramesBefore = this.resultScreenGoneFramesCount;
    this.resultScreenGoneFramesCount = 0;
    this.stableResultScreenFramesCount++;
    this.resultScreenGateScore = Math.round(resultScreenConfidence * 100);

    if (this.stableResultScreenFramesCount < this.MIN_STABLE_RESULT_SCREEN_FRAMES) {
      // Aguardando estabilidade de 2 frames consecutivas
      this.resultScreenConfirmed = false;
      this.resultScreenGateStatus = 'CANDIDATE';
      this.resultScreenBlockReason = 'AWAITING_STABLE_RESULT_SCREEN_FRAMES (1/2)';

      const resultScreenInfo: ResultScreenDiagnosticoInfo = {
        resultadoScreenDetected: true,
        confidence: resultScreenConfidence,
        estadoAtual: this.currentState,
        tempoDesdeDeteccaoMs: 0,
        framesAnalisadosJanela: 0,
        candidatoAtual: null,
        confirmacoesConsecutivas: 0,
        resultadoConfirmado: this.ultimoObjetoConfirmado,
        eventId: null,
      };

      return {
        objeto: 'não identificado',
        confianca: 0,
        timestamp,
        eventId: undefined,
        status: 'descartado_fora_de_tela_resultado',
        state: this.currentState,
        confirmedNow: false,
        wheelPhase: this.calculateWheelPhase(this.currentState),
        sceneStability: this.calculateSceneStability(this.currentState, 0, confiancaRaw),
        tempoEstavelMs: 0,
        resultScreenInfo,
        candidateResult: {
          candidato: null,
          confirmacoesConsecutivas: 0,
          confirmacoesNecessarias: this.minimumConfirmations,
          primeiraDeteccaoTimestamp: null,
          ultimaDeteccaoTimestamp: null,
          lastConfidence: 0,
          tempoEstavelMs: 0,
        },
        ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
        motivoDescarte: 'Aguardando 2 frames consecutivos da Tela de Resultado',
      };
    }

    // Gate da Tela de Resultado Confirmado (2+ frames)
    this.resultScreenConfirmed = true;
    this.resultScreenGateStatus = 'CONFIRMED';
    this.resultScreenBlockReason = 'NONE';

    const isNewScreenEntry =
      !this.roundLock &&
      (
        this.currentState === 'WAITING_FOR_RESULT' ||
        this.currentState === 'NEXT_ROUND_READY' ||
        this.currentState === 'RODA_NORMAL' ||
        this.currentState === 'IDLE' ||
        this.currentState === 'NOVA_RODADA_LIBERADA' ||
        this.currentState === 'RODA_EM_TRANSICAO'
      );

    if (isNewScreenEntry) {
      // Entrada na tela de resultado: abre janela de reconhecimento sem bloquear ou gerar eventId prematuro
      this.candidateResult = null;
      this.confirmacoesConsecutivas = 0;
      this.metrics.telasResultadoDetectadas++;
      this.resultScreenDetectedAtTimestamp = timestamp;
      this.framesAnalisadosJanela = 0;

      const prevState = this.currentState;
      this.currentState = 'RECOGNIZING_RESULT';

      this.logStateTransition(prevState, 'RESULT_SCREEN_DETECTED', 'RESULT_ZONE_STABLE_CONFIRMED', {
        frame: currentFrameId,
        candidate: objetoNormalizado,
        conf: confiancaRaw,
        gap: gapPct,
      });

      this.logStateTransition('RESULT_SCREEN_DETECTED', 'RECOGNIZING_RESULT', 'START_VISUAL_RECOGNITION', {
        frame: currentFrameId,
        candidate: objetoNormalizado,
        conf: confiancaRaw,
        gap: gapPct,
      });

      // TELEMETRIA OBRIGATÓRIA: [ANALYZER_TRANSITION]
      logger.info(
        `[ANALYZER_TRANSITION]\n` +
        `frameId=${currentFrameId || 'N/A'}\n` +
        `previousState=${prevState}\n` +
        `nextState=RECOGNIZING_RESULT\n` +
        `object=${objetoNormalizado || 'nenhum'}\n` +
        `confidence=${confiancaRaw}\n` +
        `candidateCount=0\n` +
        `requiredConfirmations=${this.minimumConfirmations}\n` +
        `roundLock=${this.roundLock}`
      );
    }

    // Se a zona de resultado não contem mais um objeto válido (nenhum / não identificado / null), a tela anterior fechou.
    const isObjetoInvalidoOuNenhum =
      !objetoNormalizado ||
      objetoNormalizado === 'nenhum' ||
      objetoNormalizado === 'não identificado' ||
      objetoNormalizado === 'nao_identificado';

    if (
      isObjetoInvalidoOuNenhum &&
      this.isResultScreenActuallyGone() &&
      (
        this.currentState === 'WAITING_FOR_RESULT_SCREEN_EXIT' ||
        this.currentState === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
        this.currentState === 'RESULT_CONFIRMED' ||
        this.currentState === 'RESULTADO_CONFIRMADO'
      )
    ) {
      this.confirmacoesConsecutivas = 0;
      this.candidateResult = null;
      this.logStateTransition(this.currentState, 'WAITING_FOR_RESULT', 'RESULT_OBJECT_CLEARED_READY_FOR_NEXT_ROUND', { frame: currentFrameId });
      this.currentState = 'WAITING_FOR_RESULT';
    }

    const tempoDesdeDeteccaoMs = this.resultScreenDetectedAtTimestamp
      ? Math.max(0, timestamp - this.resultScreenDetectedAtTimestamp)
      : 0;

    // 3. SE A RODADA JÁ FOI CONFIRMADA NESTA MESMA TELA (roundLock === true) -> BLOQUEAR DUPLICAÇÕES
    if (this.roundLock) {
      this.metrics.totalDuplicacoesBloqueadas++;
      this.metrics.rodadasBloqueadas++;
      this.currentState = 'WAITING_FOR_RESULT_SCREEN_EXIT';

      logger.info(
        `[ROUND_DECISION]\n` +
        `decision=REJECT_DUPLICATE_SCREEN_LIFECYCLE\n` +
        `reason=ROUND_ALREADY_LOCKED\n` +
        `eventId=${this.currentEventId || 'N/A'}\n` +
        `roundId=${this.currentEventId || 'N/A'}`
      );

      logger.info(
        `[STATE_REJECTION] state=WAITING_FOR_RESULT_SCREEN_EXIT object=${objetoNormalizado || 'nenhum'} reason=WAITING_FOR_RESULT_SCREEN_EXIT lastConfirmedObject=${this.ultimoObjetoConfirmado || 'nenhum'} lastEventId=${this.previousEventId || 'N/A'} currentEventId=${this.currentEventId || 'N/A'}`
      );

      logger.info(
        `[PERSISTENCE_SKIPPED] eventId=${this.currentEventId || 'N/A'} roundId=${this.currentEventId || 'N/A'} object=${objetoNormalizado || 'nenhum'} reason=WAITING_FOR_RESULT_SCREEN_EXIT`
      );

      const resultScreenInfo: ResultScreenDiagnosticoInfo = {
        resultadoScreenDetected: true,
        confidence: resultScreenConfidence,
        estadoAtual: 'WAITING_FOR_RESULT_SCREEN_EXIT',
        tempoDesdeDeteccaoMs,
        framesAnalisadosJanela: this.framesAnalisadosJanela,
        candidatoAtual: this.candidateResult,
        confirmacoesConsecutivas: this.confirmacoesConsecutivas,
        resultadoConfirmado: this.ultimoObjetoConfirmado,
        eventId: this.currentEventId,
      };

      return {
        objeto: objetoNormalizado || 'não identificado',
        confianca: confiancaRaw,
        timestamp,
        eventId: this.currentEventId || undefined,
        status: 'duplicado',
        state: 'WAITING_FOR_RESULT_SCREEN_EXIT',
        confirmedNow: false,
        wheelPhase: this.calculateWheelPhase('WAITING_FOR_RESULT_SCREEN_EXIT'),
        sceneStability: this.calculateSceneStability('WAITING_FOR_RESULT_SCREEN_EXIT', tempoDesdeDeteccaoMs, confiancaRaw),
        tempoEstavelMs: tempoDesdeDeteccaoMs,
        resultScreenInfo,
        candidateResult: {
          candidato: this.candidateResult,
          confirmacoesConsecutivas: this.confirmacoesConsecutivas,
          confirmacoesNecessarias: this.minimumConfirmations,
          primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
          ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
          lastConfidence: this.lastConfidence,
          tempoEstavelMs: tempoDesdeDeteccaoMs,
        },
        ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
        motivoDescarte: `Aguardando saída da Tela de Resultado para a rodada ${this.currentEventId || 'atual'}`,
      };
    }

    // 4. RECOGNIZING_RESULT / RESULT_CANDIDATE / RESULT_CONFIRMING
    this.framesAnalisadosJanela++;

    // Reinicializar janela se houver timeout sem ter atingido confirmação (sem travar em WAITING_FOR_RESULT_SCREEN_EXIT)
    if (tempoDesdeDeteccaoMs > 3000 && !this.roundLock) {
      logger.info(`[JANELA_TIMEOUT] Renovando janela de reconhecimento sem rodada confirmada (${tempoDesdeDeteccaoMs}ms).`);
      this.resultScreenDetectedAtTimestamp = timestamp;
      this.candidateResult = null;
      this.confirmacoesConsecutivas = 0;
    }

    const ehPermitido =
      objetoNormalizado &&
      OBJETOS_RODA_PERMITIDOS.includes(objetoNormalizado as ObjetoRodaPermitido);

    const isRecognizedValid = ehPermitido && confiancaRaw >= this.minConfidence && gapPct >= 3;

    if (isRecognizedValid) {
      const objetoValido = objetoNormalizado!;

      if (this.candidateResult === objetoValido) {
        this.confirmacoesConsecutivas++;
      } else {
        this.candidateResult = objetoValido;
        this.confirmacoesConsecutivas = 1;
        this.primeiraDeteccaoTimestamp = timestamp;

        this.logStateTransition('RECOGNIZING_RESULT', 'RESULT_CANDIDATE', `CANDIDATE_FOUND (${objetoValido})`, {
          candidate: objetoValido,
          conf: confiancaRaw,
          gap: gapPct,
          frame: currentFrameId,
        });

        this.logStateTransition('RESULT_CANDIDATE', 'RESULT_CONFIRMING', `CONFIRMING_1/3`, {
          candidate: objetoValido,
          conf: confiancaRaw,
          gap: gapPct,
          frame: currentFrameId,
        });
        this.currentState = 'RESULT_CONFIRMING';
      }

      if (this.confirmacoesConsecutivas < this.minimumConfirmations) {
        this.currentState = 'RESULT_CONFIRMING';
        this.logStateTransition('RESULT_CONFIRMING', 'RESULT_CONFIRMING', `CONFIRMING_${this.confirmacoesConsecutivas}/3`, {
          candidate: objetoValido,
          conf: confiancaRaw,
          gap: gapPct,
          frame: currentFrameId,
        });
      }

      // ATINGIU 3/3 CONFIRMAÇÕES CONSECUTIVAS!
      if (this.confirmacoesConsecutivas >= this.minimumConfirmations) {
        if (!this.currentEventId) {
          this.roundSequenceCounter++;
          this.currentEventId = `LIVE_EVT_${timestamp}_R${String(this.roundSequenceCounter).padStart(3, '0')}`;
        }
        this.previousEventId = this.lastConfirmedEventId;
        this.lastConfirmedEventId = this.currentEventId;
        const prevObj = this.ultimoObjetoConfirmado;
        this.ultimoObjetoConfirmado = objetoValido;
        this.horarioUltimaConfirmacao = timestamp;
        this.confiancaUltimaConfirmacao = confiancaRaw;

        this.metrics.totalConfirmados++;
        this.metrics.resultadosConfirmados++;
        this.metrics.eventIdsCriados++;

        // VERIFICAÇÃO OBRIGATÓRIA DE EVENT_ID [EVENT_ID_CHECK]
        const isUnique = !this.previousEventId || this.currentEventId !== this.previousEventId;
        logger.info(
          `[EVENT_ID_CHECK] currentEventId=${this.currentEventId} previousEventId=${this.previousEventId || 'NONE'} unique=${isUnique} roundId=${this.currentEventId}`
        );

        if (this.previousEventId && this.previousEventId !== this.currentEventId) {
          logger.info(
            `[ROUND_TRANSITION] previousEventId=${this.previousEventId} newEventId=${this.currentEventId} newRound=true`
          );
        }

        logger.info(
          `[DEDUP_TRACE] frameId=${currentFrameId || 'N/A'} eventId=${this.currentEventId} previousEventId=${
            this.previousEventId || 'N/A'
          } currentObject=${objetoValido} previousObject=${
            this.previousEventId ? prevObj : 'nenhum'
          } resultScreenGoneFrames=${goneFramesBefore} isNewRound=true isDuplicate=false duplicateReason=NONE decision=${
            this.previousEventId ? 'ACCEPT_NEW_ROUND' : 'ACCEPT'
          }`
        );

        logger.info(
          `[ROUND_DECISION]\n` +
          `decision=CONFIRMED\n` +
          `reason=${this.minimumConfirmations}_CONSECUTIVE_CONFIRMATIONS\n` +
          `eventId=${this.currentEventId}\n` +
          `roundId=${this.currentEventId}`
        );

        this.logStateTransition('RESULT_CONFIRMING', 'RESULT_CONFIRMED', '3_CONSECUTIVE_CONFIRMATIONS_REACHED', {
          candidate: objetoValido,
          conf: confiancaRaw,
          gap: gapPct,
          eventId: this.currentEventId,
          frame: currentFrameId,
        });
        this.currentState = 'RESULT_CONFIRMED';
        this.roundLock = true;

        const currentConfirmationsCount = this.confirmacoesConsecutivas;

        // Reset candidate after confirmation (Requirement #17 & #4)
        this.candidateResult = null;
        this.confirmacoesConsecutivas = 0;
        this.lastConfidence = 0;

        // Transição imediata para WAITING_FOR_RESULT_SCREEN_EXIT para impedir duplicidades na MESMA rodada
        this.logStateTransition('RESULT_CONFIRMED', 'WAITING_FOR_RESULT_SCREEN_EXIT', 'ROUND_CONFIRMED_BLOCK_DUPLICATES', {
          eventId: this.currentEventId,
          frame: currentFrameId,
        });
        this.currentState = 'WAITING_FOR_RESULT_SCREEN_EXIT';

        const resultScreenInfo: ResultScreenDiagnosticoInfo = {
          resultadoScreenDetected: true,
          confidence: resultScreenConfidence,
          estadoAtual: 'RESULT_CONFIRMED',
          tempoDesdeDeteccaoMs,
          framesAnalisadosJanela: this.framesAnalisadosJanela,
          candidatoAtual: null,
          confirmacoesConsecutivas: 0,
          resultadoConfirmado: objetoValido,
          eventId: this.currentEventId,
        };

        const sceneStability = this.calculateSceneStability('RESULT_CONFIRMED', tempoDesdeDeteccaoMs, confiancaRaw);
        const wheelPhase = this.calculateWheelPhase('RESULT_CONFIRMED');

        return {
          objeto: objetoValido,
          confianca: confiancaRaw,
          timestamp,
          eventId: this.currentEventId,
          status: 'confirmado',
          state: 'RESULT_CONFIRMED',
          confirmedNow: true,
          wheelPhase,
          sceneStability,
          tempoEstavelMs: tempoDesdeDeteccaoMs,
          resultScreenInfo,
          candidateResult: {
            candidato: null,
            confirmacoesConsecutivas: 0,
            confirmacoesNecessarias: this.minimumConfirmations,
            primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
            ultimaDeteccaoTimestamp: timestamp,
            lastConfidence: 0,
            tempoEstavelMs: tempoDesdeDeteccaoMs,
          },
          ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
          objetoPadraoParaBanco: {
            resultado: objetoValido,
            confianca: confiancaRaw,
            origem: 'gemini_live',
            criado_em: new Date(timestamp).toISOString(),
            eventId: this.currentEventId,
          },
        };
      }
    } else {
      this.candidateResult = null;
      this.confirmacoesConsecutivas = 0;
      this.lastConfidence = 0;
      if (this.currentState === 'RESULT_CONFIRMING' || this.currentState === 'RESULT_CANDIDATE') {
        this.logStateTransition(this.currentState, 'RECOGNIZING_RESULT', `CANDIDATE_RESET (invalid detection: object=${objetoNormalizado || 'nenhum'} conf=${confiancaRaw}% gap=${gapPct}%)`, {
          candidate: objetoNormalizado,
          conf: confiancaRaw,
          gap: gapPct,
          frame: currentFrameId,
        });
        this.currentState = 'RECOGNIZING_RESULT';
      }
      logger.info(`[RECOGNITION_IGNORE] Ignoring low confidence/invalid frame object=${objetoNormalizado} conf=${confiancaRaw}% gap=${gapPct}%`);
      if (objetoNormalizado && objetoNormalizado !== 'nenhum') {
        logger.info(
          `[PERSISTENCE_SKIPPED] eventId=${this.currentEventId || 'N/A'} roundId=${this.currentEventId || 'N/A'} object=${objetoNormalizado} reason=INVALID_OBJECT`
        );
      }
    }

    // Em análise
    const resultScreenInfo: ResultScreenDiagnosticoInfo = {
      resultadoScreenDetected: true,
      confidence: resultScreenConfidence,
      estadoAtual: this.currentState,
      tempoDesdeDeteccaoMs,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      candidatoAtual: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      resultadoConfirmado: this.ultimoObjetoConfirmado,
      eventId: this.currentEventId,
    };

    const sceneStability = this.calculateSceneStability(this.currentState, tempoDesdeDeteccaoMs, confiancaRaw);
    const wheelPhase = this.calculateWheelPhase(this.currentState);

    return {
      objeto: objetoNormalizado || 'não identificado',
      confianca: confiancaRaw,
      timestamp,
      eventId: undefined,
      status: 'em_analise',
      state: this.currentState,
      confirmedNow: false,
      wheelPhase,
      sceneStability,
      tempoEstavelMs: tempoDesdeDeteccaoMs,
      resultScreenInfo,
      candidateResult: {
        candidato: this.candidateResult,
        confirmacoesConsecutivas: this.confirmacoesConsecutivas,
        confirmacoesNecessarias: this.minimumConfirmations,
        primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
        ultimaDeteccaoTimestamp: timestamp,
        lastConfidence: confiancaRaw,
        tempoEstavelMs: tempoDesdeDeteccaoMs,
      },
      ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
    };
  }
}
