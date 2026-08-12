import { WheelItem } from '../types';
import {
  LOW_ITEMS,
  WHEEL_ITEM_METAS,
  LowCycleAnalysis,
  RepetitionAfterHighAnalysis,
} from '../types/wheelAnalysis';

/**
 * Filters the history to extract ONLY the LOW items (sorvete, balão, boia, soco),
 * ignoring HIGH items for low-cycle permutation analysis.
 */
export function filterLowHistory(history: WheelItem[]): WheelItem[] {
  if (!history) return [];
  return history.filter((item) => WHEEL_ITEM_METAS[item]?.category === 'BAIXO');
}

/**
 * Analyzes the 4-low cycle permutations.
 * Identifies:
 * - Items that have appeared in the current low cycle
 * - Low items that are currently MISSING from the cycle
 * - Historical completion rate of 4-low permutations
 */
export function analyzeLowCycles(history: WheelItem[]): LowCycleAnalysis {
  const lowHistory = filterLowHistory(history);
  if (lowHistory.length === 0) {
    return {
      currentCycleItems: [],
      missingLowItems: [...LOW_ITEMS],
      cycleCompletionRate: 0,
      totalCyclesAnalyzed: 0,
    };
  }

  // Scan backwards from the end of lowHistory to build the current active cycle
  const currentSeen = new Set<WheelItem>();
  const currentCycleItems: WheelItem[] = [];

  for (let i = lowHistory.length - 1; i >= 0; i--) {
    const item = lowHistory[i];
    if (currentSeen.has(item)) {
      // Reached a repeated low item -> end of current cycle
      break;
    }
    currentSeen.add(item);
    currentCycleItems.unshift(item); // Keep chronological order
  }

  // Missing low items in current cycle
  const missingLowItems = LOW_ITEMS.filter((item) => !currentSeen.has(item));

  // Calculate completion rate across historical low sequences
  let totalCycles = 0;
  let completedCycles = 0;
  let setInCycle = new Set<WheelItem>();

  for (let i = 0; i < lowHistory.length; i++) {
    const item = lowHistory[i];
    if (setInCycle.has(item)) {
      // Cycle reset
      totalCycles++;
      if (setInCycle.size === 4) {
        completedCycles++;
      }
      setInCycle = new Set<WheelItem>([item]);
    } else {
      setInCycle.add(item);
    }
  }

  if (setInCycle.size > 0) {
    totalCycles++;
    if (setInCycle.size === 4) {
      completedCycles++;
    }
  }

  const cycleCompletionRate =
    totalCycles > 0 ? Number(((completedCycles / totalCycles) * 100).toFixed(1)) : 0;

  return {
    currentCycleItems,
    missingLowItems,
    cycleCompletionRate,
    totalCyclesAnalyzed: totalCycles,
  };
}

/**
 * Analyzes behavior after a HIGH item lands inside a LOW sequence.
 * Determines if the game repeated the last LOW item or continued the cycle.
 * Example: SORVETE -> SOCO -> BALÃO -> ALTO -> BALÃO (repeat) vs BOIA (continue)
 */
export function analyzeRepetitionAfterHigh(history: WheelItem[]): RepetitionAfterHighAnalysis {
  if (!history || history.length < 3) {
    return {
      totalHighsAnalyzed: 0,
      repeatLastLowCount: 0,
      repeatLastLowRate: 0,
      continueCycleCount: 0,
      continueCycleRate: 0,
    };
  }

  let totalHighs = 0;
  let repeatLastLowCount = 0;
  let continueCycleCount = 0;

  for (let i = 1; i < history.length - 1; i++) {
    const prevItem = history[i - 1];
    const currItem = history[i];
    const nextItem = history[i + 1];

    const prevIsLow = WHEEL_ITEM_METAS[prevItem]?.category === 'BAIXO';
    const currIsHigh = WHEEL_ITEM_METAS[currItem]?.category === 'ALTO';
    const nextIsLow = WHEEL_ITEM_METAS[nextItem]?.category === 'BAIXO';

    if (prevIsLow && currIsHigh && nextIsLow) {
      totalHighs++;
      if (nextItem === prevItem) {
        // Repeated the last LOW item
        repeatLastLowCount++;
      } else {
        // Continued cycle with a different LOW item
        continueCycleCount++;
      }
    }
  }

  const repeatLastLowRate =
    totalHighs > 0 ? Number(((repeatLastLowCount / totalHighs) * 100).toFixed(1)) : 0;
  const continueCycleRate =
    totalHighs > 0 ? Number(((continueCycleCount / totalHighs) * 100).toFixed(1)) : 0;

  return {
    totalHighsAnalyzed: totalHighs,
    repeatLastLowCount,
    repeatLastLowRate,
    continueCycleCount,
    continueCycleRate,
  };
}
