import { logger } from '../utils/logger';

let cutoffTimestamp: string | null = null;

// Tenta inicializar em ambiente Node.js
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  Promise.all([import('fs'), import('path')])
    .then(([nodeFs, nodePath]) => {
      try {
        const CUTOFF_FILE = nodePath.join(process.cwd(), 'data', 'clear_history_cutoff.json');
        if (nodeFs.existsSync(CUTOFF_FILE)) {
          const raw = nodeFs.readFileSync(CUTOFF_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.cutoffTimestamp) {
            cutoffTimestamp = parsed.cutoffTimestamp;
          }
        }
      } catch (err) {
        logger.error('Erro ao ler clear_history_cutoff.json:', err);
      }
    })
    .catch(() => {});
}

export function getCutoffTimestamp(): string | null {
  if (cutoffTimestamp === null && typeof window !== 'undefined') {
    try {
      cutoffTimestamp = localStorage.getItem('clear_history_cutoff');
    } catch {}
  }
  return cutoffTimestamp;
}

export function setCutoffTimestamp(isoString: string | null): void {
  cutoffTimestamp = isoString;

  if (typeof window !== 'undefined') {
    try {
      if (isoString) {
        localStorage.setItem('clear_history_cutoff', isoString);
      } else {
        localStorage.removeItem('clear_history_cutoff');
      }
    } catch {}
  }

  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    Promise.all([import('fs'), import('path')])
      .then(([nodeFs, nodePath]) => {
        try {
          const CUTOFF_FILE = nodePath.join(process.cwd(), 'data', 'clear_history_cutoff.json');
          const dir = nodePath.dirname(CUTOFF_FILE);
          if (!nodeFs.existsSync(dir)) {
            nodeFs.mkdirSync(dir, { recursive: true });
          }
          nodeFs.writeFileSync(
            CUTOFF_FILE,
            JSON.stringify({ cutoffTimestamp: isoString, updatedAt: new Date().toISOString() }, null, 2),
            'utf-8'
          );
          logger.info(`[CLEAR_HISTORY_CUTOFF] Cutoff timestamp atualizado para: ${isoString}`);
        } catch (err) {
          logger.error('Erro ao salvar clear_history_cutoff.json:', err);
        }
      })
      .catch(() => {});
  }
}

export function resetCutoffTimestamp(): void {
  setCutoffTimestamp(null);
}


