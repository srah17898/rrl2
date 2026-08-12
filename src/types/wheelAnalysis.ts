import { WheelItem } from '../types';

export type ItemCategory = 'BAIXO' | 'ALTO';

export interface WheelItemMeta {
  id: WheelItem;
  label: string;
  category: ItemCategory;
  categoryCode: 1 | 2; // 1 = ALTO, 2 = BAIXO
  itemCode: number;    // 1..8
  multiplier: number;  // 5, 10, 15, 25, 45
}

export const WHEEL_ITEM_METAS: Record<WheelItem, WheelItemMeta> = {
  tedy: { id: 'tedy', label: 'Tedy', category: 'ALTO', categoryCode: 1, itemCode: 1, multiplier: 10 },
  princesa: { id: 'princesa', label: 'Princesa', category: 'ALTO', categoryCode: 1, itemCode: 2, multiplier: 15 },
  sorvete: { id: 'sorvete', label: 'Sorvete', category: 'BAIXO', categoryCode: 2, itemCode: 3, multiplier: 5 },
  balao: { id: 'balao', label: 'Balão', category: 'BAIXO', categoryCode: 2, itemCode: 4, multiplier: 5 },
  boia: { id: 'boia', label: 'Boia', category: 'BAIXO', categoryCode: 2, itemCode: 5, multiplier: 5 },
  soco: { id: 'soco', label: 'Soco', category: 'BAIXO', categoryCode: 2, itemCode: 6, multiplier: 5 },
  camera: { id: 'camera', label: 'Câmera', category: 'ALTO', categoryCode: 1, itemCode: 7, multiplier: 25 },
  coroa: { id: 'coroa', label: 'Coroa', category: 'ALTO', categoryCode: 1, itemCode: 8, multiplier: 45 },
};

export const LOW_ITEMS: WheelItem[] = ['sorvete', 'balao', 'boia', 'soco'];
export const HIGH_ITEMS: WheelItem[] = ['tedy', 'princesa', 'camera', 'coroa'];

export interface UserStrategy {
  lowCount: number;  // 0 to 4
  highCount: number; // 0 to 4
}

export interface LowCycleAnalysis {
  currentCycleItems: WheelItem[];
  missingLowItems: WheelItem[];
  cycleCompletionRate: number; // percentage 0..100
  totalCyclesAnalyzed: number;
}

export interface RepetitionAfterHighAnalysis {
  totalHighsAnalyzed: number;
  repeatLastLowCount: number;
  repeatLastLowRate: number; // percentage 0..100
  continueCycleCount: number;
  continueCycleRate: number; // percentage 0..100
}

export interface HighDensityAnalysis {
  lastHighDistance: number;
  highsInLastTen: number;
  lastHighPositionInTen: number | null; // 1 to 10 (1 = most recent)
  reoccurrenceWhenReachingTenRate: number; // percentage 0..100
  sampleCount: number;
}

export interface PatternSequenceItem {
  sequenceKey: string;
  totalOccurrences: number;
  successes: number;
  ratePercent: number;
}

export interface PatternSequenceAnalysis {
  sequences: PatternSequenceItem[];
  doublesCount: number;
  triplesCount: number;
  doublePatternRatePercent: number;
  repeatPatternRatePercent: number;
}

export interface WindowFrequency {
  windowSize: number;
  counts: Record<WheelItem, number>;
  frequencies: Record<WheelItem, number>; // 0..1
}

export interface CandidateScore {
  item: WheelItem;
  category: ItemCategory;
  score: number; // 0..100
  confidence: 'Alta' | 'Média' | 'Baixa' | 'INSUFFICIENT_DATA';
  reasons: string[];
  estimatedProbability: number; // 0..1
  multiplier: number;
  expectedValue: number;
}

export interface WheelRecommendation {
  strategy: UserStrategy;
  topLows: CandidateScore[];
  topHighs: CandidateScore[];
  allCandidates: CandidateScore[];
  globalConfidence: 'Alta' | 'Média' | 'Baixa' | 'INSUFFICIENT_DATA';
  sampleSize: number;
}

export interface BacktestRoundResult {
  roundIndex: number;
  actualItem: WheelItem;
  recommendedItems: WheelItem[];
  hit: boolean;
}

export interface BacktestResult {
  totalSimulatedRounds: number;
  hits: number;
  hitRatePercent: number;
  details: BacktestRoundResult[];
}
