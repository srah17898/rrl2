import { logger } from '../utils/logger';

export interface DashboardSyncCheckResult {
  canSync: boolean;
  reason: string;
  eventId?: string | null;
  item?: string | null;
  confidence?: number;
  rodada?: number | null;
}

// Conjunto em memória para garantir: 1 eventId = no máximo 1 resultado oficial na dashboard
const syncedDashboardEventIds = new Set<string>();

/**
 * Limpa o conjunto de eventIds sincronizados na dashboard (utilizado em testes e reset de sessão)
 */
export function clearSyncedDashboardEventIds(): void {
  syncedDashboardEventIds.clear();
}

/**
 * Verifica se um eventId já foi sincronizado com a dashboard.
 */
export function isEventIdSyncedToDashboard(eventId: string): boolean {
  return syncedDashboardEventIds.has(eventId);
}

/**
 * Marca um eventId como sincronizado na dashboard.
 */
export function markEventIdAsSynced(eventId: string): void {
  if (eventId) {
    syncedDashboardEventIds.add(eventId);
  }
}

/**
 * BARREIRA FINAL DE SINCRONIZAÇÃO: canSyncResultToDashboard(result, options)
 *
 * REGRA ABSOLUTA DE NEGÓCIO:
 * A DASHBOARD SÓ PODE EXIBIR RESULTADOS QUE TENHAM SIDO REALMENTE ANALISADOS,
 * CONFIRMADOS E ACEITOS PELO WheelVisionAnalyzer (ROUND_CONFIRMED).
 *
 * Nenhum resultado pode aparecer na dashboard apenas porque:
 * - foi candidato
 * - foi detectado uma única vez
 * - teve confiança baixa (< 85%)
 * - veio de uma simulação
 * - veio de reconexão
 * - apareceu durante a RODA_NORMAL
 * - veio de leitura parcial
 */
export function canSyncResultToDashboard(
  result: any,
  options: { autoMark?: boolean } = { autoMark: true }
): DashboardSyncCheckResult {
  if (!result) {
    const reason = 'RESULT_NULL';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=N/A reason="${reason}" item=N/A`);
    return { canSync: false, reason };
  }

  const estab = result.estabilizacao || result;
  const eventId = estab.eventId || result.eventId || null;
  const item = (estab.ultimoObjetoConfirmado || result.objetoDetectado || result.item || result.objeto || '').trim().toLowerCase();
  const confidence = typeof estab.confiancaUltimaConfirmacao === 'number'
    ? estab.confiancaUltimaConfirmacao
    : (typeof result.confianca === 'number' ? result.confianca : (typeof result.confidence === 'number' ? result.confidence : 0));

  // 1. Validar existência de eventId
  if (!eventId) {
    const reason = 'MISSING_EVENT_ID';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=N/A reason="${reason}" item=${item || 'N/A'}`);
    return { canSync: false, reason, item, confidence };
  }

  // 2. Verificar se o eventId já foi sincronizado na dashboard (Idempotência: 1 eventId = max 1 resultado)
  if (syncedDashboardEventIds.has(eventId)) {
    const reason = 'DUPLICATE_EVENT_ID';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=${eventId} reason="${reason}" item=${item}`);
    return { canSync: false, reason, eventId, item, confidence };
  }

  // 3. Verificar confirmação oficial pelo WheelVisionAnalyzer (ROUND_CONFIRMED / RESULTADO_CONFIRMADO)
  const isConfirmedByAnalyzer =
    estab.foiConfirmadoAgora === true ||
    estab.estadoAnalyzer === 'RESULTADO_CONFIRMADO' ||
    estab.estadoAnalyzer === 'ROUND_CONFIRMED' ||
    result.analyzerTag === 'ANALYZER_CONFIRMED' ||
    result.finalStatus === 'confirmado' ||
    result.status === 'confirmado';

  if (!isConfirmedByAnalyzer) {
    const reason = 'NOT_CONFIRMED_BY_ANALYZER';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=${eventId} reason="${reason}" item=${item}`);
    return { canSync: false, reason, eventId, item, confidence };
  }

  // 4. Verificar se o objeto é um dos 8 objetos permitidos
  const OBJETOS_PERMITIDOS_SET = new Set([
    'sorvete', 'boia', 'balao', 'soco',
    'tedy', 'princesa', 'camera', 'coroa'
  ]);

  if (!item || !OBJETOS_PERMITIDOS_SET.has(item)) {
    const reason = 'INVALID_OBJECT';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=${eventId} reason="${reason}" item=${item || 'N/A'}`);
    return { canSync: false, reason, eventId, item, confidence };
  }

  // 5. Verificar confiança mínima (>= 85%)
  if (confidence < 85) {
    const reason = 'LOW_CONFIDENCE';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=${eventId} reason="${reason}" item=${item} confidence=${confidence}%`);
    return { canSync: false, reason, eventId, item, confidence };
  }

  // 6. Verificar se a rodada foi descartada, rejeitada ou duplicada pelo analyzer
  if (estab.motivoEstabilizacao && (
    estab.motivoEstabilizacao.includes('Descartado') ||
    estab.motivoEstabilizacao.includes('Ignorado') ||
    estab.motivoEstabilizacao.includes('Duplicado')
  )) {
    const reason = 'ANALYZER_DISCARDED';
    logger.info(`[DASHBOARD_SYNC_BLOCKED] eventId=${eventId} reason="${reason}" item=${item}`);
    return { canSync: false, reason, eventId, item, confidence };
  }

  // PASSOU EM TODAS AS VALIDAÇÕES -> SINCRONIZAÇÃO APROVADA
  if (options.autoMark !== false) {
    syncedDashboardEventIds.add(eventId);
  }

  const rodada = estab.rodadaRegistrada || result.rodada || null;
  logger.info(`[DASHBOARD_SYNC] eventId=${eventId} item=${item} confidence=${confidence}% rodada=${rodada || 'N/A'}`);

  return {
    canSync: true,
    reason: 'SYNC_APPROVED',
    eventId,
    item,
    confidence,
    rodada,
  };
}
