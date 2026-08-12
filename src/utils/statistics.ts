import { ITEM_KEYS } from '../data/items';
import { ItemDelayStat, PredictionResult, RoundEntry, TransitionStat, WheelItem } from '../types';

/**
 * Gets the 10 most recent results in order from most recent to 10th most recent.
 * History array: index 0 is oldest, last element is newest.
 */
export function getRecentResults(history: RoundEntry[], count: number = 10): RoundEntry[] {
  if (!history || history.length === 0) return [];
  // Take last N elements and reverse so [0] is most recent (leftmost)
  return [...history].slice(-count).reverse();
}

/**
 * Calculates what comes after a given target item based on chronological history.
 * History array index 0 = oldest, last element = newest.
 */
export function calculateNextItemProbabilities(
  history: RoundEntry[],
  targetItem: WheelItem
): PredictionResult {
  if (!history || history.length < 2) {
    return {
      targetItem,
      totalFollowers: 0,
      transitions: ITEM_KEYS.map((item) => ({ item, count: 0, percentage: 0 })),
      topRecommendation: null,
      confidence: 0,
      reasoning: 'Dados insuficientes para análise. Registre mais rodadas.',
    };
  }

  const followerCounts: Record<WheelItem, number> = {
    sorvete: 0,
    boia: 0,
    balao: 0,
    soco: 0,
    tedy: 0,
    princesa: 0,
    camera: 0,
    coroa: 0,
  };

  let totalFollowers = 0;

  // Scan history from oldest to second newest (since newest has no follower yet)
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].item === targetItem) {
      const nextItem = history[i + 1].item;
      if (followerCounts[nextItem] !== undefined) {
        followerCounts[nextItem]++;
        totalFollowers++;
      }
    }
  }

  const transitions: TransitionStat[] = ITEM_KEYS.map((item) => {
    const count = followerCounts[item];
    const percentage = totalFollowers > 0 ? Number(((count / totalFollowers) * 100).toFixed(1)) : 0;
    return { item, count, percentage };
  }).sort((a, b) => b.count - a.count);

  const topRecommendation = transitions[0]?.count > 0 ? transitions[0].item : null;
  const confidence = totalFollowers >= 10 ? 90 : totalFollowers >= 5 ? 70 : totalFollowers > 0 ? 45 : 0;

  let reasoning = '';
  if (totalFollowers === 0) {
    reasoning = `O item "${targetItem}" não possui nenhum histórico de sucessor registrado ainda.`;
  } else {
    const topItemLabel = topRecommendation ? topRecommendation.toUpperCase() : '';
    const topPct = transitions[0]?.percentage || 0;
    reasoning = `Baseado em ${totalFollowers} ocorrências registradas de "${targetItem}", o próximo resultado mais frequente foi ${topItemLabel} com ${topPct}% das vezes.`;
  }

  return {
    targetItem,
    totalFollowers,
    transitions,
    topRecommendation,
    confidence,
    reasoning,
  };
}

/**
 * Calculates sequence prediction (after two consecutive items [ItemA, ItemB], what comes next?)
 */
export function calculateSequenceProbabilities(
  history: RoundEntry[],
  itemA: WheelItem,
  itemB: WheelItem
): { totalMatches: number; transitions: TransitionStat[]; topNext: WheelItem | null } {
  const counts: Record<WheelItem, number> = {
    sorvete: 0,
    boia: 0,
    balao: 0,
    soco: 0,
    tedy: 0,
    princesa: 0,
    camera: 0,
    coroa: 0,
  };

  let totalMatches = 0;

  for (let i = 0; i < history.length - 2; i++) {
    if (history[i].item === itemA && history[i + 1].item === itemB) {
      const nextItem = history[i + 2].item;
      counts[nextItem]++;
      totalMatches++;
    }
  }

  const transitions: TransitionStat[] = ITEM_KEYS.map((item) => {
    const count = counts[item];
    const percentage = totalMatches > 0 ? Number(((count / totalMatches) * 100).toFixed(1)) : 0;
    return { item, count, percentage };
  }).sort((a, b) => b.count - a.count);

  return {
    totalMatches,
    transitions,
    topNext: transitions[0]?.count > 0 ? transitions[0].item : null,
  };
}

/**
 * Calculates item delay (rounds since last appearance) and total occurrence statistics.
 */
export function getItemDelayStats(history: RoundEntry[]): ItemDelayStat[] {
  const totalRounds = history.length;

  return ITEM_KEYS.map((item) => {
    let lastIndex = -1;
    let occurrences = 0;

    for (let i = 0; i < history.length; i++) {
      if (history[i].item === item) {
        lastIndex = i;
        occurrences++;
      }
    }

    const roundsSinceLast = lastIndex === -1 ? totalRounds : totalRounds - 1 - lastIndex;
    const overallPercentage = totalRounds > 0 ? Number(((occurrences / totalRounds) * 100).toFixed(1)) : 0;

    return {
      item,
      roundsSinceLast,
      totalOccurrences: occurrences,
      overallPercentage,
    };
  }).sort((a, b) => b.roundsSinceLast - a.roundsSinceLast); // Most delayed first
}

/**
 * Calculates complete 8x8 transition matrix
 */
export function calculateFullTransitionMatrix(history: RoundEntry[]): Record<WheelItem, Record<WheelItem, number>> {
  const matrix: Record<WheelItem, Record<WheelItem, number>> = {} as any;

  ITEM_KEYS.forEach((fromItem) => {
    matrix[fromItem] = {} as any;
    ITEM_KEYS.forEach((toItem) => {
      matrix[fromItem][toItem] = 0;
    });
  });

  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i].item;
    const to = history[i + 1].item;
    if (matrix[from] && matrix[from][to] !== undefined) {
      matrix[from][to]++;
    }
  }

  return matrix;
}
