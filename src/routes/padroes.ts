import { Router } from 'express';
import { executarDetectorPadroes } from '../services/padraoService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/padroes
 * Retorna os padrões ativos, padrões recentes e nível de confiança calculados do histórico real.
 */
router.get('/padroes', async (req, res) => {
  try {
    const resultado = await executarDetectorPadroes();
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro na rota GET /api/padroes:', error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || 'Erro ao processar a detecção de padrões.',
    });
  }
});

export default router;
