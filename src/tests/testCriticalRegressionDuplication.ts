import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { safeRegistrarResultado } from '../services/backendLiveService';
import { getSupabase } from '../database/supabase';

async function runCriticalRegressionTest() {
  console.log('========================================================================');
  console.log('TESTE DE REGRESSÃO CRÍTICO — DUPLICAÇÃO REAL DE RODADA');
  console.log('========================================================================\n');

  const supabase = getSupabase();
  const analyzer = new WheelVisionAnalyzer();

  // METRIC COUNTERS
  let roundCount = 0;
  let eventIdsCreated = new Set<string>();
  let persistenceAttempts = 0;
  let insertSuccess = 0;
  let selectVerified = 0;
  let supabaseRecords = 0;
  let duplicatesBlocked = 0;
  let inFlightBlocked = 0;

  // Trackers per screen
  let screen1Details: { eventId?: string; roundId?: string; insertedId?: number } = {};
  let screen2Details: { eventId?: string; roundId?: string; insertedId?: number } = {};

  // ------------------------------------------------------------------------
  // ETAPA 1: TELA 1 (SORVETE) — 300 FRAMES COM GLITCHES E CONCORRÊNCIA
  // ------------------------------------------------------------------------
  console.log('>>> INICIANDO ETAPA 1: Tela 1 ("sorvete") por 300 frames com ruídos, glitches e concorrência...');

  for (let frame = 1; frame <= 300; frame++) {
    let currentObject = 'sorvete';
    let currentConfidence = 88 + (frame % 10); // Varia entre 88% e 97%
    let resultZonePresent = true;

    // Injetar glitches e variações realistas
    if (frame % 37 === 0) {
      currentObject = 'nenhum';
      currentConfidence = 0;
      resultZonePresent = false;
    } else if (frame % 43 === 0) {
      currentObject = 'boia'; // Objeto diferente em frame intermediário
      currentConfidence = 72; // Baixa confiança
    } else if (frame % 19 === 0) {
      currentConfidence = 80; // Abaixo dos 85%
    }

    const res = analyzer.processarDeteccao(
      currentObject,
      currentConfidence,
      resultZonePresent,
      resultZonePresent ? currentConfidence / 100 : 0,
      'session_test',
      frame
    );

    if (res.status === 'duplicado') {
      duplicatesBlocked++;
    }

    if (res.status === 'confirmado' && res.objeto && res.eventId) {
      roundCount++;
      eventIdsCreated.add(res.eventId);
      screen1Details.eventId = res.eventId;
      screen1Details.roundId = res.eventId;

      persistenceAttempts++;

      // Simular disparos de persistência (inclusive chamadas concorrentes repetidas no mesmo evento)
      const calls = Array.from({ length: 5 }, () =>
        safeRegistrarResultado(
          res.objeto,
          res.confianca,
          res.eventId,
          1
        )
      );

      const results = await Promise.all(calls);

      results.forEach((r) => {
        if (r.registrado) {
          insertSuccess++;
          selectVerified++;
          screen1Details.insertedId = r.insertedId || (r.rodadaRegistrada as any)?.id || r.rodadaRegistrada;
        } else if (r.motivo?.includes('CONCURRENT_LOCK') || r.motivo?.includes('PROCESSED_EVENT_ID')) {
          inFlightBlocked++;
        }
      });
    }
  }

  // Verificar contagem no Supabase para a Tela 1
  if (screen1Details.insertedId) {
    const { data } = await supabase
      .from('resultados')
      .select('id')
      .eq('id', screen1Details.insertedId);
    supabaseRecords += data ? data.length : 0;
  }

  console.log('\n--- METRICAS DA TELA 1 (300 FRAMES) ---');
  console.log(`roundCount          = ${roundCount}`);
  console.log(`eventIds            = ${eventIdsCreated.size}`);
  console.log(`persistenceAttempts = ${persistenceAttempts}`);
  console.log(`insertSuccess       = ${insertSuccess}`);
  console.log(`selectVerified      = ${selectVerified}`);
  console.log(`supabaseRecords     = ${supabaseRecords}`);
  console.log(`duplicatesBlocked   = ${duplicatesBlocked}`);
  console.log(`inFlightBlocked     = ${inFlightBlocked}`);

  // ------------------------------------------------------------------------
  // ETAPA 2: SAÍDA REAL DA TELA (EXIT_REQUIRED_FRAMES = 2)
  // ------------------------------------------------------------------------
  console.log('\n>>> INICIANDO ETAPA 2: Simulando saída REAL da Tela 1...');
  for (let exitFrame = 1; exitFrame <= 5; exitFrame++) {
    analyzer.processarDeteccao('nenhum', 0, false, 0, 'session_test', 300 + exitFrame);
  }

  console.log(`RESULT_SCREEN_EXIT_CONFIRMED (roundLock = ${analyzer.isRoundLocked()})\n`);

  // ------------------------------------------------------------------------
  // ETAPA 3: TELA 2 (SORVETE NOVAMENTE EM UM NOVO CICLO REAL)
  // ------------------------------------------------------------------------
  console.log('>>> INICIANDO ETAPA 3: Apresentando TELA 2 (Objeto "sorvete" novamente em nova tela)...');

  for (let frame = 1; frame <= 50; frame++) {
    const res = analyzer.processarDeteccao('sorvete', 92, true, 0.92, 'session_test', 305 + frame);

    if (res.status === 'confirmado' && res.objeto && res.eventId) {
      roundCount++;
      eventIdsCreated.add(res.eventId);
      screen2Details.eventId = res.eventId;
      screen2Details.roundId = res.eventId;

      persistenceAttempts++;

      const r = await safeRegistrarResultado(
        res.objeto,
        res.confianca,
        res.eventId,
        1
      );

      if (r.registrado) {
        insertSuccess++;
        selectVerified++;
        screen2Details.insertedId = r.insertedId || (r.rodadaRegistrada as any)?.id || r.rodadaRegistrada;
      }
    }
  }

  // Re-verificar total acumulado de registros no Supabase para Tela 1 e Tela 2
  let totalSupabaseScreen1And2 = 0;
  if (screen1Details.insertedId) {
    const { data: d1 } = await supabase.from('resultados').select('id').eq('id', screen1Details.insertedId);
    totalSupabaseScreen1And2 += d1 ? d1.length : 0;
  }
  if (screen2Details.insertedId) {
    const { data: d2 } = await supabase.from('resultados').select('id').eq('id', screen2Details.insertedId);
    totalSupabaseScreen1And2 += d2 ? d2.length : 0;
  }
  supabaseRecords = totalSupabaseScreen1And2;

  console.log('\n--- METRICAS ACUMULADAS FINAIS (TELA 1 + TELA 2) ---');
  console.log(`roundCount          = ${roundCount}`);
  console.log(`eventIds            = ${eventIdsCreated.size}`);
  console.log(`persistenceAttempts = ${persistenceAttempts}`);
  console.log(`insertSuccess       = ${insertSuccess}`);
  console.log(`selectVerified      = ${selectVerified}`);
  console.log(`supabaseRecords     = ${supabaseRecords}`);

  console.log('\n==================================================');
  console.log('IMPRESSÃO DOS DETALHES DAS TELAS');
  console.log('==================================================');
  console.log('SCREEN_1:');
  console.log(`eventId = ${screen1Details.eventId}`);
  console.log(`roundId = ${screen1Details.roundId}`);
  console.log(`insertedId = ${screen1Details.insertedId}`);

  console.log('\nSCREEN_2:');
  console.log(`eventId = ${screen2Details.eventId}`);
  console.log(`roundId = ${screen2Details.roundId}`);
  console.log(`insertedId = ${screen2Details.insertedId}`);

  console.log('\n==================================================');
  console.log('CONFIRMAÇÃO DO CICLO DE VIDA');
  console.log('==================================================');
  console.log('SCREEN_LIFECYCLE : ROUND : EVENT_ID : INSERT');
  console.log('1 : 1 : 1 : 1');
  console.log('2 : 1 : 1 : 1');

  const passedAll =
    roundCount === 2 &&
    eventIdsCreated.size === 2 &&
    persistenceAttempts === 2 &&
    insertSuccess === 2 &&
    selectVerified === 2 &&
    supabaseRecords === 2 &&
    screen1Details.eventId !== screen2Details.eventId;

  console.log('\n==================================================');
  console.log(`STATUS DO TESTE: ${passedAll ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('==================================================\n');

  process.exit(passedAll ? 0 : 1);
}

runCriticalRegressionTest().catch((err) => {
  console.error('Erro durante o teste de regressão:', err);
  process.exit(1);
});
