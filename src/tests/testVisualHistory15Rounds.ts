import { canSyncResultToDashboard, clearSyncedDashboardEventIds } from '../services/dashboardSync';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem, RoundEntry } from '../types';

export function runVisualHistoryTest() {
  console.log('=== TESTE DE PERSISTÊNCIA/SINCRONIZAÇÃO DO HISTÓRICO VISUAL (15 RODADAS) ===\n');

  clearSyncedDashboardEventIds();

  const mockObjects: WheelItem[] = [
    'boia', 'sorvete', 'balao', 'soco',
    'tedy', 'princesa', 'camera', 'coroa',
    'boia', 'boia', 'boia', 'sorvete',
    'princesa', 'coroa', 'soco'
  ];

  let historyState: RoundEntry[] = [];

  mockObjects.forEach((item, index) => {
    const roundNumber = index + 1;
    const eventId = `LIVE_EVT_TEST_ROUND_${roundNumber}_${item}`;

    const mockResult = {
      timestamp: Date.now() + index * 1000,
      objetoDetectado: item,
      confianca: 95,
      eventId,
      estabilizacao: {
        eventId,
        foiConfirmadoAgora: true,
        estadoAnalyzer: 'ROUND_CONFIRMED',
        ultimoObjetoConfirmado: item,
        confiancaUltimaConfirmacao: 95,
        rodadaRegistrada: roundNumber,
      },
    };

    const syncCheck = canSyncResultToDashboard(mockResult, { autoMark: true });

    if (!syncCheck.canSync) {
      console.error(`❌ Rodada #${roundNumber} (${item}) REJEITADA na sincronização! Motivo: ${syncCheck.reason}`);
      return;
    }

    const newItem = syncCheck.item as WheelItem;
    if (newItem && newItem in WHEEL_ITEMS) {
      const newEntry: RoundEntry = {
        id: `live_${eventId}`,
        item: newItem,
        timestamp: mockResult.timestamp,
        source: 'ai_vision',
      };

      const duplicateCheck = historyState.some((e) => e.id.includes(eventId));
      if (!duplicateCheck) {
        historyState = [...historyState, newEntry];
        console.log(
          `[VISUAL_HISTORY_TRACE] ` +
          `eventId=${eventId} ` +
          `object=${item} ` +
          `normalizedObject=${newItem} ` +
          `round=${roundNumber} ` +
          `previousHistoryLength=${historyState.length - 1} ` +
          `newHistoryLength=${historyState.length} ` +
          `appendAllowed=true ` +
          `appendReason=NEW_EVENT_ID ` +
          `duplicateCheck=false ` +
          `historyUpdated=true ` +
          `uiUpdated=true`
        );
      } else {
        console.warn(`⚠️ Duplicate eventId detected: ${eventId}`);
      }
    }
  });

  console.log('\n========================================================================');
  console.log(`TOTAL DE RODADAS NO HISTÓRICO VISUAL: ${historyState.length} / ${mockObjects.length}`);
  console.log('ITENS REGISTRADOS CRONOLOGICAMENTE (Antigo -> Novo):');
  console.log(historyState.map((h, idx) => `#${idx + 1}: ${h.item}`).join(' | '));
  console.log('========================================================================\n');

  if (historyState.length === mockObjects.length) {
    console.log('✅ TESTE DE HISTÓRICO VISUAL CONCLUÍDO COM SUCESSO! TODAS AS 15 RODADAS FORAM REGISTRADAS.');
  } else {
    console.error('❌ FALHA NO TESTE DE HISTÓRICO VISUAL.');
    process.exit(1);
  }
}

runVisualHistoryTest();
