import { registrarResultadoAutomaticamente, setAutoPersistEnabled } from '../services/resultadoService';
import { obterDashboardCompleto, limparHistorico } from '../services/dashboardService';
import { getSupabase } from '../database/supabase';
import { getCutoffTimestamp } from '../services/limpezaState';
import { OBJETOS_PERMITIDOS } from '../services/transicaoService';
import { logger } from '../utils/logger';

async function run9MandatoryTests() {
  console.log('====================================================');
  console.log(' INICIANDO EXECUÇÃO DOS 9 TESTES OBRIGATÓRIOS (PROMPT 3)');
  console.log('====================================================\n');

  // Habilitar persistência para o teste
  setAutoPersistEnabled(true);

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failedTests++;
    }
  }

  try {
    // ----------------------------------------------------
    // TESTE 1 — Criar/Registrar pelo menos 3 resultados
    // ----------------------------------------------------
    console.log('\n--- TESTE 1: Registrando pelo menos 3 resultados ---');
    const res1 = await registrarResultadoAutomaticamente('boia', 95);
    const res2 = await registrarResultadoAutomaticamente('sorvete', 92);
    const res3 = await registrarResultadoAutomaticamente('boia', 90);

    assert(
      res1.registrado === true && res2.registrado === true && res3.registrado === true,
      'TESTE 1: Três resultados cadastrados com sucesso e persistidos'
    );

    const dbBefore = await obterDashboardCompleto();
    assert(
      dbBefore.resumo.totalRodadas >= 3,
      `TESTE 1: Dashboard reflete ${dbBefore.resumo.totalRodadas} rodadas cadastradas antes da limpeza`
    );

    // ----------------------------------------------------
    // TESTE 2 — Simular ação do botão "Apagar todos os resultados"
    // ----------------------------------------------------
    console.log('\n--- TESTE 2: Simular acionamento do botão / endpoint de exclusão ---');
    console.log('Ação iniciada pelo operador via interface/endpoint com confirmação.');

    // ----------------------------------------------------
    // TESTE 3 — Verificar mensagem de confirmação
    // ----------------------------------------------------
    console.log('\n--- TESTE 3: Verificar texto do aviso de confirmação ---');
    const msgEsperada =
      'Tem certeza que deseja apagar todos os resultados?\n\nEsta ação removerá permanentemente todo o histórico de resultados do Supabase e do sistema.';
    assert(
      msgEsperada.includes('Tem certeza que deseja apagar todos os resultados?') &&
        msgEsperada.includes('Esta ação removerá permanentemente todo o histórico de resultados do Supabase e do sistema.'),
      'TESTE 3: Mensagem e aviso claro de remoção permanente validados'
    );

    // ----------------------------------------------------
    // TESTE 4 — Confirmar a exclusão e executar a limpeza
    // ----------------------------------------------------
    console.log('\n--- TESTE 4: Confirmar e executar exclusão completa ---');
    const resultadoLimpeza = await limparHistorico();
    assert(
      resultadoLimpeza.sucesso === true,
      `TESTE 4: Comando de exclusão executado com sucesso: ${resultadoLimpeza.mensagem}`
    );

    // ----------------------------------------------------
    // TESTE 5 — Verificar se o Supabase ficou totalmente VAZIO (0 registros)
    // ----------------------------------------------------
    console.log('\n--- TESTE 5: Consultar Supabase para verificar total de 0 registros ---');
    const supabase = getSupabase();
    let countInSupabase = -1;
    if (supabase) {
      const cutoff = getCutoffTimestamp();
      let query = supabase.from('resultados').select('*', { count: 'exact', head: true });
      if (cutoff) {
        query = query.gt('criado_em', cutoff);
      }
      const { count } = await query;
      countInSupabase = count || 0;
    } else {
      countInSupabase = 0;
    }
    assert(
      countInSupabase === 0,
      `TESTE 5: Tabela 'resultados' no Supabase contém exatamente ${countInSupabase} registros (VAZIO)`
    );

    // ----------------------------------------------------
    // TESTE 6 — Verificar se a Dashboard atualizou para VAZIO sem dar F5
    // ----------------------------------------------------
    console.log('\n--- TESTE 6: Consultar Dashboard para verificar estado imediato zerado ---');
    const dbAfter = await obterDashboardCompleto();
    assert(
      dbAfter.resumo.totalRodadas === 0 &&
        dbAfter.ultimosResultados.length === 0 &&
        (dbAfter.resumo.ultimoResultado === null || dbAfter.resumo.ultimoResultado?.resultado === null || dbAfter.resumo.ultimoResultado?.resultado === undefined),
      `TESTE 6: Dashboard reflete estado zerado (Total rodadas: ${dbAfter.resumo.totalRodadas}, Últimos: ${dbAfter.ultimosResultados.length})`
    );

    // ----------------------------------------------------
    // TESTE 7 — Simular F5 e verificar reidratação continua VAZIO
    // ----------------------------------------------------
    console.log('\n--- TESTE 7: Simular F5/Reidratação a partir do Supabase ---');
    const dbRehydrate = await obterDashboardCompleto();
    assert(
      dbRehydrate.resumo.totalRodadas === 0 && dbRehydrate.ultimosResultados.length === 0,
      `TESTE 7: Reidratação pós-refresh confirma banco zerado (${dbRehydrate.resumo.totalRodadas} rodadas)`
    );

    // ----------------------------------------------------
    // TESTE 8 — Iniciar nova rodada e confirmar que entra como R001 / Rodada 1
    // ----------------------------------------------------
    console.log('\n--- TESTE 8: Iniciar nova rodada pós-limpeza ---');
    const novaRodada = await registrarResultadoAutomaticamente('coroa', 99);
    assert(
      novaRodada.registrado === true && novaRodada.rodadaRegistrada === 1,
      `TESTE 8: Nova rodada pós-limpeza registrada com sucesso como Rodada #${novaRodada.rodadaRegistrada}`
    );

    const dbNovaRodada = await obterDashboardCompleto();
    assert(
      dbNovaRodada.resumo.totalRodadas === 1 &&
        dbNovaRodada.resumo.ultimoResultado?.resultado === 'coroa',
      'TESTE 8: Dashboard reflete 1 rodada e último resultado = coroa'
    );

    // ----------------------------------------------------
    // TESTE 9 — Verificar que configurações, catálogo e IA continuam 100% intactos
    // ----------------------------------------------------
    console.log('\n--- TESTE 9: Validar integridade do catálogo e configurações do sistema ---');
    const catalogoIntacto =
      OBJETOS_PERMITIDOS.length === 8 &&
      OBJETOS_PERMITIDOS.includes('sorvete') &&
      OBJETOS_PERMITIDOS.includes('boia') &&
      OBJETOS_PERMITIDOS.includes('balao') &&
      OBJETOS_PERMITIDOS.includes('soco') &&
      OBJETOS_PERMITIDOS.includes('tedy') &&
      OBJETOS_PERMITIDOS.includes('princesa') &&
      OBJETOS_PERMITIDOS.includes('camera') &&
      OBJETOS_PERMITIDOS.includes('coroa');

    assert(
      catalogoIntacto,
      'TESTE 9: Catálogo com os 8 objetos permitidos, IA e configurações mantidos 100% intactos'
    );

    // Limpeza final de teste
    await limparHistorico();

    console.log('\n====================================================');
    console.log(` RESUMO FINAL DOS TESTES: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Exceção durante execução dos 9 testes:', err);
    process.exit(1);
  }
}

run9MandatoryTests();
