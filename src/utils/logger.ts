export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

// Nível mínimo configurado (padrão INFO em produção, DEBUG em dev)
let currentMinLevel: LogLevel =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
    ? 'DEBUG'
    : 'INFO';

export const logger = {
  setMinLevel: (level: LogLevel) => {
    currentMinLevel = level;
  },
  debug: (...args: any[]) => {
    if (LOG_LEVEL_WEIGHT['DEBUG'] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.debug('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  info: (...args: any[]) => {
    if (LOG_LEVEL_WEIGHT['INFO'] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  },
  warn: (...args: any[]) => {
    if (LOG_LEVEL_WEIGHT['WARN'] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  },
  error: (...args: any[]) => {
    if (LOG_LEVEL_WEIGHT['ERROR'] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  },
};

