import { WheelItem } from '../types';
import { ITEM_KEYS } from '../data/items';
import {
  CandidateScore,
  LOW_ITEMS,
  HIGH_ITEMS,
  UserStrategy,
  WHEEL_ITEM_METAS,
  WheelRecommendation,
  PatternSequenceAnalysis,
  HighDensityAnalysis,
  LowCycleAnalysis,
  RepetitionAfterHighAnalysis,
} from '../types/wheelAnalysis';
import { TransitionAnalysis } from './wheelTransitionService';
import { ProbabilityAnalysis } from './wheelProbabilityService';

export interface ScoringInputs {
  history: WheelItem[];
  patternAnalysis: PatternSequenceAnalysis;
  highDensity: HighDensityAnalysis;
  lowCycles: LowCycleAnalysis;
  repetitionAfterHigh: RepetitionAfterHighAnalysis;
  transitions: TransitionAnalysis;
  probabilities: ProbabilityAnalysis;
  strategy: UserStrategy;
}

/**
 * Calculates scores (0-100), confidence levels, and detailed audit explanations
 * for all 8 wheel objects based on real historical data.
 */
export function calculateWheelRecommendations(inputs: ScoringInputs): WheelRecommendation {
  const {
    history,
    highDensity,
    lowCycles,
    repetitionAfterHigh,
    transitions,
    probabilities,
    strategy,
  } = inputs;

  const sampleSize = history.length;

  if (sampleSize < 5) {
    const defaultCandidates: CandidateScore[] = ITEM_KEYS.map((item) => {
      const meta = WHEEL_ITEM_METAS[item];
      return {
        item,
        category: meta.category,
        score: 0,
        confidence: 'INSUFFICIENT_DATA',
        reasons: ['Dados insuficientes (mínimo de 5 rodadas registradas necessário)'],
        estimatedProbability: 0.125,
        multiplier: meta.multiplier,
        expectedValue: 0.125 * meta.multiplier,
      };
    });

    return {
      strategy,
      topLows: defaultCandidates.filter((c) => c.category === 'BAIXO').slice(0, strategy.lowCount),
      topHighs: defaultCandidates.filter((c) => c.category === 'ALTO').slice(0, strategy.highCount),
      allCandidates: defaultCandidates,
      globalConfidence: 'INSUFFICIENT_DATA',
      sampleSize,
    };
  }

  const lastItem = history[history.length - 1];
  const lastItemIsHigh = WHEEL_ITEM_METAS[lastItem]?.category === 'ALTO';

  // Global confidence calculation
  let globalConfidence: 'Alta' | 'Média' | 'Baixa' | 'INSUFFICIENT_DATA' = 'Baixa';
  if (sampleSize >= 30) {
    globalConfidence = 'Alta';
  } else if (sampleSize >= 15) {
    globalConfidence = 'Média';
  }

  // Calculate scores for each of the 8 items
  const candidates: CandidateScore[] = ITEM_KEYS.map((item) => {
    const meta = WHEEL_ITEM_METAS[item];
    const isLow = meta.category === 'BAIXO';
    const reasons: string[] = [];
    let rawScore = 0;

    // 1. Transition Score (Weight 30 points)
    const itemTransition = transitions.transitions.find((t) => t.targetItem === item);
    const transPercent = itemTransition ? itemTransition.percentage : 0;
    const transScore = (transPercent / 100) * 30;
    rawScore += transScore;
    if (transPercent > 0) {
      reasons.push(`Apareceu em ${transPercent.toFixed(1)}% das transições após ${lastItem}`);
    }

    // 2. Frequency & Delay Score (Weight 25 points)
    const estProb = probabilities.estimatedProbabilities[item] || 0.125;
    const freqScore = estProb * 8 * 25; // 0.125 = 25 points baseline
    rawScore += Math.min(25, freqScore);

    const w20Freq = probabilities.windows[20]?.frequencies[item] ?? 0;
    reasons.push(`Frequência estimada de ${(estProb * 100).toFixed(1)}% (últimas 20 rodadas: ${(w20Freq * 100).toFixed(1)}%)`);

    const delay = probabilities.delays[item] ?? 0;
    if (delay > 5) {
      rawScore += Math.min(10, delay * 0.8); // bonus for delayed items
      reasons.push(`Atrasado há ${delay} rodadas no histórico`);
    }

    // 3. Low Cycle Logic (for LOW items, Weight 25 points)
    if (isLow) {
      const isMissingInCycle = lowCycles.missingLowItems.includes(item);
      if (isMissingInCycle) {
        rawScore += 25;
        reasons.push(`Atualmente ausente no ciclo ativo dos 4 baixos (Ciclos concluídos: ${lowCycles.cycleCompletionRate}%)`);
      } else {
        rawScore += 5;
        reasons.push(`Já saiu no ciclo ativo dos 4 baixos`);
      }

      // Repetition after High logic
      if (lastItemIsHigh && repetitionAfterHigh.totalHighsAnalyzed > 0) {
        const prevLowItem = history.slice(-2)[0];
        if (item === prevLowItem && repetitionAfterHigh.repeatLastLowRate > 40) {
          rawScore += 15;
          reasons.push(`Após resultado ALTO, a taxa de repetição do último baixo é de ${repetitionAfterHigh.repeatLastLowRate}%`);
        } else if (item !== prevLowItem && repetitionAfterHigh.continueCycleRate > 50) {
          rawScore += 10;
          reasons.push(`Após resultado ALTO, a taxa de continuação do ciclo é de ${repetitionAfterHigh.continueCycleRate}%`);
        }
      }
    }

    // 4. High Density Logic (for HIGH items, Weight 25 points)
    if (!isLow) {
      if (highDensity.lastHighPositionInTen !== null && highDensity.lastHighPositionInTen >= 8) {
        rawScore += 20;
        reasons.push(`Último ALTO atingiu a posição ${highDensity.lastHighPositionInTen} na janela 10 (Reocorrência histórica: ${highDensity.reoccurrenceWhenReachingTenRate}%)`);
      } else if (highDensity.lastHighDistance >= 5) {
        rawScore += 15;
        reasons.push(`Distância de ${highDensity.lastHighDistance} rodadas desde o último ALTO`);
      }
    }

    // Normalize score to 0..100
    const finalScore = Math.min(99, Math.max(5, Math.round(rawScore)));

    // Item-specific confidence level
    let confidence = globalConfidence;
    if (sampleSize < 10) {
      confidence = 'Baixa';
    }

    const expectedValue = Number((estProb * meta.multiplier).toFixed(2));

    return {
      item,
      category: meta.category,
      score: finalScore,
      confidence,
      reasons,
      estimatedProbability: estProb,
      multiplier: meta.multiplier,
      expectedValue,
    };
  });

  // Sort candidates by score descending
  const lowCandidates = candidates
    .filter((c) => c.category === 'BAIXO')
    .sort((a, b) => b.score - a.score);

  const highCandidates = candidates
    .filter((c) => c.category === 'ALTO')
    .sort((a, b) => b.score - a.score);

  const topLows = lowCandidates.slice(0, strategy.lowCount);
  const topHighs = highCandidates.slice(0, strategy.highCount);

  return {
    strategy,
    topLows,
    topHighs,
    allCandidates: candidates.sort((a, b) => b.score - a.score),
    globalConfidence,
    sampleSize,
  };
}
