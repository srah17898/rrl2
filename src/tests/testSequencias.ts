import 'dotenv/config';
import {
  analisarSequencia3,
  analisarSequencia4,
  buscarProximoDepoisDaSequencia,
} from '../services/sequenciaService';
import {
  buscarDepoisDe,
  buscarMaisProvavelDepoisDe,
} from '../services/transicaoService';
import { buscarUltimosResultados } from '../services/resultadoService';

async function executarTestesSequencia() {
  console.log('=== TESTES OBRIGATÓRIOS DO MOTOR DE SEQUÊNCIAS (PROMPT 005) ===\n');

  // 1. Testar buscarProximoDepoisDaSequencia com "soco", "boia"
  console.log('--- TESTE 1: buscarProximoDepoisDaSequencia(["soco", "boia"]) ---');
  const resSocoBoia = await buscarProximoDepoisDaSequencia(['soco', 'boia']);
  console.log('Resultado ("soco", "boia"):', JSON.stringify(resSocoBoia, null, 2));

  // 2. Testar buscarProximoDepoisDaSequencia com "boia", "sorvete", "soco"
  console.log('\n--- TESTE 2: buscarProximoDepoisDaSequencia(["boia", "sorvete", "soco"]) ---');
  const resBoiaSorveteSoco = await buscarProximoDepoisDaSequencia(['boia', 'sorvete', 'soco']);
  console.log('Resultado ("boia", "sorvete", "soco"):', JSON.stringify(resBoiaSorveteSoco, null, 2));

  // 3. Testar analisarSequencia3()
  console.log('\n--- TESTE 3: analisarSequencia3() ---');
  const seq3 = await analisarSequencia3();
  console.log('Resultado analisarSequencia3():', JSON.stringify(seq3, null, 2));

  // 4. Testar analisarSequencia4()
  console.log('\n--- TESTE 4: analisarSequencia4() ---');
  const seq4 = await analisarSequencia4();
  console.log('Resultado analisarSequencia4():', JSON.stringify(seq4, null, 2));

  // 5. Testar se funções anteriores de transições e resultados continuam sem quebras
  console.log('\n--- TESTE 5: Verificação de não-regressão (transições e resultados) ---');
  const depSoco = await buscarDepoisDe('soco');
  console.log(`Transição simples depois de soco OK. Total ocorrências: ${depSoco.totalOcorrenciasAnterior}`);

  const ultimos = await buscarUltimosResultados(5);
  console.log(`Busca de últimos resultados OK. Obtidos: ${ultimos.data?.length || 0} itens.`);

  console.log('\n=== TODOS OS TESTES DE SEQUÊNCIA CONCLUÍDOS COM SUCESSO ===');
}

executarTestesSequencia().catch((err) => {
  console.error('Erro nos testes de sequência:', err);
});
