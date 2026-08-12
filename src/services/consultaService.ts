import { getSupabase } from '../database/supabase';
import { getCutoffTimestamp } from './limpezaState';
import { logger } from '../utils/logger';

export const OBJETOS_VALIDOS = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
] as const;

export type TipoObjeto = typeof OBJETOS_VALIDOS[number];

export interface ResultadoConsulta {
  sucesso: boolean;
  tipo: string;
  tempoExecucaoMs: number;
  totalRegistrosConsultados: number;
  dados: any;
  mensagem?: string;
}

/**
 * Helper para validar se o objeto pertence aos 8 permitidos
 */
function normalizarEValidarObjeto(objeto: string): string | null {
  if (!objeto) return null;
  const objClean = objeto.trim().toLowerCase();
  if (OBJETOS_VALIDOS.includes(objClean as any)) {
    return objClean;
  }
  return null;
}

/**
 * 1. buscarUltimosResultados(limite)
 * Retorna os últimos resultados registrados, do mais recente para o mais antigo.
 */
export async function buscarUltimosResultados(limite: number = 10): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.warn('Supabase indisponível em buscarUltimosResultados');
    return {
      sucesso: false,
      tipo: 'ultimos',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: 'Banco de dados Supabase indisponível no momento.',
    };
  }

  try {
    const limitClean = Math.max(1, Math.min(100, limite));
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('*');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query
      .order('criado_em', { ascending: false })
      .limit(limitClean);

    const tempoExecucaoMs = Date.now() - inicio;

    if (error) {
      logger.error('Erro ao buscar últimos resultados no Supabase:', error.message);
      return {
        sucesso: false,
        tipo: 'ultimos',
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: [],
        mensagem: `Erro na consulta: ${error.message}`,
      };
    }

    const total = data ? data.length : 0;
    logger.info(`Consulta executada | Tipo: ultimos | Tempo: ${tempoExecucaoMs}ms | Registros: ${total}`);

    return {
      sucesso: true,
      tipo: 'ultimos',
      tempoExecucaoMs,
      totalRegistrosConsultados: total,
      dados: data || [],
    };
  } catch (err: any) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error('Exceção em buscarUltimosResultados:', err?.message);
    return {
      sucesso: false,
      tipo: 'ultimos',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: err?.message || 'Erro inesperado na consulta ao banco de dados.',
    };
  }
}

/**
 * 2. buscarResultadoAnterior()
 * Retorna apenas o resultado imediatamente anterior.
 */
export async function buscarResultadoAnterior(): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: 'resultado_anterior',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: 'Banco de dados Supabase indisponível no momento.',
    };
  }

  try {
    // Buscar os 2 mais recentes: index 0 é o atual/último, index 1 é o anterior
    const cutoff1 = getCutoffTimestamp();
    let query1 = supabase.from('resultados').select('*');
    if (cutoff1) {
      query1 = query1.gt('criado_em', cutoff1);
    }
    const { data, error } = await query1
      .order('criado_em', { ascending: false })
      .limit(2);

    const tempoExecucaoMs = Date.now() - inicio;

    if (error) {
      logger.error('Erro ao buscar resultado anterior:', error.message);
      return {
        sucesso: false,
        tipo: 'resultado_anterior',
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message,
      };
    }

    const anterior = data && data.length > 1 ? data[1] : (data && data.length === 1 ? data[0] : null);
    const total = data ? data.length : 0;

    logger.info(`Consulta executada | Tipo: resultado_anterior | Tempo: ${tempoExecucaoMs}ms | Registros: ${total}`);

    return {
      sucesso: true,
      tipo: 'resultado_anterior',
      tempoExecucaoMs,
      totalRegistrosConsultados: total,
      dados: anterior,
    };
  } catch (err: any) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error('Exceção em buscarResultadoAnterior:', err?.message);
    return {
      sucesso: false,
      tipo: 'resultado_anterior',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || 'Erro inesperado na consulta.',
    };
  }
}

/**
 * 3. buscarQuantidadePorObjeto()
 * Retorna objeto, quantidade e porcentagem para todos os 8 objetos.
 */
export async function buscarQuantidadePorObjeto(): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: 'frequencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: 'Banco de dados Supabase indisponível no momento.',
    };
  }

  try {
    const cutoff2 = getCutoffTimestamp();
    let query2 = supabase.from('resultados').select('objeto');
    if (cutoff2) {
      query2 = query2.gt('criado_em', cutoff2);
    }
    const { data, error } = await query2;

    const tempoExecucaoMs = Date.now() - inicio;

    if (error) {
      logger.error('Erro ao buscar quantidade por objeto:', error.message);
      return {
        sucesso: false,
        tipo: 'frequencia',
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: [],
        mensagem: error.message,
      };
    }

    const totalRodadas = data ? data.length : 0;
    const contagemMap: Record<string, number> = {};

    // Inicializar os 8 objetos com 0
    OBJETOS_VALIDOS.forEach((obj) => {
      contagemMap[obj] = 0;
    });

    if (data) {
      data.forEach((row) => {
        const rawObj = row.objeto || (row as any).item;
        const itemClean = normalizarEValidarObjeto(rawObj);
        if (itemClean) {
          contagemMap[itemClean] = (contagemMap[itemClean] || 0) + 1;
        }
      });
    }

    const resultadoFormatado = OBJETOS_VALIDOS.map((objeto) => {
      const quantidade = contagemMap[objeto] || 0;
      const porcentagemNum = totalRodadas > 0 ? (quantidade / totalRodadas) * 100 : 0;
      return {
        objeto,
        quantidade,
        porcentagem: `${porcentagemNum.toFixed(1)}%`,
        porcentagemNumero: Number(porcentagemNum.toFixed(1)),
      };
    }).sort((a, b) => b.quantidade - a.quantidade);

    logger.info(`Consulta executada | Tipo: frequencia | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRodadas}`);

    return {
      sucesso: true,
      tipo: 'frequencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRodadas,
      dados: resultadoFormatado,
    };
  } catch (err: any) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error('Exceção em buscarQuantidadePorObjeto:', err?.message);
    return {
      sucesso: false,
      tipo: 'frequencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: err?.message || 'Erro inesperado na consulta.',
    };
  }
}

/**
 * 4. buscarObjetoMaisFrequente()
 * Retorna o objeto que mais apareceu no banco.
 */
export async function buscarObjetoMaisFrequente(): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const resFrequencia = await buscarQuantidadePorObjeto();
  const tempoExecucaoMs = Date.now() - inicio;

  if (!resFrequencia.sucesso || !resFrequencia.dados || resFrequencia.dados.length === 0) {
    return {
      sucesso: false,
      tipo: 'mais_frequente',
      tempoExecucaoMs,
      totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
      dados: null,
      mensagem: resFrequencia.mensagem || 'Sem dados registrados no momento.',
    };
  }

  const maisFrequente = resFrequencia.dados[0]; // Já ordenado por quantidade decrescente

  logger.info(`Consulta executada | Tipo: mais_frequente | Tempo: ${tempoExecucaoMs}ms | Registros: ${resFrequencia.totalRegistrosConsultados}`);

  return {
    sucesso: true,
    tipo: 'mais_frequente',
    tempoExecucaoMs,
    totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
    dados: maisFrequente,
  };
}

/**
 * 5. buscarObjetoMenosFrequente()
 * Retorna o objeto que menos apareceu no banco.
 */
export async function buscarObjetoMenosFrequente(): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const resFrequencia = await buscarQuantidadePorObjeto();
  const tempoExecucaoMs = Date.now() - inicio;

  if (!resFrequencia.sucesso || !resFrequencia.dados || resFrequencia.dados.length === 0) {
    return {
      sucesso: false,
      tipo: 'menos_frequente',
      tempoExecucaoMs,
      totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
      dados: null,
      mensagem: resFrequencia.mensagem || 'Sem dados registrados no momento.',
    };
  }

  // Pegar o último item (menor quantidade)
  const menosFrequente = resFrequencia.dados[resFrequencia.dados.length - 1];

  logger.info(`Consulta executada | Tipo: menos_frequente | Tempo: ${tempoExecucaoMs}ms | Registros: ${resFrequencia.totalRegistrosConsultados}`);

  return {
    sucesso: true,
    tipo: 'menos_frequente',
    tempoExecucaoMs,
    totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
    dados: menosFrequente,
  };
}

/**
 * 6. buscarMaiorAtraso()
 * Retorna qual objeto possui o maior atraso em número de rodadas.
 */
export async function buscarMaiorAtraso(): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: 'maior_atraso',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: 'Banco de dados Supabase indisponível no momento.',
    };
  }

  try {
    const cutoff3 = getCutoffTimestamp();
    let query3 = supabase.from('resultados').select('objeto, criado_em, rodada');
    if (cutoff3) {
      query3 = query3.gt('criado_em', cutoff3);
    }
    const { data, error } = await query3.order('criado_em', { ascending: false });

    const tempoExecucaoMs = Date.now() - inicio;

    if (error) {
      logger.error('Erro ao buscar maior atraso:', error.message);
      return {
        sucesso: false,
        tipo: 'maior_atraso',
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message,
      };
    }

    const totalRegistros = data ? data.length : 0;
    const atrasoMap: Record<string, number> = {};
    const ultimaOcorrenciaMap: Record<string, any> = {};
    const encontrados = new Set<string>();

    if (data) {
      data.forEach((row, index) => {
        const rawObj = row.objeto || (row as any).item;
        const itemClean = normalizarEValidarObjeto(rawObj);
        if (itemClean && !encontrados.has(itemClean)) {
          atrasoMap[itemClean] = index; // Quantidade de rodadas sem sair
          ultimaOcorrenciaMap[itemClean] = row;
          encontrados.add(itemClean);
        }
      });
    }

    // Para itens que NUNCA apareceram, atribui atraso igual ao total de rodadas registradas
    OBJETOS_VALIDOS.forEach((obj) => {
      if (!encontrados.has(obj)) {
        atrasoMap[obj] = totalRegistros;
        ultimaOcorrenciaMap[obj] = null;
      }
    });

    // Ordenar do maior para o menor atraso
    const rankingAtraso = OBJETOS_VALIDOS.map((objeto) => ({
      objeto,
      atrasoRodadas: atrasoMap[objeto],
      ultimaOcorrencia: ultimaOcorrenciaMap[objeto],
    })).sort((a, b) => b.atrasoRodadas - a.atrasoRodadas);

    const maiorAtrasoObjeto = rankingAtraso[0];

    logger.info(`Consulta executada | Tipo: maior_atraso | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRegistros}`);

    return {
      sucesso: true,
      tipo: 'maior_atraso',
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRegistros,
      dados: {
        objetoMaisAtrasado: maiorAtrasoObjeto,
        todosAtrasos: rankingAtraso,
      },
    };
  } catch (err: any) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error('Exceção em buscarMaiorAtraso:', err?.message);
    return {
      sucesso: false,
      tipo: 'maior_atraso',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || 'Erro inesperado na consulta.',
    };
  }
}

/**
 * 7. buscarUltimaOcorrencia(objeto)
 * Recebe um objeto válido e retorna última rodada, horário e rodadas sem sair.
 */
export async function buscarUltimaOcorrencia(objetoSolicitado: string): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const objetoClean = normalizarEValidarObjeto(objetoSolicitado);

  if (!objetoClean) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: 'ultima_ocorrencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: `Objeto inválido: "${objetoSolicitado}". Objetos permitidos: ${OBJETOS_VALIDOS.join(', ')}`,
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: 'ultima_ocorrencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: 'Banco de dados Supabase indisponível no momento.',
    };
  }

  try {
    const cutoff4 = getCutoffTimestamp();
    let query4 = supabase.from('resultados').select('*');
    if (cutoff4) {
      query4 = query4.gt('criado_em', cutoff4);
    }
    const { data, error } = await query4.order('criado_em', { ascending: false });

    const tempoExecucaoMs = Date.now() - inicio;

    if (error) {
      logger.error(`Erro ao buscar última ocorrência de ${objetoClean}:`, error.message);
      return {
        sucesso: false,
        tipo: 'ultima_ocorrencia',
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message,
      };
    }

    const totalRegistros = data ? data.length : 0;
    let indiceEncontrado = -1;
    let registroEncontrado = null;

    if (data) {
      for (let i = 0; i < data.length; i++) {
        if (normalizarEValidarObjeto(data[i].item) === objetoClean) {
          indiceEncontrado = i;
          registroEncontrado = data[i];
          break;
        }
      }
    }

    const dadosRetorno = {
      objeto: objetoClean,
      encontrado: indiceEncontrado !== -1,
      atrasoRodadas: indiceEncontrado !== -1 ? indiceEncontrado : totalRegistros,
      ultimaRodada: registroEncontrado?.rodada || null,
      horario: registroEncontrado?.criado_em || null,
      detalhesRegistro: registroEncontrado,
    };

    logger.info(`Consulta executada | Tipo: ultima_ocorrencia | Objeto: ${objetoClean} | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRegistros}`);

    return {
      sucesso: true,
      tipo: 'ultima_ocorrencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRegistros,
      dados: dadosRetorno,
    };
  } catch (err: any) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error('Exceção em buscarUltimaOcorrencia:', err?.message);
    return {
      sucesso: false,
      tipo: 'ultima_ocorrencia',
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || 'Erro inesperado na consulta.',
    };
  }
}
