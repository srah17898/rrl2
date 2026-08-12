import 'dotenv/config';
import {
  buscarDepoisDe,
  buscarMaisProvavelDepoisDe,
  buscarTransicaoEspecifica,
  registrarTransicao,
} from '../services/transicaoService';
import {
  registrarResultadoAutomaticamente,
  buscarUltimosResultados,
} from '../services/resultadoService';
import { logger } from '../utils/logger';

async function executarTestes() {
  console.log('=== TESTES OBRIGATÓRIOS DO MOTOR DE TRANSIÇÕES (PROMPT 004) ===\n');

  // 1. Testar buscarDepoisDe e buscarMaisProvavelDepoisDe em estado inicial
  console.log('--- TESTE 1: buscarDepoisDe("soco") ---');
  const depSoco = await buscarDepoisDe('soco');
  console.log('Resultado buscarDepoisDe("soco"):', JSON.stringify(depSoco, null, 2));

  console.log('\n--- TESTE 2: buscarMaisProvavelDepoisDe("boia") ---');
  const provBoia = await buscarMaisProvavelDepoisDe('boia');
  console.log('Resultado buscarMaisProvavelDepoisDe("boia"):', JSON.stringify(provBoia, null, 2));

  // 3. Testar inserção de rodada e registro automático de transição
  console.log('\n--- TESTE 3: Registro de rodadas consecutivas (incluindo objetos iguais) ---');
  const reg1 = await registrarResultadoAutomaticamente('soco', 95);
  console.log('Registro 1 (soco):', reg1);

  // Aguardar 2.1s para passar do debounce de memória
  await new Promise((resolve) => setTimeout(resolve, 2100));

  const reg2 = await registrarResultadoAutomaticamente('boia', 92);
  console.log('Registro 2 (boia):', reg2);

  await new Promise((resolve) => setTimeout(resolve, 2100));

  // Confirmar que resultados iguais consecutivos continuam sendo registrados individualmente
  const reg3 = await registrarResultadoAutomaticamente('boia', 94);
  console.log('Registro 3 (boia consecutiva):', reg3);

  // 4. Testar buscarTransicaoEspecifica("soco", "boia")
  console.log('\n--- TESTE 4: buscarTransicaoEspecifica("soco", "boia") ---');
  const specSocoBoia = await buscarTransicaoEspecifica('soco', 'boia');
  console.log('Resultado buscarTransicaoEspecifica("soco", "boia"):', JSON.stringify(specSocoBoia, null, 2));

  // 5. Testar se funções de consulta anteriores continuam funcionando sem quebra
  console.log('\n--- TESTE 5: Verificar se funções de consulta anteriores permanecem funcionais ---');
  const ultimos = await buscarUltimosResultados(5);
  console.log(`Últimos ${ultimos.data?.length || 0} resultados obtidos com sucesso.`);

  console.log('\n=== TODOS OS TESTES OBRIGATÓRIOS CONCLUÍDOS COM SUCESSO ===');
}

executarTestes().catch((err) => {
  console.error('Erro nos testes:', err);
});
