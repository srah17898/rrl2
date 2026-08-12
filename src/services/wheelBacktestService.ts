import { WheelItem } from '../types';
import { UserStrategy, BacktestResult, BacktestRoundResult } from '../types/wheelAnalysis';
import { analyzeCategorySequences, analyzeHighDensity } from './wheelPatternService';
import { analyzeLowCycles, analyzeRepetitionAfterHigh } from './wheelSequenceService';
import { analyzeTransitions } from './wheelTransitionService';
import { analyzeProbabilities } from './wheelProbabilityService';
import { calculateWheelRecommendations } from './wheelRecommendationService';

/**
 * Executes a historical backtest simulation.
 * STRICT RULE: For predicting round k, ONLY rounds 0..k-1 are used.
 * NO future data leakage is allowed.
 */
export function runHistoricalBacktest(
  history: WheelItem[],
  strategy: UserStrategy = { lowCount: 3, highCount: 1 },
  minRoundsRequired: number = 10
): BacktestResult {
  if (!history || history.length < minRoundsRequired + 1) {
    return {
      totalSimulatedRounds: 0,
      hits: 0,
      hitRatePercent: 0,
      details: [],
    };
  }

  const details: BacktestRoundResult[] = [];
  let hits = 0;

  for (let k = minRoundsRequired; k < history.length; k++) {
    // 1. Slice history STRICTLY up to k - 1
    const pastHistory = history.slice(0, k);
    const actualItem = history[k];

    // 2. Compute analytics for past history
    const patternAnalysis = analyzeCategorySequences(pastHistory);
    const highDensity = analyzeHighDensity(pastHistory);
    const lowCycles = analyzeLowCycles(pastHistory);
    const repetitionAfterHigh = analyzeRepetitionAfterHigh(pastHistory);
    const transitions = analyzeTransitions(pastHistory);
    const probabilities = analyzeProbabilities(pastHistory);

    // 3. Generate recommendation
    const recommendation = calculateWheelRecommendations({
      history: pastHistory,
      patternAnalysis,
      highDensity,
      lowCycles,
      repetitionAfterHigh,
      transitions,
      probabilities,
      strategy,
    });

    const recommendedItems = [
      ...recommendation.topLows.map((c) => c.item),
      ...recommendation.topHighs.map((c) => c.item),
    ];

    const hit = recommendedItems.includes(actualItem);
    if (hit) hits++;

    details.push({
      roundIndex: k + 1,
      actualItem,
      recommendedItems,
      hit,
    });
  }

  const totalSimulatedRounds = details.length;
  const hitRatePercent =
    totalSimulatedRounds > 0
      ? Number(((hits / totalSimulatedRounds) * 100).toFixed(1))
      : 0;

  return {
    totalSimulatedRounds,
    hits,
    hitRatePercent,
    details,
  };
}
