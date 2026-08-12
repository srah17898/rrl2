import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { OBJETOS_PERMITIDOS } from './transicaoService';
import { obterSessaoAtual } from './sessaoService';
import {
  executarDetectorPadroes,
  detectarAtrasos,
  detectarPadroesRecentes,
  ResultadoDetectorPadroes,
} from './padraoService';
import { limparMemoriaResultadoService } from './resultadoService';
import { BackendLiveService } from './backendLiveService';
import { invalidarCacheEstatistico } from './estatisticaService';
import { getCutoffTimestamp, setCutoffTimestamp } from './limpezaState';
import { clearSyncedDashboardEventIds } from './dashboardSync';
import { clearFallbackHistory } from './StatisticsEngine';
export {
  type DashboardSyncCheckResult,
  clearSyncedDashboardEventIds,
  isEventIdSyncedToDashboard,
  markEventIdAsSynced,
  canSyncResultToDashboard,
} from './dashboardSync';

export interface ResumoGeral {
  totalRodadas: number;
  sessaoAtual: string | number | null;
  ultimoResultado: {
    rodada: number | null;
    resultado: string | null;
    horario: string | null;
    criadoEm: string | null;
  } | null;
  horarioUltimoResultado: string | null;
}

export interface UltimoResultadoItem {
  rodada: number | null;
  resultado: string;
  horario: string;
  criadoEm: string;
}

export interface RankingObjetoItem {
  posicao: number;
  objeto: string;
  quantidade: number;
  percentual: string;
  percentualNumero: number;
}

export interface ObjetoAtrasadoItem {
  posicao: number;
  objeto: string;
  rodadasSemAparecer: number;
  ultimaOcorrenciaEm: string | null;
  descricao: string;
}

export interface EstatisticasJanela {
  janela: number;
  totalAnalisado: number;
  topObjetos: { objeto: string; quantidade: number; percentual: string }[];
}

export interface DashboardCompleto {
  sucesso: boolean;
  tempoExecucaoMs: number;
  dadosInsuficientes: boolean;
  mensagemInsuficiencia?: string;
  resumo: ResumoGeral;
  ultimosResultados: UltimoResultadoItem[];
  ranking: RankingObjetoItem[];
  atrasos: ObjetoAtrasadoItem[];
  padroes: ResultadoDetectorPadroes;
  estatisticasRecentes: {
    janela20: EstatisticasJanela;
    janela50: EstatisticasJanela;
    janela100: EstatisticasJanela;
  };
}

/**
 * Normaliza e valida se uma string é um dos 8 objetos permitidos.
 */
function normalizarObjeto(item: string): string | null {
  if (!item) return null;
  const limpo = item.trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo as any)) {
    return limpo;
  }
  return null;
}

/**
 * Formata um ISO Date string para apenas o horário "HH:MM:SS" (ou "HH:MM").
 */
function formatarHorario(isoString?: string | null): string {
  if (!isoString) return '--:--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
}

/**
 * 1. obterResumoGeral()
 */
export async function obterResumoGeral(): Promise<ResumoGeral> {
  const supabase = getSupabase();
  const sessaoRes = await obterSessaoAtual();
  const sessaoAtual = sessaoRes?.data?.id || null;

  if (!supabase) {
    return {
      totalRodadas: 0,
      sessaoAtual,
      ultimoResultado: null,
      horarioUltimoResultado: null,
    };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase
      .from('resultados')
      .select('rodada, objeto, criado_em', { count: 'exact' });

    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }

    const { data, count, error } = await query
      .order('criado_em', { ascending: false })
      .limit(1);

    if (error || !data) {
      if (error) {
        logger.error('Erro ao buscar resumo geral no Supabase:', error.message);
      }
      return {
        totalRodadas: 0,
        sessaoAtual,
        ultimoResultado: null,
        horarioUltimoResultado: null,
      };
    }

    const total = count || data.length;
    const ultimo = data.length > 0 ? data[0] : null;

    const rawObjeto = ultimo ? (ultimo.objeto || (ultimo as any).item) : null;
    const norm = rawObjeto ? normalizarObjeto(rawObjeto) : null;
    const horario = ultimo ? formatarHorario(ultimo.criado_em) : null;

    return {
      totalRodadas: total,
      sessaoAtual,
      ultimoResultado: ultimo
        ? {
            rodada: ultimo.rodada || null,
            resultado: norm || rawObjeto,
            horario,
            criadoEm: ultimo.criado_em,
          }
        : null,
      horarioUltimoResultado: horario,
    };
  } catch (err: any) {
    logger.error('Erro em obterResumoGeral:', err?.message);
    return {
      totalRodadas: 0,
      sessaoAtual,
      ultimoResultado: null,
      horarioUltimoResultado: null,
    };
  }
}

/**
 * 2. obterUltimosResultados(limite = 100)
 * Retorna as últimas rodadas ordenadas da mais recente para a mais antiga (padrão até 100).
 */
export async function obterUltimosResultados(limite: number = 100): Promise<UltimoResultadoItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase
      .from('resultados')
      .select('rodada, objeto, criado_em');

    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }

    const { data, error } = await query
      .order('criado_em', { ascending: false })
      .limit(limite);

    if (error || !data) {
      if (error) logger.error('Erro ao buscar ultimos resultados:', error.message);
      return [];
    }

    return data
      .map((row) => {
        const rawObj = row.objeto || (row as any).item;
        const norm = normalizarObjeto(rawObj);
        if (!norm) return null;
        return {
          rodada: row.rodada || null,
          resultado: norm,
          horario: formatarHorario(row.criado_em),
          criadoEm: row.criado_em,
        };
      })
      .filter((item): item is UltimoResultadoItem => item !== null);
  } catch (err: any) {
    logger.error('Erro em obterUltimosResultados:', err?.message);
    return [];
  }
}

/**
 * 3. obterRankingObjetos()
 * Retorna o ranking completo dos 8 objetos com quantidade e percentual.
 */
export async function obterRankingObjetos(): Promise<RankingObjetoItem[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return OBJETOS_PERMITIDOS.map((objeto, idx) => ({
      posicao: idx + 1,
      objeto,
      quantidade: 0,
      percentual: '0.00%',
      percentualNumero: 0,
    }));
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('objeto');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query;

    if (error || !data) {
      if (error) logger.error('Erro ao buscar ranking de objetos:', error.message);
      return OBJETOS_PERMITIDOS.map((objeto, idx) => ({
        posicao: idx + 1,
        objeto,
        quantidade: 0,
        percentual: '0.00%',
        percentualNumero: 0,
      }));
    }

    const contagem: Record<string, number> = {};
    OBJETOS_PERMITIDOS.forEach((obj) => {
      contagem[obj] = 0;
    });

    let totalValidos = 0;
    data.forEach((row) => {
      const rawObj = row.objeto || (row as any).item;
      const norm = normalizarObjeto(rawObj);
      if (norm && contagem[norm] !== undefined) {
        contagem[norm]++;
        totalValidos++;
      }
    });

    const lista = OBJETOS_PERMITIDOS.map((objeto) => {
      const qtd = contagem[objeto] || 0;
      const pct = totalValidos > 0 ? (qtd / totalValidos) * 100 : 0;
      return {
        objeto,
        quantidade: qtd,
        percentual: `${pct.toFixed(2)}%`,
        percentualNumero: Number(pct.toFixed(2)),
      };
    }).sort((a, b) => b.quantidade - a.quantidade);

    return lista.map((item, index) => ({
      posicao: index + 1,
      ...item,
    }));
  } catch (err: any) {
    logger.error('Erro em obterRankingObjetos:', err?.message);
    return [];
  }
}

/**
 * 4. obterObjetosAtrasados()
 */
export async function obterObjetosAtrasados(): Promise<ObjetoAtrasadoItem[]> {
  try {
    const resAtrasos = await detectarAtrasos();
    return resAtrasos.itens.map((item, idx) => ({
      posicao: idx + 1,
      objeto: item.objeto,
      rodadasSemAparecer: item.rodadasSemAparecer,
      ultimaOcorrenciaEm: item.ultimaOcorrenciaEm,
      descricao: item.atrasoRelativo,
    }));
  } catch (err: any) {
    logger.error('Erro em obterObjetosAtrasados:', err?.message);
    return [];
  }
}

/**
 * Helper para calcular estatísticas de uma janela recente.
 */
async function calcularEstatisticaJanela(janela: number): Promise<EstatisticasJanela> {
  const supabase = getSupabase();
  if (!supabase) {
    return { janela, totalAnalisado: 0, topObjetos: [] };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase
      .from('resultados')
      .select('objeto');

    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }

    const { data, error } = await query
      .order('criado_em', { ascending: false })
      .limit(janela);

    if (error || !data || data.length === 0) {
      if (error) logger.error('Erro ao calcular estatistica janela:', error.message);
      return { janela, totalAnalisado: 0, topObjetos: [] };
    }

    const contagem: Record<string, number> = {};
    let total = 0;

    data.forEach((row) => {
      const rawObj = row.objeto || (row as any).item;
      const norm = normalizarObjeto(rawObj);
      if (norm) {
        contagem[norm] = (contagem[norm] || 0) + 1;
        total++;
      }
    });

    const topObjetos = Object.entries(contagem)
      .map(([objeto, quantidade]) => {
        const pct = total > 0 ? (quantidade / total) * 100 : 0;
        return {
          objeto,
          quantidade,
          percentual: `${pct.toFixed(2)}%`,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade);

    return {
      janela,
      totalAnalisado: total,
      topObjetos,
    };
  } catch {
    return { janela, totalAnalisado: 0, topObjetos: [] };
  }
}

/**
 * 5. obterEstatisticasRecentes()
 * Compara as últimas 20, 50 e 100 rodadas.
 */
export async function obterEstatisticasRecentes(): Promise<{
  janela20: EstatisticasJanela;
  janela50: EstatisticasJanela;
  janela100: EstatisticasJanela;
}> {
  const [j20, j50, j100] = await Promise.all([
    calcularEstatisticaJanela(20),
    calcularEstatisticaJanela(50),
    calcularEstatisticaJanela(100),
  ]);

  return {
    janela20: j20,
    janela50: j50,
    janela100: j100,
  };
}

/**
 * Função Mestre: obterDashboardCompleto()
 * Centraliza e consolida todos os dados do Painel de Inteligência Estatística em uma única resposta.
 */
export async function obterDashboardCompleto(): Promise<DashboardCompleto> {
  const inicio = Date.now();

  const [resumo, ultimosResultados, ranking, atrasos, padroes, estatisticasRecentes] =
    await Promise.all([
      obterResumoGeral(),
      obterUltimosResultados(100),
      obterRankingObjetos(),
      obterObjetosAtrasados(),
      executarDetectorPadroes(),
      obterEstatisticasRecentes(),
    ]);

  const tempoExecucaoMs = Date.now() - inicio;

  const dadosInsuficientes = resumo.totalRodadas < 5;
  const mensagemInsuficiencia = dadosInsuficientes
    ? 'Dados insuficientes no banco de dados para uma análise de inteligência completa.'
    : undefined;

  logger.info(
    `Dashboard Completo gerado | Rodadas: ${resumo.totalRodadas} | Tempo: ${tempoExecucaoMs}ms`
  );

  return {
    sucesso: true,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagemInsuficiencia,
    resumo,
    ultimosResultados,
    ranking,
    atrasos,
    padroes,
    estatisticasRecentes,
  };
}

/**
 * Limpa todo o histórico de resultados do Supabase e reseta os estados/caches do sistema.
 */
export async function limparHistorico(): Promise<{
  sucesso: boolean;
  registrosDeletados: number;
  mensagem: string;
}> {
  const inicio = Date.now();
  logger.info('[CLEAR_HISTORY_START] Iniciando limpeza completa do histórico de resultados...');

  let registrosDeletados = 0;
  const supabase = getSupabase();

  if (supabase) {
    try {
      logger.info('[CLEAR_HISTORY_SUPABASE] Deletando registros do banco...');
      
      // 1. Contar registros existentes para auditoria
      const { count } = await supabase
        .from('resultados')
        .select('*', { count: 'exact', head: true });
      registrosDeletados = count || 0;

      // 2. Deletar todos os registros da tabela 'resultados'
      const { error } = await supabase
        .from('resultados')
        .delete()
        .gte('id', 0);

      if (error) {
        logger.error(`[CLEAR_HISTORY_ERROR] Falha ao deletar histórico no Supabase: ${error.message}`);
        return {
          sucesso: false,
          registrosDeletados: 0,
          mensagem: `Falha ao deletar histórico no Supabase: ${error.message}`,
        };
      }
    } catch (err: any) {
      logger.error(`[CLEAR_HISTORY_ERROR] Falha ao deletar histórico no Supabase: ${err?.message}`);
      return {
        sucesso: false,
        registrosDeletados: 0,
        mensagem: `Exceção ao deletar histórico: ${err?.message}`,
      };
    }
  }

  // 3. Definir cutoff timestamp para ignorar registros anteriores e resetar memórias
  setCutoffTimestamp(new Date().toISOString());
  clearSyncedDashboardEventIds();
  limparMemoriaResultadoService();
  clearFallbackHistory();
  BackendLiveService.limparMemoriaLiveSessao();
  invalidarCacheEstatistico();

  const duracaoMs = Date.now() - inicio;
  logger.info(`[CLEAR_HISTORY_SUCCESS] Histórico totalmente apagado (Removidos: ${registrosDeletados} registros em ${duracaoMs}ms)`);
  logger.info('[CLEAR_HISTORY_REHYDRATE] Novo estado: VAZIO');

  return {
    sucesso: true,
    registrosDeletados,
    mensagem: 'Histórico totalmente apagado com sucesso.',
  };
}

