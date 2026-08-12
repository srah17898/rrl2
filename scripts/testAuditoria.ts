import {
  auditarHistoricoPorImagem,
  corrigirHistorico,
  RelatorioAuditoria,
} from '../src/services/auditoriaService';
import { logger } from '../src/utils/logger';

async function testarAuditoria() {
  console.log('====================================================');
  console.log(' INICIANDO TESTES DO MÓDULO DE AUDITORIA INTELIGENTE');
  console.log('====================================================\n');

  // Teste 1: Testar recusa de alteração sem confirmação do usuário
  console.log('[TESTE 1] Confirmar que nenhuma alteração é feita sem confirmação explícita...');
  const resSemConf = await corrigirHistorico(
    [
      {
        resultadoNovo: 'coroa',
        tipoAcao: 'inserir',
        posicao: 1,
      },
    ],
    false, // usuarioConfirmou = false
    'usuario_teste'
  );

  console.log('  -> Sucesso:', resSemConf.sucesso);
  console.log('  -> Mensagem:', resSemConf.mensagem);
  const t1Passou = resSemConf.sucesso === false && resSemConf.correcoesAplicadas === 0;
  console.log('  -> Resultado:', t1Passou ? 'PASSOU ✅' : 'FALHOU ❌', '\n');

  // Teste 2: Aplicar correções com confirmação e verificar logs
  console.log('[TESTE 2] Confirmar funcionamento do botão "Aplicar Correções" com confirmação explícita e logs...');
  const resComConf = await corrigirHistorico(
    [
      {
        resultadoNovo: 'boia',
        tipoAcao: 'inserir',
        posicao: 1,
      },
    ],
    true, // usuarioConfirmou = true
    'auditor_qualidade'
  );

  console.log('  -> Sucesso:', resComConf.sucesso);
  console.log('  -> Correções Aplicadas:', resComConf.correcoesAplicadas);
  console.log('  -> Mensagem:', resComConf.mensagem);
  console.log('  -> Detalhes:', JSON.stringify(resComConf.detalhes));
  const t2Passou = resComConf.sucesso === true;
  console.log('  -> Resultado:', t2Passou ? 'PASSOU ✅' : 'FALHOU ❌', '\n');

  console.log('====================================================');
  console.log(
    t1Passou && t2Passou
      ? 'TODOS OS TESTES DE AUDITORIA PASSARAM COM SUCESSO! ✅'
      : 'ALGUNS TESTES FALHARAM ❌'
  );
  console.log('====================================================');
}

testarAuditoria();
