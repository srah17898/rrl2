import { logger } from '../utils/logger';
import { WheelObjectVisualMatcher } from './WheelObjectVisualMatcher';
import { LocalWheelRecognizer } from './LocalWheelRecognizer';
import { isAllowedWheelObject, WheelObjectName } from '../config/wheelObjectReferences';

export interface AnalyzeCropResult {
  success: boolean;
  model: string;
  httpStatus: number;
  latencyMs: number;
  rawResponse?: string;
  parsed?: {
    objetoDetectado: string;
    confianca: number;
  };
  geminiRaw?: string;
  geminiParsed?: {
    objetoDetectado: string;
    confianca: number;
  };
  visualMatch?: {
    objeto: string;
    confianca: number;
  };
  consensus?: 'MATCH' | 'GEMINI_DOMINATES' | 'DIVERGENCIA' | 'NO_OBJECT';
  finalObject?: string;
  finalConfidence?: number;
  errorType?: string;
  errorMessage?: string;
  scoresPorObjeto?: Record<string, number>;
  accepted?: boolean;
  reason?: string;
}

/**
 * Executa a análise isolada 100% LOCAL de um crop de imagem via LocalWheelRecognizer.
 * Não utiliza API Gemini, funcionando offline e sem requisições de rede.
 */
export async function analyzeCropIsolated(
  base64Input: string,
  providedMimeType: string = 'image/jpeg'
): Promise<AnalyzeCropResult> {
  const tStart = Date.now();
  const defaultModel = 'LocalWheelRecognizer (100% Local)';

  if (!base64Input || typeof base64Input !== 'string') {
    const latencyMs = Date.now() - tStart;
    return {
      success: false,
      model: defaultModel,
      httpStatus: 400,
      errorType: 'INVALID_INPUT',
      errorMessage: 'Payload base64 de imagem ausente ou inválido',
      latencyMs,
    };
  }

  const cleanBase64 = base64Input.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
  if (cleanBase64.length < 20) {
    const latencyMs = Date.now() - tStart;
    return {
      success: false,
      model: defaultModel,
      httpStatus: 400,
      errorType: 'INVALID_INPUT',
      errorMessage: 'Payload Base64 muito curto ou corrompido',
      latencyMs,
    };
  }

  try {
    const localDiag = await LocalWheelRecognizer.diagnosticarCrop(cleanBase64);
    const visualMatchRes = await WheelObjectVisualMatcher.findBestVisualMatchAsync(cleanBase64);
    const latencyMs = Date.now() - tStart;

    const winnerCandidate = localDiag.winner;
    const isValid = localDiag.accepted && winnerCandidate !== 'nenhum' && isAllowedWheelObject(winnerCandidate);
    const winnerObj = isValid ? winnerCandidate : 'nenhum';
    const conf = Math.round(localDiag.confidence * 100);

    const visualCandidate = visualMatchRes.simboloCandidatoVisual;
    const visualObj = (visualCandidate && visualCandidate !== 'nenhum' && isAllowedWheelObject(visualCandidate)) ? visualCandidate : 'nenhum';
    const visualConf = Math.round((visualMatchRes.scoreVisual || 0) * 100);

    logger.info(
      `[ANALYZE_CROP_LOCAL] winner=${winnerObj} score=${conf}% accepted=${localDiag.accepted} reason=${localDiag.reason} latency=${latencyMs}ms`
    );

    return {
      success: true,
      model: defaultModel,
      httpStatus: 200,
      latencyMs,
      rawResponse: JSON.stringify({
        winner: localDiag.winner,
        score: localDiag.confidence,
        gap: localDiag.gap,
        accepted: localDiag.accepted,
        reason: localDiag.reason,
      }),
      geminiRaw: 'GEMINI_DISABLED_LOCAL_ONLY',
      parsed: {
        objetoDetectado: winnerObj,
        confianca: conf,
      },
      geminiParsed: {
        objetoDetectado: winnerObj,
        confianca: conf,
      },
      visualMatch: {
        objeto: visualObj,
        confianca: visualConf,
      },
      consensus: localDiag.accepted ? 'MATCH' : 'NO_OBJECT',
      finalObject: winnerObj,
      finalConfidence: conf,
      scoresPorObjeto: localDiag.scoresPorObjeto,
      accepted: localDiag.accepted,
      reason: localDiag.reason,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - tStart;
    logger.error(`[ANALYZE_CROP_LOCAL_ERROR] Erro ao analisar crop localmente: ${err?.message}`);
    return {
      success: false,
      model: defaultModel,
      httpStatus: 500,
      errorType: 'LOCAL_ANALYSIS_ERROR',
      errorMessage: err?.message || 'Falha na análise visual local.',
      latencyMs,
    };
  }
}
