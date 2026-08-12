import { Router } from 'express';
import { obterDashboardCompleto, limparHistorico } from '../services/dashboardService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/dashboard
 * Retorna os dados centralizados do Painel de Inteligência Estatística (resumo, últimos 20, ranking, atrasos, padrões, recentes).
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dadosDashboard = await obterDashboardCompleto();
    return res.json(dadosDashboard);
  } catch (error: any) {
    logger.error('Erro no endpoint GET /api/dashboard:', error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || 'Erro ao carregar os dados do Painel de Inteligência.',
    });
  }
});

/**
 * DELETE /api/dashboard/results
 * Apaga todo o histórico de resultados do Supabase e do sistema.
 */
router.delete('/dashboard/results', async (req, res) => {
  try {
    const resultado = await limparHistorico();
    if (!resultado.sucesso) {
      return res.status(500).json(resultado);
    }
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro no endpoint DELETE /api/dashboard/results:', error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || 'Erro ao apagar histórico de resultados.',
    });
  }
});

export default router;
