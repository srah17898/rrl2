import { WheelItem } from '../types';
import {
  WHEEL_ITEM_METAS,
  PatternSequenceAnalysis,
  PatternSequenceItem,
  HighDensityAnalysis,
} from '../types/wheelAnalysis';

/**
 * Compresses consecutive identical results into a single instance.
 * Example: [BALÃO, BOIA, SOCO, SOCO, TEDY, PRINCESA, SOCO, SORVETE]
 *       -> [BALÃO, BOIA, SOCO, TEDY, PRINCESA, SOCO, SORVETE]
 */
export function compressConsecutiveResults(history: WheelItem[]): WheelItem[] {
  if (!history || history.length === 0) return [];
  const compressed: WheelItem[] = [];
  for (let i = 0; i < history.length; i++) {
    if (i === 0 || history[i] !== history[i - 1]) {
      compressed.push(history[i]);
    }
  }
  return compressed;
}

/**
 * Analyzes High/Low category sequences (1 = ALTO, 2 = BAIXO).
 * Examines patterns like:
 * - 1,2,1 (High, Low, High)
 * - 1,2,2,1 (High, Low, Low, High)
 * - 1,2,2,2,1 (High, Low, Low, Low, High)
 */
export function analyzeCategorySequences(history: WheelItem[]): PatternSequenceAnalysis {
  if (!history || history.length < 3) {
    return {
      sequences: [],
      doublesCount: 0,
      triplesCount: 0,
      doublePatternRatePercent: 0,
      repeatPatternRatePercent: 0,
    };
  }

  // Map to category codes: 1 = ALTO, 2 = BAIXO
  const catSeq = history.map((item) => WHEEL_ITEM_METAS[item]?.categoryCode || 2);

  // Pattern keys to track: "1,2,1", "1,2,2,1", "1,2,2,2,1"
  const targetPatterns = ['1,2,1', '1,2,2,1', '1,2,2,2,1'];
  const patternStats: Record<string, { total: number; success: number }> = {
    '1,2,1': { total: 0, success: 0 },
    '1,2,2,1': { total: 0, success: 0 },
    '1,2,2,2,1': { total: 0, success: 0 },
  };

  for (let i = 0; i < catSeq.length; i++) {
    if (catSeq[i] === 1) { // Starts with ALTO
      // Check 1,2 (1 low)
      if (i + 1 < catSeq.length && catSeq[i + 1] === 2) {
        patternStats['1,2,1'].total++;
        if (i + 2 < catSeq.length && catSeq[i + 2] === 1) {
          patternStats['1,2,1'].success++;
        }

        // Check 1,2,2 (2 lows)
        if (i + 2 < catSeq.length && catSeq[i + 2] === 2) {
          patternStats['1,2,2,1'].total++;
          if (i + 3 < catSeq.length && catSeq[i + 3] === 1) {
            patternStats['1,2,2,1'].success++;
          }

          // Check 1,2,2,2 (3 lows)
          if (i + 3 < catSeq.length && catSeq[i + 3] === 2) {
            patternStats['1,2,2,2,1'].total++;
            if (i + 4 < catSeq.length && catSeq[i + 4] === 1) {
              patternStats['1,2,2,2,1'].success++;
            }
          }
        }
      }
    }
  }

  const sequences: PatternSequenceItem[] = targetPatterns.map((key) => {
    const stat = patternStats[key];
    const ratePercent = stat.total > 0 ? (stat.success / stat.total) * 100 : 0;
    return {
      sequenceKey: key,
      totalOccurrences: stat.total,
      successes: stat.success,
      ratePercent: Number(ratePercent.toFixed(1)),
    };
  });

  // Detect doubles and triples in raw history
  let doublesCount = 0;
  let triplesCount = 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i] === history[i + 1]) {
      doublesCount++;
      if (i + 2 < history.length && history[i + 1] === history[i + 2]) {
        triplesCount++;
      }
    }
  }

  const totalPossiblePairs = Math.max(1, history.length - 1);
  const doublePatternRatePercent = Number(((doublesCount / totalPossiblePairs) * 100).toFixed(1));
  const repeatPatternRatePercent = Number(((triplesCount / totalPossiblePairs) * 100).toFixed(1));

  return {
    sequences,
    doublesCount,
    triplesCount,
    doublePatternRatePercent,
    repeatPatternRatePercent,
  };
}

/**
 * Analyzes High Density & Window 10 behavior.
 * Evaluates:
 * - Distance since last High item
 * - High count in last 10 window
 * - Position of last High in last 10 (1 = most recent, 10 = oldest in window)
 * - Frequency of a new High occurring when an older High reaches position 8, 9, or 10.
 */
export function analyzeHighDensity(history: WheelItem[]): HighDensityAnalysis {
  if (!history || history.length === 0) {
    return {
      lastHighDistance: 0,
      highsInLastTen: 0,
      lastHighPositionInTen: null,
      reoccurrenceWhenReachingTenRate: 0,
      sampleCount: 0,
    };
  }

  // Distance since last high (0 = last item was HIGH, 1 = 1 round ago, etc.)
  let lastHighDistance = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (WHEEL_ITEM_METAS[history[i]]?.category === 'ALTO') {
      lastHighDistance = history.length - 1 - i;
      break;
    }
  }

  if (lastHighDistance === -1) {
    lastHighDistance = history.length;
  }

  // Window 10 (most recent 10 items)
  const window10 = history.slice(-10);
  let highsInLastTen = 0;
  let lastHighPositionInTen: number | null = null;

  for (let i = window10.length - 1; i >= 0; i--) {
    if (WHEEL_ITEM_METAS[window10[i]]?.category === 'ALTO') {
      highsInLastTen++;
      if (lastHighPositionInTen === null) {
        // Position 1 to 10 from end
        lastHighPositionInTen = window10.length - i;
      }
    }
  }

  // Historical rate: when a High item reaches position 8, 9 or 10 in window 10, does another High occur?
  let reoccurrenceOccurrences = 0;
  let reoccurrenceSuccesses = 0;

  for (let i = 10; i < history.length; i++) {
    const subWindow = history.slice(i - 10, i);
    // Find highest position of a High in subWindow (from end)
    let pos: number | null = null;
    for (let j = subWindow.length - 1; j >= 0; j--) {
      if (WHEEL_ITEM_METAS[subWindow[j]]?.category === 'ALTO') {
        pos = subWindow.length - j;
        break;
      }
    }

    if (pos !== null && pos >= 8) {
      reoccurrenceOccurrences++;
      if (WHEEL_ITEM_METAS[history[i]]?.category === 'ALTO') {
        reoccurrenceSuccesses++;
      }
    }
  }

  const reoccurrenceWhenReachingTenRate =
    reoccurrenceOccurrences > 0
      ? Number(((reoccurrenceSuccesses / reoccurrenceOccurrences) * 100).toFixed(1))
      : 0;

  return {
    lastHighDistance,
    highsInLastTen,
    lastHighPositionInTen,
    reoccurrenceWhenReachingTenRate,
    sampleCount: history.length,
  };
}
