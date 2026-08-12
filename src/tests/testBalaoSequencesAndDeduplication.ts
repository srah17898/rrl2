import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { registrarResultadoAutomaticamente, setAutoPersistEnabled, limparMemoriaResultadoService } from '../services/resultadoService';
import { canSyncResultToDashboard, clearSyncedDashboardEventIds } from '../services/dashboardSync';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem, RoundEntry } from '../types';

export async function runBalaoSequenceTests() {
  console.log('========================================================================');
  console.log('TESTES DE BALÃO E SEQUÊNCIAS DE DEDUPLICAÇÃO');
  console.log('========================================================================\n');

  setAutoPersistEnabled(true);

  // ------------------------------------------------------------------------
  // TESTE 9: SEQUÊNCIA CONTROLADA DE 7 RODADAS
  // R001 sorvete, R002 balao, R003 soco, R004 tedy, R005 balao, R006 sorvete, R007 balao
  // ------------------------------------------------------------------------
  console.log('--- TESTE 9: SEQUÊNCIA CONTROLADA DE 7 RODADAS ---');
  limparMemoriaResultadoService();
  clearSyncedDashboardEventIds();

  const seq7: WheelItem[] = ['sorvete', 'balao', 'soco', 'tedy', 'balao', 'sorvete', 'balao'];
  const analyzer7 = new WheelVisionAnalyzer();
  const dbRecords7: Array<{ round: number; item: string; eventId: string }> = [];
  let history7: RoundEntry[] = [];

  for (let i = 0; i < seq7.length; i++) {
    const item = seq7[i];
    const roundNum = i + 1;

    // Simula saída da tela de resultado antes da nova rodada (exceto rodada 1)
    if (i > 0) {
      for (let exitFrame = 1; exitFrame <= 2; exitFrame++) {
        analyzer7.processarDeteccao('nenhum', 0, false, 0, 'session_seq7', exitFrame);
      }
    }

    // Processa a nova rodada na tela de resultado
    let confirmedRes: any = null;
    for (let frame = 1; frame <= 5; frame++) {
      const res = analyzer7.processarDeteccao(item, 95, true, 0.98, 'session_seq7', frame);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmedRes = res;
      }
    }

    if (!confirmedRes) {
      console.error(`❌ Rodada R00${roundNum} (${item}) FALHOU em ser confirmada pelo analyzer!`);
      continue;
    }

    const eventId = confirmedRes.eventId;
    const roundObj = confirmedRes.objetoPadraoParaBanco.resultado;

    // Inserção no Supabase
    const reg = await registrarResultadoAutomaticamente(roundObj, 95, eventId, 'session_seq7');
    console.log(`[SUPABASE_TRACE] object=${roundObj} column=objeto insertStatus=${reg.registrado ? 'SUCCESS' : 'FAILED'} insertError=${reg.motivo || 'none'}`);

    if (reg.registrado) {
      dbRecords7.push({ round: reg.rodadaRegistrada || roundNum, item: roundObj, eventId });
    }

    // Sync Dashboard / Visual History
    const mockLive = {
      timestamp: Date.now(),
      objetoDetectado: item,
      confianca: 95,
      eventId,
      estabilizacao: {
        eventId,
        foiConfirmadoAgora: true,
        estadoAnalyzer: 'ROUND_CONFIRMED',
        ultimoObjetoConfirmado: item,
        confiancaUltimaConfirmacao: 95,
        rodadaRegistrada: reg.rodadaRegistrada || roundNum,
      },
    };

    const syncCheck = canSyncResultToDashboard(mockLive, { autoMark: true });
    if (syncCheck.canSync && syncCheck.item && syncCheck.item in WHEEL_ITEMS) {
      history7.push({
        id: `live_${eventId}`,
        item: syncCheck.item as WheelItem,
        timestamp: Date.now(),
        source: 'ai_vision',
      });
    }
  }

  console.log('\nRESULTADO TESTE 9 (Banco de Dados / Histórico):');
  dbRecords7.forEach((rec, idx) => {
    console.log(`R00${idx + 1}: ${rec.item} (EventId: ${rec.eventId})`);
  });

  const balaoCount7 = dbRecords7.filter((r) => r.item === 'balao').length;
  console.log(`Contagem de 'balao' no banco: ${balaoCount7} / 3 esperados`);

  if (dbRecords7.length === 7 && balaoCount7 === 3) {
    console.log('✅ TESTE 9 PASSOU COM SUCESSO!\n');
  } else {
    console.error('❌ TESTE 9 FALHOU!\n');
  }

  // ------------------------------------------------------------------------
  // TESTE 10: BALÃO CONSECUTIVO (R001 balao, R002 balao, R003 balao)
  // ------------------------------------------------------------------------
  console.log('--- TESTE 10: TESTE DE BALÃO CONSECUTIVO (3x balao) ---');
  limparMemoriaResultadoService();
  clearSyncedDashboardEventIds();

  const analyzer10 = new WheelVisionAnalyzer();
  const dbRecords10: Array<{ round: number; item: string; eventId: string }> = [];

  for (let roundNum = 1; roundNum <= 3; roundNum++) {
    const item = 'balao';

    // Simula transição / giro entre rodadas
    if (roundNum > 1) {
      for (let exitFrame = 1; exitFrame <= 2; exitFrame++) {
        analyzer10.processarDeteccao('nenhum', 0, false, 0, 'session_seq10', exitFrame);
      }
    }

    let confirmedRes: any = null;
    for (let frame = 1; frame <= 5; frame++) {
      const res = analyzer10.processarDeteccao(item, 95, true, 0.98, 'session_seq10', frame);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmedRes = res;
      }
    }

    if (!confirmedRes) {
      console.error(`❌ Rodada R00${roundNum} (balao) FALHOU em ser confirmada!`);
      continue;
    }

    const eventId = confirmedRes.eventId;
    const roundObj = confirmedRes.objetoPadraoParaBanco.resultado;

    const reg = await registrarResultadoAutomaticamente(roundObj, 95, eventId, 'session_seq10');
    console.log(`[SUPABASE_TRACE] object=${roundObj} column=objeto insertStatus=${reg.registrado ? 'SUCCESS' : 'FAILED'} insertError=${reg.motivo || 'none'}`);

    if (reg.registrado) {
      dbRecords10.push({ round: reg.rodadaRegistrada || roundNum, item: roundObj, eventId });
    }
  }

  console.log('\nRESULTADO TESTE 10 (Balão Consecutivo):');
  dbRecords10.forEach((rec, idx) => {
    console.log(`R00${idx + 1}: ${rec.item} (EventId: ${rec.eventId})`);
  });

  if (dbRecords10.length === 3 && dbRecords10.every((r) => r.item === 'balao')) {
    console.log('✅ TESTE 10 PASSOU COM SUCESSO (3 registros independentes de balao)!\n');
  } else {
    console.error('❌ TESTE 10 FALHOU!\n');
  }
}

runBalaoSequenceTests();
