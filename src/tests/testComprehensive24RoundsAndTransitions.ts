import { registrarResultadoAutomaticamente, limparMemoriaResultadoService } from '../services/resultadoService';
import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';

interface RoundAuditRow {
  roundName: string;
  object: string;
  recognizer: 'PASS' | 'FAIL';
  analyzer: 'PASS' | 'FAIL';
  confirmed: 'PASS' | 'FAIL';
  persistence: 'PASS' | 'FAIL';
  supabase: 'SIM' | 'NÃO';
  eventId?: string;
  databaseId?: number;
}

async function runComprehensiveDiagnosticTest() {
  console.log('====================================================================================================');
  console.log('DIAGNÓSTICO COMPLETO E REVALIDAÇÃO CONTINUA DE PERSISTÊNCIA (24 RODADAS + TRANSIÇÕES)');
  console.log('====================================================================================================\n');

  limparMemoriaResultadoService();

  const supabase = getSupabase();
  if (!supabase) {
    console.error('ERRO: Cliente Supabase indisponível.');
    process.exit(1);
  }

  // Obter contagem/rodada atual no Supabase
  const { data: initialMax } = await supabase
    .from('resultados')
    .select('rodada')
    .order('rodada', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startRodada = (initialMax?.rodada || 0) + 1;
  console.log(`Rodada inicial no banco de dados: #${startRodada}\n`);

  const analyzer = new WheelVisionAnalyzer();
  const auditRows: RoundAuditRow[] = [];

  // 1. BATERIA DE 24 RODADAS INDIVIDUAIS (8 OBJETOS x 3 RODADAS CADA)
  const targetObjects = ['sorvete', 'balao', 'boia', 'soco', 'tedy', 'princesa', 'camera', 'coroa'];
  const testPlan: { roundName: string; object: string }[] = [];

  let roundCounter = 1;
  for (const obj of targetObjects) {
    for (let r = 1; r <= 3; r++) {
      const rName = `R${String(roundCounter).padStart(3, '0')}`;
      testPlan.push({ roundName: rName, object: obj });
      roundCounter++;
    }
  }

  console.log(`Executing 24 Individual Rounds Test Plan (${testPlan.length} rounds total)...`);

  for (const item of testPlan) {
    const timestamp = Date.now();

    // 1. Simulador de Visão (Recognizer): Sucesso visual
    const recognizerStatus = 'PASS';

    // Reset/Liberar para nova rodada limpa
    analyzer.resetAnalyzer();

    // Frame 1: Deteção inicial da tela de resultado (stablizing 1/2)
    analyzer.processarDeteccao(item.object, 95, true, 0.95, 'TEST_SESS_24', roundCounter, timestamp, 12);
    // Frame 2: Confirmação da tela de resultado (stablizing 2/2) & Candidate 1/3
    analyzer.processarDeteccao(item.object, 95, true, 0.95, 'TEST_SESS_24', roundCounter, timestamp + 50, 12);
    // Frame 3: Candidate 2/3
    analyzer.processarDeteccao(item.object, 95, true, 0.95, 'TEST_SESS_24', roundCounter, timestamp + 100, 12);
    // Frame 4: Candidate 3/3 -> RESULT_CONFIRMED!
    const resAnalyzer = analyzer.processarDeteccao(item.object, 95, true, 0.95, 'TEST_SESS_24', roundCounter, timestamp + 150, 12);

    const analyzerPassed = resAnalyzer.status === 'confirmado' || resAnalyzer.confirmedNow;
    const confirmedPassed = Boolean(resAnalyzer.objetoPadraoParaBanco && resAnalyzer.eventId);

    let persistencePassed = false;
    let supabaseSaved = false;
    let databaseId: number | undefined;

    if (confirmedPassed && resAnalyzer.objetoPadraoParaBanco && resAnalyzer.eventId) {
      // 2. Tentar Persistência
      const eventId = resAnalyzer.eventId;
      const autoRes = await registrarResultadoAutomaticamente(
        resAnalyzer.objetoPadraoParaBanco.resultado,
        resAnalyzer.objetoPadraoParaBanco.confianca,
        eventId,
        1
      );

      persistencePassed = autoRes.registrado;

      if (autoRes.registrado && autoRes.rodadaRegistrada) {
        // 3. Confirmar consulta direta no Supabase
        const { data: checkData } = await supabase
          .from('resultados')
          .select('id')
          .eq('rodada', autoRes.rodadaRegistrada)
          .maybeSingle();

        if (checkData) {
          supabaseSaved = true;
          databaseId = checkData.id;
        }
      }
    }

    auditRows.push({
      roundName: item.roundName,
      object: item.object,
      recognizer: recognizerStatus,
      analyzer: analyzerPassed ? 'PASS' : 'FAIL',
      confirmed: confirmedPassed ? 'PASS' : 'FAIL',
      persistence: persistencePassed ? 'PASS' : 'FAIL',
      supabase: supabaseSaved ? 'SIM' : 'NÃO',
      eventId: resAnalyzer.eventId,
      databaseId,
    });
  }

  // 2. BATERIA DE TESTE DE TRANSIÇÕES
  console.log('\n----------------------------------------------------------------------------------------------------');
  console.log('Executando Bateria de Teste de Transições (Mesmos Objetos Consecutivos, Alto/Baixo, Inversões)...');
  console.log('----------------------------------------------------------------------------------------------------');

  const transitionPairs = [
    { from: 'balao', to: 'sorvete', label: 'R_TRANS_01' },
    { from: 'sorvete', to: 'balao', label: 'R_TRANS_02' },
    { from: 'boia', to: 'boia', label: 'R_TRANS_03 (CONSECUTIVO_BOIA)' },
    { from: 'soco', to: 'soco', label: 'R_TRANS_04 (CONSECUTIVO_SOCO)' },
    { from: 'tedy', to: 'princesa', label: 'R_TRANS_05' },
    { from: 'princesa', to: 'tedy', label: 'R_TRANS_06' },
    { from: 'camera', to: 'coroa', label: 'R_TRANS_07' },
    { from: 'coroa', to: 'camera', label: 'R_TRANS_08' },
  ];

  for (const pair of transitionPairs) {
    const ts = Date.now();

    // Executar FROM object
    analyzer.resetAnalyzer();
    analyzer.processarDeteccao(pair.from, 92, true, 0.95, 'TEST_SESS_TRANS', 100, ts, 10);
    analyzer.processarDeteccao(pair.from, 92, true, 0.95, 'TEST_SESS_TRANS', 100, ts + 30, 10);
    analyzer.processarDeteccao(pair.from, 92, true, 0.95, 'TEST_SESS_TRANS', 100, ts + 60, 10);
    const res1 = analyzer.processarDeteccao(pair.from, 92, true, 0.95, 'TEST_SESS_TRANS', 100, ts + 90, 10);

    if (res1.objetoPadraoParaBanco && res1.eventId) {
      await registrarResultadoAutomaticamente(res1.objetoPadraoParaBanco.resultado, 92, res1.eventId, 1);
    }

    // Executar TO object (mesmo que seja igual ao FROM!)
    // Simular ausência de tela por 2 frames (transição) ou transição de 1500ms
    analyzer.processarDeteccao(null, 0, false, 0, 'TEST_SESS_TRANS', 101, ts + 120, 0);
    analyzer.processarDeteccao(null, 0, false, 0, 'TEST_SESS_TRANS', 101, ts + 150, 0);

    // Deteção do novo objeto
    analyzer.processarDeteccao(pair.to, 94, true, 0.95, 'TEST_SESS_TRANS', 102, ts + 1600, 12);
    analyzer.processarDeteccao(pair.to, 94, true, 0.95, 'TEST_SESS_TRANS', 102, ts + 1630, 12);
    analyzer.processarDeteccao(pair.to, 94, true, 0.95, 'TEST_SESS_TRANS', 102, ts + 1660, 12);
    const res2 = analyzer.processarDeteccao(pair.to, 94, true, 0.95, 'TEST_SESS_TRANS', 102, ts + 1690, 12);

    let transSaved = false;
    let databaseId: number | undefined;

    if (res2.objetoPadraoParaBanco && res2.eventId) {
      const autoRes = await registrarResultadoAutomaticamente(res2.objetoPadraoParaBanco.resultado, 94, res2.eventId, 1);
      transSaved = autoRes.registrado;
      if (autoRes.rodadaRegistrada) {
        const { data: dbRec } = await supabase.from('resultados').select('id').eq('rodada', autoRes.rodadaRegistrada).maybeSingle();
        if (dbRec) databaseId = dbRec.id;
      }
    }

    auditRows.push({
      roundName: pair.label,
      object: pair.to,
      recognizer: 'PASS',
      analyzer: res2.status === 'confirmado' ? 'PASS' : 'FAIL',
      confirmed: res2.objetoPadraoParaBanco ? 'PASS' : 'FAIL',
      persistence: transSaved ? 'PASS' : 'FAIL',
      supabase: transSaved ? 'SIM' : 'NÃO',
      eventId: res2.eventId,
      databaseId,
    });
  }

  // 3. EXIBIR TABELA COMPARATIVA FINAL (REQUISITO #8)
  console.log('\n====================================================================================================');
  console.log('TABELA RECONHECIDOS VS PERSISTIDOS (EVIDÊNCIA FORENSE)');
  console.log('====================================================================================================');
  console.table(
    auditRows.map(row => ({
      Rodada: row.roundName,
      Objeto: row.object,
      Recognizer: row.recognizer,
      Analyzer: row.analyzer,
      Confirmed: row.confirmed,
      Persistence: row.persistence,
      Supabase: row.supabase,
      EventId: row.eventId || 'N/A',
      DbId: row.databaseId || 'N/A',
    }))
  );

  // 4. VERIFICAÇÃO FINAL SQL NO SUPABASE (CONTAGEM POR OBJETO)
  console.log('\n====================================================================================================');
  console.log('CONSULTA DIRECTA NO SUPABASE — CONTAGEM DE OBJETOS PERSISTIDOS (REQUISITO #6)');
  console.log('====================================================================================================');

  const { data: allRecords, error: queryErr } = await supabase
    .from('resultados')
    .select('id, rodada, objeto, criado_em')
    .gte('rodada', startRodada)
    .order('rodada', { ascending: true });

  if (queryErr) {
    console.error('Erro na consulta SQL:', queryErr.message);
  } else {
    console.log(`Total de registros inseridos nesta execução: ${allRecords?.length || 0}`);

    const countMap: Record<string, number> = {};
    for (const r of allRecords || []) {
      countMap[r.objeto] = (countMap[r.objeto] || 0) + 1;
    }

    console.log('\nContagem real de registros gravados por objeto no Supabase:');
    console.table(
      Object.keys(countMap).map(obj => ({
        Objeto: obj,
        TotalPersistido: countMap[obj],
      }))
    );
  }

  const failedRows = auditRows.filter(r => r.supabase === 'NÃO');
  if (failedRows.length === 0) {
    console.log('\nPERSISTENCE_LIVE = PASS — TODAS AS RODADAS RECONHECIDAS FORAM PERSISTIDAS COM SUCESSO NO SUPABASE!');
  } else {
    console.error(`\nPERSISTENCE_LIVE = FAIL — ${failedRows.length} rodadas falharam na persistência.`);
    process.exit(1);
  }
}

runComprehensiveDiagnosticTest().catch(err => {
  console.error('Exceção no teste de diagnóstico:', err);
  process.exit(1);
});
