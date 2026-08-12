import { WheelItem } from '../types';
import { ITEM_KEYS } from '../data/items';
import { WHEEL_ITEM_METAS, WindowFrequency } from '../types/wheelAnalysis';

export interface ProbabilityAnalysis {
  windows: Record<number, WindowFrequency>;
  estimatedProbabilities: Record<WheelItem, number>; // 0..1
  delays: Record<WheelItem, number>; // rounds since last occurrence
}

/**
 * Calculates window frequencies and estimated probabilities for all 8 items.
 */
export function analyzeProbabilities(history: WheelItem[]): ProbabilityAnalysis {
  const windowSizes = [5, 10, 20, 30, 50];
  const windows: Record<number, WindowFrequency> = {};

  windowSizes.forEach((size) => {
    const slice = history.slice(-size);
    const counts: Record<WheelItem, number> = {
      sorvete: 0, boia: 0, balao: 0, soco: 0,
      tedy: 0, princesa: 0, camera: 0, coroa: 0,
    };

    slice.forEach((item) => {
      if (counts[item] !== undefined) {
        counts[item]++;
      }
    });

    const total = slice.length || 1;
    const frequencies: Record<WheelItem, number> = {
      sorvete: counts.sorvete / total,
      boia: counts.boia / total,
      balao: counts.balao / total,
      soco: counts.soco / total,
      tedy: counts.tedy / total,
      princesa: counts.princesa / total,
      camera: counts.camera / total,
      coroa: counts.coroa / total,
    };

    windows[size] = {
      windowSize: size,
      counts,
      frequencies,
    };
  });

  // Calculate delay (rounds since last appearance) for each item
  const delays: Record<WheelItem, number> = {
    sorvete: history.length, boia: history.length, balao: history.length, soco: history.length,
    tedy: history.length, princesa: history.length, camera: history.length, coroa: history.length,
  };

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    const dist = history.length - 1 - i;
    if (delays[item] === history.length) {
      delays[item] = dist;
    }
  }

  // Calculate weighted estimated probability
  // Combines overall frequency (weight 40%), window 20 (weight 35%), window 10 (weight 25%)
  const totalRounds = history.length || 1;
  const overallCounts: Record<WheelItem, number> = {
    sorvete: 0, boia: 0, balao: 0, soco: 0,
    tedy: 0, princesa: 0, camera: 0, coroa: 0,
  };

  history.forEach((item) => {
    if (overallCounts[item] !== undefined) {
      overallCounts[item]++;
    }
  });

  const estimatedProbabilities: Record<WheelItem, number> = {
    sorvete: 0.125, boia: 0.125, balao: 0.125, soco: 0.125,
    tedy: 0.125, princesa: 0.125, camera: 0.125, coroa: 0.125,
  };

  if (history.length > 0) {
    ITEM_KEYS.forEach((item) => {
      const overallFreq = overallCounts[item] / totalRounds;
      const w20Freq = windows[20]?.frequencies[item] ?? overallFreq;
      const w10Freq = windows[10]?.frequencies[item] ?? overallFreq;

      const prob = overallFreq * 0.40 + w20Freq * 0.35 + w10Freq * 0.25;
      estimatedProbabilities[item] = Number(prob.toFixed(4));
    });
  }

  return {
    windows,
    estimatedProbabilities,
    delays,
  };
}

/**
 * Calculates Potential Return for a base bet amount (default R$ 10).
 */
export function calculatePotentialReturn(item: WheelItem, betAmount: number = 10): number {
  const meta = WHEEL_ITEM_METAS[item];
  return meta ? betAmount * meta.multiplier : 0;
}
