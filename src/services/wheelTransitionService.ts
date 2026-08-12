import { WheelItem } from '../types';
import { ITEM_KEYS } from '../data/items';
import { WHEEL_ITEM_METAS, ItemCategory } from '../types/wheelAnalysis';

export interface ItemTransitionStat {
  targetItem: WheelItem;
  count: number;
  percentage: number; // 0..100
}

export interface TransitionAnalysis {
  lastItem: WheelItem | null;
  totalFollowersFound: number;
  transitions: ItemTransitionStat[];
  categoryTransitionRates: {
    toLowRate: number;  // 0..100
    toHighRate: number; // 0..100
  };
}

/**
 * Analyzes transition frequencies after the last item in history.
 */
export function analyzeTransitions(history: WheelItem[]): TransitionAnalysis {
  if (!history || history.length === 0) {
    return {
      lastItem: null,
      totalFollowersFound: 0,
      transitions: ITEM_KEYS.map((item) => ({ targetItem: item, count: 0, percentage: 0 })),
      categoryTransitionRates: { toLowRate: 50, toHighRate: 50 },
    };
  }

  const lastItem = history[history.length - 1];
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
  let lowFollowers = 0;
  let highFollowers = 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i] === lastItem) {
      const nextItem = history[i + 1];
      if (nextItem && followerCounts[nextItem] !== undefined) {
        followerCounts[nextItem]++;
        totalFollowers++;
        if (WHEEL_ITEM_METAS[nextItem]?.category === 'BAIXO') {
          lowFollowers++;
        } else {
          highFollowers++;
        }
      }
    }
  }

  const transitions: ItemTransitionStat[] = ITEM_KEYS.map((item) => {
    const count = followerCounts[item] || 0;
    const percentage = totalFollowers > 0 ? Number(((count / totalFollowers) * 100).toFixed(1)) : 0;
    return {
      targetItem: item,
      count,
      percentage,
    };
  });

  const toLowRate = totalFollowers > 0 ? Number(((lowFollowers / totalFollowers) * 100).toFixed(1)) : 50;
  const toHighRate = totalFollowers > 0 ? Number(((highFollowers / totalFollowers) * 100).toFixed(1)) : 50;

  return {
    lastItem,
    totalFollowersFound: totalFollowers,
    transitions,
    categoryTransitionRates: {
      toLowRate,
      toHighRate,
    },
  };
}
