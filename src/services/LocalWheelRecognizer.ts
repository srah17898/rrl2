import { WheelObjectName, ALLOWED_WHEEL_OBJECTS } from '../config/wheelObjectReferences';
import { WheelObjectVisualMatcher, WheelObjectVisualMatchResult } from './WheelObjectVisualMatcher';

export interface LocalRecognizerConfig {
  LOCAL_RECOGNITION_ENABLED: boolean;
  GEMINI_FALLBACK_ENABLED: boolean;
  LOCAL_ONLY_MODE: boolean;
  LOCAL_CONFIDENCE_THRESHOLD: number; // 0.0 a 1.0 (ex: 0.85)
  LOCAL_RECOGNITION_DEBUG: boolean;
}

export interface LocalRecognitionResult {
  objetoDetectado: WheelObjectName | 'nenhum';
  confianca: number; // 0.0 a 1.0
  metodo: 'local';
  candidato1: string;
  score1: number; // 0.0 a 1.0
  candidato2: string;
  score2: number; // 0.0 a 1.0
  gap: number; // 0.0 a 1.0
  scoresPorObjeto: Record<WheelObjectName, number>;
  reason: string;
  accepted: boolean;
  cropDimensionReceived?: string;
  cropTypeUsed?: string;
}

export class LocalWheelRecognizer {
  private static config: LocalRecognizerConfig = {
    LOCAL_RECOGNITION_ENABLED: true,
    GEMINI_FALLBACK_ENABLED: false,
    LOCAL_ONLY_MODE: true,
    LOCAL_CONFIDENCE_THRESHOLD: 0.85, // 85%
    LOCAL_RECOGNITION_DEBUG: true,
  };

  /**
   * Margem/Gap mínimo entre o 1º e o 2º colocado para aceitar o resultado (3.0%).
   */
  public static readonly MIN_GAP_THRESHOLD = 0.030;

  /**
   * Retorna a configuração atual do reconhecedor local.
   */
  public static getConfig(): LocalRecognizerConfig {
    return { ...this.config };
  }

  /**
   * Atualiza as configurações do reconhecedor local em tempo de execução.
   */
  public static updateConfig(newConfig: Partial<LocalRecognizerConfig>): LocalRecognizerConfig {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    return { ...this.config };
  }

  /**
   * Prepara o cache de referências das 8 imagens oficiais.
   */
  public static async warmup(): Promise<void> {
    await WheelObjectVisualMatcher.warmup();
  }

  /**
   * Método principal de reconhecimento local: analisa o crop real do símbolo e compara contra as 8 referências.
   * REGRA OBRIGATÓRIA: Se a tela de resultado NÃO estiver confirmada (isResultScreenConfirmed = false),
   * o matcher NÃO deve ser executado de forma alguma, retornando 'nenhum' imediatamente.
   */
  public static async recognizeCrop(
    cropBase64OrDataUrl?: string,
    isResultScreenConfirmed: boolean = true
  ): Promise<LocalRecognitionResult> {
    const scoresPorObjeto: Record<WheelObjectName, number> = {
      sorvete: 0,
      boia: 0,
      balao: 0,
      soco: 0,
      tedy: 0,
      princesa: 0,
      camera: 0,
      coroa: 0,
    };

    if (!isResultScreenConfirmed) {
      console.log('[FALSE_RESULT_BLOCKED] reason=RESULT_SCREEN_NOT_CONFIRMED matcherSkipped=true');
      return {
        objetoDetectado: 'nenhum',
        confianca: 0,
        metodo: 'local',
        candidato1: 'nenhum',
        score1: 0,
        candidato2: 'nenhum',
        score2: 0,
        gap: 0,
        scoresPorObjeto,
        reason: 'RESULT_SCREEN_NOT_CONFIRMED',
        accepted: false,
      };
    }

    if (!cropBase64OrDataUrl || cropBase64OrDataUrl.trim().length < 10) {
      return {
        objetoDetectado: 'nenhum',
        confianca: 0,
        metodo: 'local',
        candidato1: 'nenhum',
        score1: 0,
        candidato2: 'nenhum',
        score2: 0,
        gap: 0,
        scoresPorObjeto,
        reason: 'INVALID_CROP_EMPTY',
        accepted: false,
      };
    }

    try {
      const visualMatch: WheelObjectVisualMatchResult =
        await WheelObjectVisualMatcher.findBestVisualMatchAsync(cropBase64OrDataUrl);

      if (visualMatch.candidatos && visualMatch.candidatos.length > 0) {
        visualMatch.candidatos.forEach((cand) => {
          if (cand.objeto in scoresPorObjeto) {
            scoresPorObjeto[cand.objeto] = Math.round((cand.score / 100) * 100) / 100;
          }
        });
      }

      const topCand1 = visualMatch.candidatos?.[0];
      const topCand2 = visualMatch.candidatos?.[1];

      const cand1Obj = topCand1?.objeto || 'nenhum';
      const rawScore1 = topCand1?.score || 0; // 0 a 100
      const score1 = Math.round((rawScore1 / 100) * 100) / 100; // 0.0 a 1.0

      const cand2Obj = topCand2?.objeto || 'nenhum';
      const rawScore2 = topCand2?.score || 0;
      const score2 = Math.round((rawScore2 / 100) * 100) / 100;

      const gap = Math.round((Math.max(0, score1 - score2)) * 100) / 100;

      const bestObj = visualMatch.simboloCandidatoVisual; // 'nenhum' se descartado
      const isAccepted =
        bestObj !== 'nenhum' &&
        score1 >= this.config.LOCAL_CONFIDENCE_THRESHOLD &&
        gap >= LocalWheelRecognizer.MIN_GAP_THRESHOLD;

      let reason = 'MATCH_ACCEPTED';
      if (!isAccepted) {
        if (score1 < this.config.LOCAL_CONFIDENCE_THRESHOLD) {
          reason = `REJECT_LOW_CONFIDENCE (${Math.round(score1 * 100)}% < ${Math.round(this.config.LOCAL_CONFIDENCE_THRESHOLD * 100)}%)`;
        } else if (gap < LocalWheelRecognizer.MIN_GAP_THRESHOLD) {
          reason = `REJECT_INSUFFICIENT_GAP (${Math.round(gap * 100)}% < ${Math.round(LocalWheelRecognizer.MIN_GAP_THRESHOLD * 100)}%)`;
        } else {
          reason = visualMatch.motivoDescarteVisual || 'REJECT_NOT_CONFIRMED';
        }
      }

      const objetoDetectado = isAccepted ? bestObj : 'nenhum';
      const confianca = isAccepted ? score1 : 0;

      // TELEMETRIA OBRIGATÓRIA — ETAPA 1, ETAPA 2, ETAPA 3
      console.log(
        `[CROP_REAL]\n` +
        `cropSize = ${visualMatch.cropDimensionReceived || '153x153'}\n` +
        `cropType = ${visualMatch.cropTypeUsed || 'CROP_153X153_REAL_WITH_INNER_ROI_MASK'}\n` +
        `cropSource = SYMBOL_CROP_153X153`
      );

      console.log(
        `[MATCHER_RESULT]\n` +
        `winner = ${cand1Obj}\n` +
        `winnerScore = ${Math.round(score1 * 100)}%\n` +
        `second = ${cand2Obj}\n` +
        `secondScore = ${Math.round(score2 * 100)}%\n` +
        `gap = ${Math.round(gap * 100)}%\n` +
        `accepted = ${isAccepted}`
      );

      const recognizerStatus = isAccepted ? 'ACCEPT' : (cand1Obj === 'nenhum' ? 'REJECT' : 'AMBIGUOUS');
      console.log(
        `[RECOGNIZER_OUTPUT]\n` +
        `object = ${objetoDetectado}\n` +
        `confidence = ${Math.round(confianca * 100)}\n` +
        `gap = ${Math.round(gap * 100)}\n` +
        `status = ${recognizerStatus}`
      );

      if (!isAccepted) {
        console.log(`[RECOGNIZER_REJECT_REASON] reason = ${reason}`);
      }

      if (this.config.LOCAL_RECOGNITION_DEBUG) {
        console.log(
          `[LOCAL_RECOGNIZER_DEBUG]\n` +
          `cropSize=${visualMatch.cropDimensionReceived || '153x153'}\n` +
          `cropType=${visualMatch.cropTypeUsed || 'REAL_153X153_WITH_INNER_ROI_MASK'}\n` +
          `winner=${cand1Obj} (${Math.round(score1 * 100)}%)\n` +
          `second=${cand2Obj} (${Math.round(score2 * 100)}%)\n` +
          `gap=${Math.round(gap * 100)}%\n` +
          `accepted=${isAccepted}\n` +
          `reason=${reason}\n` +
          `SCORES_INDIVIDUAIS_8_OBJETOS:\n` +
          ALLOWED_WHEEL_OBJECTS.map((obj) => `  ${obj.padEnd(10)}: ${Math.round((scoresPorObjeto[obj] || 0) * 100)}%`).join('\n')
        );
      }

      return {
        objetoDetectado,
        confianca,
        metodo: 'local',
        candidato1: cand1Obj,
        score1,
        candidato2: cand2Obj,
        score2,
        gap,
        scoresPorObjeto,
        reason,
        accepted: isAccepted,
        cropDimensionReceived: visualMatch.cropDimensionReceived || '153x153',
        cropTypeUsed: visualMatch.cropTypeUsed || 'CROP_153X153_REAL_WITH_INNER_ROI_MASK',
      };
    } catch (error) {
      console.error('[LocalWheelRecognizer] Erro no reconhecimento local:', error);
      return {
        objetoDetectado: 'nenhum',
        confianca: 0,
        metodo: 'local',
        candidato1: 'nenhum',
        score1: 0,
        candidato2: 'nenhum',
        score2: 0,
        gap: 0,
        scoresPorObjeto,
        reason: error instanceof Error ? error.message : 'UNHANDLED_RECOGNIZER_ERROR',
        accepted: false,
      };
    }
  }

  /**
   * Função de diagnóstico que aceita o último crop real capturado da roda real
   * e executa o reconhecimento local isoladamente sem iniciar uma nova rodada.
   */
  public static async analyzeRealCrop(cropBase64OrDataUrl?: string) {
    return this.diagnosticarCrop(cropBase64OrDataUrl);
  }

  /**
   * Função de diagnóstico que compara um crop com as 8 referências e gera um relatório legível.
   */
  public static async diagnosticarCrop(cropBase64OrDataUrl?: string) {
    const result = await this.recognizeCrop(cropBase64OrDataUrl);

    console.log('=== REFERÊNCIAS TESTADAS (DIAGNÓSTICO LOCAL) ===');
    ALLOWED_WHEEL_OBJECTS.forEach((obj) => {
      const scorePct = Math.round((result.scoresPorObjeto[obj] || 0) * 100);
      console.log(`${obj.padEnd(10)}: ${scorePct}%`);
    });
    console.log('------------------------------------------------');
    console.log(`WINNER:     ${result.candidato1}`);
    console.log(`CONFIDENCE: ${Math.round(result.score1 * 100)}%`);
    console.log(`GAP:        ${Math.round(result.gap * 100)}%`);
    console.log(`ACCEPTED:   ${result.accepted}`);
    console.log(`REASON:     ${result.reason}`);
    console.log('================================================');

    return {
      winner: result.candidato1,
      confidence: result.score1,
      gap: result.gap,
      accepted: result.accepted,
      reason: result.reason,
      method: 'LOCAL',
      scoresPorObjeto: result.scoresPorObjeto,
      cropDimensionReceived: result.cropDimensionReceived || '153x153',
      cropTypeUsed: result.cropTypeUsed || 'CROP_153X153_REAL_WITH_INNER_ROI_MASK',
      result,
    };

  }
}

function isAllowedWheelObject(name: string): name is WheelObjectName {
  return ALLOWED_WHEEL_OBJECTS.includes(name as WheelObjectName);
}
