import { Router } from 'express';
import {
  obterRelatorioEstatisticoCompleto,
  calcularProbabilidadeCondicional,
} from '../services/estatisticaService';
import { StatisticsEngine } from '../services/StatisticsEngine';
import { getSupabase } from '../database/supabase';
import { getCutoffTimestamp } from '../services/limpezaState';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/engine/last-results
 * Retorna os últimos N resultados do StatisticsEngine
 */
router.get('/engine/last-results', async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || '10'), 10);
    const resultado = await StatisticsEngine.getLastResults(limit);
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro em GET /api/engine/last-results:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro ao buscar últimos resultados' });
  }
});

/**
 * GET /api/engine/next-after
 * Analisa o que vem imediatamente depois do objeto fornecido
 */
router.get('/engine/next-after', async (req, res) => {
  try {
    const objectParam = String(req.query.object || req.query.objeto || 'soco');
    const resultado = await StatisticsEngine.getNextAfter(objectParam);
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro em GET /api/engine/next-after:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro ao calcular próximo após objeto' });
  }
});

/**
 * GET /api/engine/frequency
 * Frequência geral e porcentagem de cada símbolo
 */
router.get('/engine/frequency', async (req, res) => {
  try {
    const resultado = await StatisticsEngine.getFrequency();
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro em GET /api/engine/frequency:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro ao calcular frequências' });
  }
});

/**
 * GET /api/engine/sequences
 * Análise de sequências e padrões
 */
router.get('/engine/sequences', async (req, res) => {
  try {
    const resultado = await StatisticsEngine.getSequences();
    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro em GET /api/engine/sequences:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro ao analisar sequências' });
  }
});

/**
 * GET /api/estatisticas
 * Retorna o relatório estatístico oficial e completo centralizado pelo Motor Estatístico.
 */
router.get('/estatisticas', async (req, res) => {
  try {
    const forceRefresh = req.query.forceRefresh === 'true';
    const relatorio = await obterRelatorioEstatisticoCompleto(forceRefresh);

    if (relatorio.dadosInsuficientes) {
      return res.status(200).json({
        sucesso: false,
        dadosInsuficientes: true,
        mensagem: relatorio.mensagemInsuficiencia || 'Base histórica insuficiente para uma análise confiável.',
        frequencias: relatorio.frequencias,
        atrasos: relatorio.atrasos,
        intervalos: relatorio.intervalos,
        distribuicao: relatorio.distribuicao,
        desvios: relatorio.desvios,
        confianca: relatorio.confianca,
      });
    }

    return res.json({
      sucesso: true,
      frequencias: relatorio.frequencias,
      atrasos: relatorio.atrasos,
      intervalos: relatorio.intervalos,
      distribuicao: relatorio.distribuicao,
      desvios: relatorio.desvios,
      confianca: relatorio.confianca,
      tempoCalculoMs: relatorio.tempoCalculoMs,
      rodadasUtilizadas: relatorio.rodadasUtilizadas,
      fromCache: relatorio.fromCache,
    });
  } catch (error: any) {
    logger.error('Erro no endpoint GET /api/estatisticas:', error?.message);
    return res.status(500).json({
      error: error?.message || 'Erro ao calcular estatísticas do sistema.',
    });
  }
});

/**
 * POST /api/estatisticas/condicional
 * Calcula probabilidades condicionais para uma sequência de objetos dada.
 */
router.post('/estatisticas/condicional', async (req, res) => {
  try {
    const { sequencia } = req.body;
    if (!Array.isArray(sequencia) || sequencia.length === 0) {
      return res.status(400).json({
        error: 'É necessário fornecer um array "sequencia" com os objetos anteriores.',
      });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase não disponível.' });
    }

    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('objeto');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data } = await query.order('criado_em', { ascending: true });

    const itensMaisAntigosPrimeiro = (data || [])
      .map((row) => ({ objeto: String(row.objeto || (row as any).item || '').toLowerCase().trim() }))
      .filter((row) => row.objeto.length > 0);

    const resultadoCondicional = calcularProbabilidadeCondicional(
      sequencia,
      itensMaisAntigosPrimeiro
    );

    return res.json(resultadoCondicional);
  } catch (error: any) {
    logger.error('Erro no endpoint POST /api/estatisticas/condicional:', error?.message);
    return res.status(500).json({
      error: error?.message || 'Erro ao calcular probabilidade condicional.',
    });
  }
});

export default router;
