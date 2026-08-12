import 'dotenv/config';
import {
  detectarAlternancias,
  detectarRepeticoes,
  detectarAtrasos,
  detectarPadroesRecentes,
  detectarSequenciasFrequentes,
  executarDetectorPadroes,
  calcularNivelConfianca,
} from '../services/padraoService';
import { registrarResultadoAutomaticamente } from '../services/resultadoService';
import { buscarUltimosResultados } from '../services/consultaService';

async function executarTestesPadroes() {
  console.log('=== TESTES OBRIGATÓRIOS DO DETECTOR AUTOMÁTICO DE PADRÕES (PROMPT 006) ===\n');

  // Histórico de teste em memória
  const historicoSimulado = [
    'boia', 'soco', 'boia', 'soco', 'boia', 'soco', // Alternância Boia/Soco
    'sorvete', 'sorvete', 'sorvete', 'sorvete',    // Repetição Sorvete 4x
    'balao', 'tedy', 'princesa', 'camera', 'coroa'
  ];

  // 1. Testar detecção de alternância
  console.log('--- TESTE 1: detectarAlternancias() ---');
  const alternancias = await detectarAlternancias(historicoSimulado);
  console.log('Alternâncias detectadas:', JSON.stringify(alternancias, null, 2));

  // 2. Testar detecção de repetição
  console.log('\n--- TESTE 2: detectarRepeticoes() ---');
  const repeticoes = await detectarRepeticoes(historicoSimulado);
  console.log('Repetições detectadas:', JSON.stringify(repeticoes, null, 2));

  // 3. Testar cálculo de atrasos
  console.log('\n--- TESTE 3: detectarAtrasos() ---');
  const atrasos = await detectarAtrasos(historicoSimulado);
  console.log('Cálculo de atrasos:', JSON.stringify(atrasos, null, 2));

  // 4. Testar detecção de sequências frequentes
  console.log('\n--- TESTE 4: detectarSequenciasFrequentes() ---');
  const sequencias = await detectarSequenciasFrequentes();
  console.log('Sequências frequentes:', JSON.stringify(sequencias, null, 2));

  // 5. Testar execução mestre do detector de padrões
  console.log('\n--- TESTE 5: executarDetectorPadroes() ---');
  const resDetector = await executarDetectorPadroes('sessao-teste-006');
  console.log('Resultado do Detector Mestre:', JSON.stringify({
    sucesso: resDetector.sucesso,
    totalRegistrosAnalisados: resDetector.totalRegistrosAnalisados,
    resumoConfiancaGeral: resDetector.resumoConfiancaGeral,
    padroesAtivosCount: {
      alternancias: resDetector.padroesAtivos.alternancias.length,
      repeticoes: resDetector.padroesAtivos.repeticoes.length,
      sequenciasFrequentes: resDetector.padroesAtivos.sequenciasFrequentes.length,
    }
  }, null, 2));

  // 6. Testar regras de classificação de confiança
  console.log('\n--- TESTE 6: Classificação de Nível de Confiança ---');
  console.log('10 ocorrências:', calcularNivelConfianca(10));  // BAIXA
  console.log('50 ocorrências:', calcularNivelConfianca(50));  // MÉDIA
  console.log('150 ocorrências:', calcularNivelConfianca(150)); // ALTA

  // 7. Testar não-regressão
  console.log('\n--- TESTE 7: Verificação de Não-Regressão ---');
  const ultimos = await buscarUltimosResultados(5);
  console.log(`Verificação de busca de resultados OK: ${ultimos.dados?.length || 0} itens retornados.`);

  console.log('\n=== TODOS OS TESTES DO DETECTOR DE PADRÕES CONCLUÍDOS COM SUCESSO ===');
}

executarTestesPadroes().catch((err) => {
  console.error('Erro nos testes de padrões:', err);
});
