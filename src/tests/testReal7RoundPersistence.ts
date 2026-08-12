import { registrarResultadoAutomaticamente, limparMemoriaResultadoService } from '../services/resultadoService';
import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';

async function run7RoundTest() {
  console.log('==================================================');
  console.log('EXECUTANDO TESTE REAL DE PERSISTÊNCIA - 7 RODADAS');
  console.log('==================================================\n');

  limparMemoriaResultadoService();

  const supabase = getSupabase();
  if (!supabase) {
    console.error('ERRO: Cliente Supabase indisponível.');
    process.exit(1);
  }

  // Obter rodada inicial
  const { data: initialMax } = await supabase
    .from('resultados')
    .select('rodada')
    .order('rodada', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startRodada = (initialMax?.rodada || 0) + 1;
  console.log(`Rodada inicial calculada: #${startRodada}`);

  const testRounds = [
    { roundName: 'R001', object: 'balao', confidence: 95, eventId: `EVT_TEST_7R_R001_${Date.now()}` },
    { roundName: 'R002', object: 'sorvete', confidence: 92, eventId: `EVT_TEST_7R_R002_${Date.now()}` },
    { roundName: 'R003', object: 'boia', confidence: 88, eventId: `EVT_TEST_7R_R003_${Date.now()}` },
    { roundName: 'R004', object: 'boia', confidence: 90, eventId: `EVT_TEST_7R_R004_${Date.now()}` }, // CONSECUTIVO IGUAL
    { roundName: 'R005', object: 'princesa', confidence: 96, eventId: `EVT_TEST_7R_R005_${Date.now()}` },
    { roundName: 'R006', object: 'soco', confidence: 85, eventId: `EVT_TEST_7R_R006_${Date.now()}` },
    { roundName: 'R007', object: 'camera', confidence: 91, eventId: `EVT_TEST_7R_R007_${Date.now()}` },
  ];

  const results: any[] = [];

  for (const item of testRounds) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[TEST-RUNNER] Processando ${item.roundName}: ${item.object} (${item.confidence}%) | eventId=${item.eventId}`);
    
    const res = await registrarResultadoAutomaticamente(
      item.object,
      item.confidence,
      item.eventId,
      1
    );

    console.log(`[TEST-RUNNER] Resultado ${item.roundName}: registrado=${res.registrado} | rodada=${res.rodadaRegistrada} | motivo="${res.motivo}"`);
    results.push({ ...item, ...res });
  }

  console.log('\n==================================================');
  console.log('VERIFICAÇÃO DE CONSULTA SQL REAL NO SUPABASE');
  console.log('==================================================');

  const insertedEventIds = testRounds.map(r => r.eventId);
  const { data: dbRecords, error: selectError } = await supabase
    .from('resultados')
    .select('id, sessao_id, rodada, objeto, confianca, origem, status, criado_em')
    .gte('rodada', startRodada)
    .order('rodada', { ascending: true })
    .limit(10);

  if (selectError) {
    console.error('Erro na consulta SELECT de verificação:', selectError.message);
  } else {
    console.log('\nRegistros encontrados na tabela `resultados`:');
    console.table(dbRecords);
  }

  console.log('\n==================================================');
  console.log('RESUMO FINAL DA EXECUÇÃO DAS 7 RODADAS');
  console.log('==================================================');
  
  let allSuccess = true;
  testRounds.forEach((r, idx) => {
    const res = results[idx];
    const statusStr = res.registrado ? 'PASS (SUPABASE_INSERT_SUCCESS)' : 'FAIL';
    if (!res.registrado) allSuccess = false;
    console.log(`${r.roundName} | Object: ${r.object.padEnd(8)} | Rodada: #${res.rodadaRegistrada} | Status: ${statusStr}`);
  });

  console.log(`\nStatus Geral: ${allSuccess ? 'PASS - TODAS AS 7 RODADAS PERSISTIDAS' : 'FAIL'}`);
}

run7RoundTest().catch((err) => {
  console.error('Exceção no teste de 7 rodadas:', err);
  process.exit(1);
});
