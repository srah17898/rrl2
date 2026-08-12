import { UserStrategy } from '../types/wheelAnalysis';

export const DEFAULT_USER_STRATEGY: UserStrategy = {
  lowCount: 3,
  highCount: 1,
};

/**
 * Formats user strategy into human readable label.
 * Example: "3 BAIXOS + 1 ALTO" or "2 BAIXOS + 2 ALTOS"
 */
export function formatStrategyLabel(strategy: UserStrategy): string {
  const lowText = `${strategy.lowCount} ${strategy.lowCount === 1 ? 'BAIXO' : 'BAIXOS'}`;
  const highText = `${strategy.highCount} ${strategy.highCount === 1 ? 'ALTO' : 'ALTOS'}`;
  return `${lowText} + ${highText}`;
}

/**
 * Validates and clamps user strategy bounds (0 to 4).
 */
export function sanitizeStrategy(strategy: Partial<UserStrategy>): UserStrategy {
  const lowCount = Math.max(0, Math.min(4, Math.floor(strategy.lowCount ?? 3)));
  const highCount = Math.max(0, Math.min(4, Math.floor(strategy.highCount ?? 1)));
  return { lowCount, highCount };
}
