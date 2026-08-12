import { WheelItem } from '../types';
import {
  UserStrategy,
  LowCycleAnalysis,
  RepetitionAfterHighAnalysis,
  HighDensityAnalysis,
  PatternSequenceAnalysis,
  WheelRecommendation,
  BacktestResult,
} from '../types/wheelAnalysis';
import {
  compressConsecutiveResults,
  analyzeCategorySequences,
  analyzeHighDensity,
} from './wheelPatternService';
import {
  filterLowHistory,
  analyzeLowCycles,
  analyzeRepetitionAfterHigh,
} from './wheelSequenceService';
import { analyzeTransitions, TransitionAnalysis } from './wheelTransitionService';
import { analyzeProbabilities, ProbabilityAnalysis } from './wheelProbabilityService';
import { calculateWheelRecommendations } from './wheelRecommendationService';
import { runHistoricalBacktest } from './wheelBacktestService';
import { sanitizeStrategy } from './wheelStrategyService';

export interface WheelAnalysisReport {
  timestamp: number;
  sampleSize: number;
  originalHistory: WheelItem[];
  compressedHistory: WheelItem[];
  filteredLowHistory: WheelItem[];
  strategy: UserStrategy;
  patternAnalysis: PatternSequenceAnalysis;
  highDensity: HighDensityAnalysis;
  lowCycles: LowCycleAnalysis;
  repetitionAfterHigh: RepetitionAfterHighAnalysis;
  transitions: TransitionAnalysis;
  probabilities: ProbabilityAnalysis;
  recommendation: WheelRecommendation;
  backtest: BacktestResult;
}

/**
 * Main Orchestrator for the Ferris Wheel Statistical & Pattern Analysis Engine.
 * Integrates all 10+ analytical layers and produces the complete audit-friendly report.
 */
export function runWheelFullAnalysis(
  history: WheelItem[],
  strategy: UserStrategy = { lowCount: 3, highCount: 1 }
): WheelAnalysisReport {
  const cleanStrategy = sanitizeStrategy(strategy);
  const rawHistory = Array.isArray(history) ? history : [];

  // Layer 1 & 2: Original & Compressed & Filtered Low History
  const compressedHistory = compressConsecutiveResults(rawHistory);
  const filteredLowHistory = filterLowHistory(rawHistory);

  // Layer 3: Category sequences & pattern analysis (1,2,1 / 1,2,2,1 / 1,2,2,2,1)
  const patternAnalysis = analyzeCategorySequences(rawHistory);

  // Layer 4: High density & Window 10 analysis
  const highDensity = analyzeHighDensity(rawHistory);

  // Layer 5: Low cycles & 4-low permutations
  const lowCycles = analyzeLowCycles(rawHistory);

  // Layer 6: Repetition after High item
  const repetitionAfterHigh = analyzeRepetitionAfterHigh(rawHistory);

  // Layer 7: Transitions & follower matrix
  const transitions = analyzeTransitions(rawHistory);

  // Layer 8: Window frequencies, delays & estimated probabilities
  const probabilities = analyzeProbabilities(rawHistory);

  // Layer 9: Candidate Scoring, Confidence & Audit Explanations
  const recommendation = calculateWheelRecommendations({
    history: rawHistory,
    patternAnalysis,
    highDensity,
    lowCycles,
    repetitionAfterHigh,
    transitions,
    probabilities,
    strategy: cleanStrategy,
  });

  // Layer 10: Backtesting Simulation
  const backtest = runHistoricalBacktest(rawHistory, cleanStrategy);

  return {
    timestamp: Date.now(),
    sampleSize: rawHistory.length,
    originalHistory: rawHistory,
    compressedHistory,
    filteredLowHistory,
    strategy: cleanStrategy,
    patternAnalysis,
    highDensity,
    lowCycles,
    repetitionAfterHigh,
    transitions,
    probabilities,
    recommendation,
    backtest,
  };
}
