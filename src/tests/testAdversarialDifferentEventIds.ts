import { safeRegistrarResultado } from '../services/backendLiveService';
import { limparMemoriaResultadoService, setAutoPersistEnabled } from '../services/resultadoService';
import { getSupabase } from '../database/supabase';

async function testAdversarialDifferentEventIds() {
  console.log('========================================================================');
  console.log('TESTE ADVERSARIAL — MESMA TELA GERANDO DOIS EVENT_IDS (R001 e R002)');
  console.log('========================================================================\n');

  setAutoPersistEnabled(true);
  limparMemoriaResultadoService();

  const supabase = getSupabase();

  let initialCount = 0;
  if (supabase) {
    const { count } = await supabase.from('resultados').select('*', { count: 'exact', head: true });
    initialCount = count || 0;
  }

  const sessaoId = `test_adv_${Date.now()}`;
  const objeto = 'sorvete';
  const confianca = 95;

  console.log(`>>> Disparando simultaneamente Request A (eventId=R001) e Request B (eventId=R002) para a MESMA tela...`);

  // Dispara duas chamadas concorrentes com EVENT_IDs DIFERENTES para a mesma aparição física da tela
  const promiseA = safeRegistrarResultado(objeto, confianca, 'R001', sessaoId);
  const promiseB = safeRegistrarResultado(objeto, confianca, 'R002', sessaoId);

  const [resA, resB] = await Promise.all([promiseA, promiseB]);

  console.log('\n--- RESULTADOS DAS REQUISIÇÕES CONCORRENTES ---');
  console.log('Request A (R001):', resA);
  console.log('Request B (R002):', resB);

  // Dispara uma terceira chamada (Request C com R003) APÓS o término da primeira, mas ainda na MESMA tela física (sem saída de tela)
  console.log('\n>>> Disparando Request C (eventId=R003) APÓS o término do Request A (sem ter havido saída de tela)...');
  const resC = await safeRegistrarResultado(objeto, confianca, 'R003', sessaoId);
  console.log('Request C (R003):', resC);

  const accepted = [resA, resB, resC].filter((r) => r.registrado);
  const rejected = [resA, resB, resC].filter((r) => !r.registrado);

  console.log(`\nTotal Aceitos: ${accepted.length}`);
  console.log(`Total Rejeitados: ${rejected.length}`);

  let validRejections = false;
  if (rejected.length === 2) {
    const reasons = rejected.map((r) => r.motivo || '');
    const hasLock = reasons.some((r) => r.includes('ROUND_ALREADY_LOCKED'));
    const hasLifecycle = reasons.some((r) => r.includes('DUPLICATE_SCREEN_LIFECYCLE'));
    if (hasLock && hasLifecycle) {
      validRejections = true;
      console.log(`\n[OK] Motivos de Rejeição Válidos Detectados: ROUND_ALREADY_LOCKED & DUPLICATE_SCREEN_LIFECYCLE`);
    } else {
      console.log(`\n[OK] Motivos de Rejeição Válidos Detectados: ${reasons.join(' | ')}`);
      validRejections = reasons.every((r) => r.includes('DUPLICATE_SCREEN_LIFECYCLE') || r.includes('ROUND_ALREADY_LOCKED'));
    }
  }

  let finalCount = 0;
  let recordsInserted = 0;
  if (supabase) {
    const { count } = await supabase.from('resultados').select('*', { count: 'exact', head: true });
    finalCount = count || 0;
    recordsInserted = finalCount - initialCount;
  } else {
    recordsInserted = accepted.length;
  }

  console.log('\n--- VERIFICAÇÃO FINAL ---');
  console.log(`Registros Inseridos no Banco: ${recordsInserted}`);
  console.log(`Rejeitado com ROUND_ALREADY_LOCKED & DUPLICATE_SCREEN_LIFECYCLE: ${validRejections ? 'SIM' : 'NÃO'}`);

  const passed = accepted.length === 1 && rejected.length === 2 && validRejections && recordsInserted === 1;

  console.log('\n==================================================');
  if (passed) {
    console.log('STATUS DO TESTE ADVERSARIAL: ✅ PASSED');
    console.log('1 Tela -> 1 Rodada -> 1 EventId Aceito -> 1 INSERT no Banco');
  } else {
    console.error('STATUS DO TESTE ADVERSARIAL: ❌ FAILED');
  }
  console.log('==================================================');

  if (!passed) {
    process.exit(1);
  }
}

testAdversarialDifferentEventIds().catch((err) => {
  console.error('Erro ao executar teste adversarial:', err);
  process.exit(1);
});
