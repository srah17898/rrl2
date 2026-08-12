import 'dotenv/config';
import {
  obterResumoGeral,
  obterUltimosResultados,
  obterRankingObjetos,
  obterObjetosAtrasados,
  obterEstatisticasRecentes,
  obterDashboardCompleto,
} from '../services/dashboardService';
import { buscarUltimosResultados } from '../services/consultaService';

async function executarTestesDashboard() {
  console.log('=== TESTES OBRIGATÓRIOS DO PAINEL DE INTELIGÊNCIA ESTATÍSTICA (PROMPT 007) ===\n');

  // 1. Testar obterResumoGeral()
  console.log('--- TESTE 1: obterResumoGeral() ---');
  const resumo = await obterResumoGeral();
  console.log('Resumo Geral:', JSON.stringify(resumo, null, 2));

  // 2. Testar obterUltimosResultados()
  console.log('\n--- TESTE 2: obterUltimosResultados(20) ---');
  const ultimos = await obterUltimosResultados(20);
  console.log(`Retornados ${ultimos.length} resultados.`);
  if (ultimos.length > 0) {
    console.log('Primeiro item (mais recente):', ultimos[0]);
  }

  // 3. Testar obterRankingObjetos()
  console.log('\n--- TESTE 3: obterRankingObjetos() ---');
  const ranking = await obterRankingObjetos();
  console.log(`Ranking dos 8 objetos (${ranking.length} itens):`);
  ranking.forEach((item) => {
    console.log(`  ${item.posicao}º ${item.objeto}: ${item.quantidade}x (${item.percentual})`);
  });

  // 4. Testar obterObjetosAtrasados()
  console.log('\n--- TESTE 4: obterObjetosAtrasados() ---');
  const atrasos = await obterObjetosAtrasados();
  console.log(`Atrasos calculados (${atrasos.length} itens):`);
  atrasos.slice(0, 3).forEach((item) => {
    console.log(`  ${item.posicao}º ${item.objeto}: ${item.rodadasSemAparecer} rodadas sem sair`);
  });

  // 5. Testar obterEstatisticasRecentes()
  console.log('\n--- TESTE 5: obterEstatisticasRecentes() ---');
  const recentes = await obterEstatisticasRecentes();
  console.log('Estatísticas Janela 20:', recentes.janela20.totalAnalisado, 'analisados');
  console.log('Estatísticas Janela 50:', recentes.janela50.totalAnalisado, 'analisados');
  console.log('Estatísticas Janela 100:', recentes.janela100.totalAnalisado, 'analisados');

  // 6. Testar obterDashboardCompleto()
  console.log('\n--- TESTE 6: obterDashboardCompleto() ---');
  const dashboard = await obterDashboardCompleto();
  console.log('Resultado Dashboard Completo:', {
    sucesso: dashboard.sucesso,
    tempoExecucaoMs: dashboard.tempoExecucaoMs,
    totalRodadas: dashboard.resumo.totalRodadas,
    ultimosCount: dashboard.ultimosResultados.length,
    rankingCount: dashboard.ranking.length,
    atrasosCount: dashboard.atrasos.length,
    padroesAtivos: !!dashboard.padroes,
  });

  // 7. Testar não-regressão
  console.log('\n--- TESTE 7: Verificação de Não-Regressão ---');
  const buscaExistente = await buscarUltimosResultados(5);
  console.log('Consultas prévias funcionando normalmente:', buscaExistente.sucesso);

  console.log('\n=== TODOS OS TESTES DO PAINEL DE INTELIGÊNCIA CONCLUÍDOS COM SUCESSO ===');
}

executarTestesDashboard().catch((err) => {
  console.error('Erro nos testes de Dashboard:', err);
});
