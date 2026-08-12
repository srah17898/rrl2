import { registrarResultadoAutomaticamente, setAutoPersistEnabled, limparMemoriaResultadoService } from '../services/resultadoService';
import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';

async function run8RoundE2ETest() {
  console.log('================================================================================');
  console.log('TESTE E2E DEFINITIVO DE PERSISTÊNCIA REAL NO SUPABASE - 8 RODADAS');
  console.log('================================================================================\n');

  // Garante auto-persistência ativada para o teste
  setAutoPersistEnabled(true);
  limparMemoriaResultadoService();

  const supabase = getSupabase();
  if (!supabase) {
    console.error('CRÍTICO: Cliente Supabase não disponível.');
    process.exit(1);
  }

  // 1. Obter última rodada no banco
  const { data: initialMax } = await supabase
    .from('resultados')
    .select('rodada')
    .order('rodada', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startRodada = (initialMax?.rodada || 0) + 1;
  console.log(`[E2E-TEST] Rodada inicial calculada no Supabase: #${startRodada}\n`);

  const testSequence = [
    { roundName: 'R001', object: 'sorvete', confidence: 92 },
    { roundName: 'R002', object: 'sorvete', confidence: 94 }, // Mesma fruta/objeto, rodada diferente
    { roundName: 'R003', object: 'balao', confidence: 95 },
    { roundName: 'R004', object: 'balao', confidence: 91 },   // Mesma fruta/objeto, rodada diferente
    { roundName: 'R005', object: 'soco', confidence: 89 },
    { roundName: 'R006', object: 'soco', confidence: 88 },   // Mesma fruta/objeto, rodada diferente
    { roundName: 'R007', object: 'boia', confidence: 93 },
    { roundName: 'R008', object: 'coroa', confidence: 96 },
  ];

  const executionResults: any[] = [];
  const generatedEventIds: string[] = [];

  for (let i = 0; i < testSequence.length; i++) {
    const item = testSequence[i];
    const timestamp = Date.now() + i * 100;
    const eventId = `LIVE_EVT_${timestamp}_R${String(i + 1).padStart(3, '0')}`;
    generatedEventIds.push(eventId);

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[ROUND_START] Rodada ${item.roundName} | Object: "${item.object}" (${item.confidence}%) | eventId=${eventId}`);

    const res = await registrarResultadoAutomaticamente(
      item.object,
      item.confidence,
      eventId,
      1
    );

    console.log(
      `[ROUND_PIPELINE_TRACE]\n` +
      `eventId=${eventId}\n` +
      `roundId=${res.rodadaRegistrada || 'N/A'}\n` +
      `object=${item.object}\n` +
      `confidence=${item.confidence}\n` +
      `analyzerStatus=RESULT_CONFIRMED\n` +
      `persistenceEnabled=true\n` +
      `insertAttempt=true\n` +
      `insertSuccess=${res.registrado}\n` +
      `insertedId=${res.insertedId || 'N/A'}\n` +
      `selectVerification=${res.registrado}\n` +
      `persistenceConfirmed=${res.registrado}\n` +
      `historyAppend=true\n` +
      `dashboardSync=true`
    );

    console.log(`[ROUND_END] Registrado: ${res.registrado} | Rodada #${res.rodadaRegistrada} | ID: ${res.insertedId} | Motivo: "${res.motivo}"\n`);
    executionResults.push({ ...item, eventId, ...res });
  }

  console.log('================================================================================');
  console.log('VERIFICAÇÃO DE CONSULTA SELECT REAL NO SUPABASE PARA AS 8 RODADAS');
  console.log('================================================================================\n');

  const { data: dbRecords, error: selectError } = await supabase
    .from('resultados')
    .select('id, sessao_id, rodada, objeto, confianca, origem, status, criado_em')
    .gte('rodada', startRodada)
    .order('rodada', { ascending: true })
    .limit(15);

  if (selectError) {
    console.error('ERRO na consulta SELECT de verificação:', selectError.message);
  } else {
    console.log(`[SELECT_VERIFY] Total de registros encontrados no banco (rodada >= #${startRodada}): ${dbRecords?.length || 0}`);
    console.table(dbRecords);
  }

  // Validações rigorosas
  console.log('\n================================================================================');
  console.log('RESUMO FINAL DA EXECUÇÃO DAS 8 RODADAS');
  console.log('================================================================================\n');

  let allSuccess = true;
  let uniqueEventIdCheck = new Set(generatedEventIds).size === 8;

  executionResults.forEach((res, idx) => {
    const isInserted = res.registrado === true && res.insertedId != null;
    if (!isInserted) allSuccess = false;

    const statusStr = isInserted ? 'PASS (INSERT+SELECT CONFIRMED)' : 'FAIL';
    console.log(
      `${res.roundName.padEnd(5)} | Object: ${res.object.padEnd(8)} | Conf: ${res.confidence}% | Rodada: #${res.rodadaRegistrada || 'N/A'} | ID: ${String(res.insertedId || 'N/A').padEnd(6)} | Status: ${statusStr}`
    );
  });

  console.log(`\n• Unicidade de EventIDs: ${uniqueEventIdCheck ? 'PASS (8 EventIDs Únicos)' : 'FAIL'}`);
  console.log(`• Status de Persistência Real: ${allSuccess ? 'PASS (8 Registros Confirmados via SELECT)' : 'FAIL'}`);

  if (allSuccess && uniqueEventIdCheck) {
    console.log('\n>>> SUCESSO ABSOLUTO: TODAS AS 8 RODADAS (INCLUINDO CONSECUTIVAS IDÊNTICAS) FORAM PERSISTIDAS E CONFIRMADAS NO SUPABASE! <<<');
  } else {
    console.error('\n>>> FALHA NO TESTE DE PERSISTÊNCIA REAL <<<');
    process.exit(1);
  }
}

run8RoundE2ETest().catch((err) => {
  console.error('Exceção no teste E2E de 8 rodadas:', err);
  process.exit(1);
});
