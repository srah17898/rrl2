import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { OBJETOS_PERMITIDOS } from './transicaoService';

export interface SucessorSequenciaItem {
  resultado: string;
  vezes: number;
  porcentagem: string;
  porcentagemNumero: number;
}

export interface ResultadoProximoSequencia {
  sequencia: string[];
  sequenciaTexto: string;
  totalOcorrenciasSequencia: number;
  resultadoMaisProvavel: string | null;
  probabilidadeHistorica: string;
  dadosInsuficientes: boolean;
  mensagem?: string;
  sucessores: SucessorSequenciaItem[];
  tempoExecucaoMs: number;
  totalRegistrosAnalisados: number;
}

export interface AnaliseSequenciaInfo {
  sequencia: string[];
  sequenciaTexto: string;
  quantidade: number;
  porcentagem: string;
  porcentagemNumero: number;
  proximosResultados: SucessorSequenciaItem[];
}

export interface RespostaAnaliseSequencia {
  sucesso: boolean;
  tamanhoSequencia: number;
  totalFatiasAnalisadas: number;
  totalRegistrosAnalisados: number;
  tempoExecucaoMs: number;
  dadosInsuficientes: boolean;
  mensagem?: string;
  topSequencias: AnaliseSequenciaInfo[];
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
 * Busca todo o histórico de resultados em ordem cronológica (do mais antigo ao mais recente).
 * Garante que resultados repetidos sejam mantidos como rodadas individuais.
 */
async function obterHistoricoCronologico(): Promise<{ itens: string[]; criadoEms: string[] }> {
  const supabase = getSupabase();
  if (!supabase) return { itens: [], criadoEms: [] };

  try {
    const { data, error } = await supabase
      .from('resultados')
      .select('objeto, criado_em')
      .order('criado_em', { ascending: true });

    if (error || !data) {
      if (error) logger.error('Erro ao buscar historico cronologico em sequenciaService:', error.message);
      return { itens: [], criadoEms: [] };
    }

    const itens: string[] = [];
    const criadoEms: string[] = [];

    data.forEach((row) => {
      const norm = normalizarObjeto(row.objeto || (row as any).item);
      if (norm) {
        itens.push(norm);
        criadoEms.push(row.criado_em);
      }
    });

    return { itens, criadoEms };
  } catch (err: any) {
    logger.error('Exceção ao buscar histórico para análise de sequências:', err?.message);
    return { itens: [], criadoEms: [] };
  }
}

/**
 * buscarProximoDepoisDaSequencia(sequencia)
 * Recebe uma sequência de N objetos (ex: ["soco", "boia"]) e pesquisa no histórico
 * qual resultado apareceu imediatamente depois dessa sequência exata.
 */
export async function buscarProximoDepoisDaSequencia(
  sequenciaEntrada: string[]
): Promise<ResultadoProximoSequencia> {
  const inicio = Date.now();

  const seqValida = sequenciaEntrada
    .map(normalizarObjeto)
    .filter((item): item is string => item !== null);

  const seqTexto = seqValida.join(' → ');

  if (seqValida.length === 0) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sequencia: [],
      sequenciaTexto: '',
      totalOcorrenciasSequencia: 0,
      resultadoMaisProvavel: null,
      probabilidadeHistorica: '0.00%',
      dadosInsuficientes: true,
      mensagem: 'Sequência inválida ou vazia.',
      sucessores: [],
      tempoExecucaoMs,
      totalRegistrosAnalisados: 0,
    };
  }

  const { itens } = await obterHistoricoCronologico();
  const L = seqValida.length;
  const N = itens.length;

  let totalOcorrencias = 0;
  const contagemSucessores: Record<string, number> = {};

  for (let i = 0; i <= N - L; i++) {
    let bateu = true;
    for (let k = 0; k < L; k++) {
      if (itens[i + k] !== seqValida[k]) {
        bateu = false;
        break;
      }
    }

    if (bateu) {
      totalOcorrencias++;
      if (i + L < N) {
        const proximo = itens[i + L];
        contagemSucessores[proximo] = (contagemSucessores[proximo] || 0) + 1;
      }
    }
  }

  const tempoExecucaoMs = Date.now() - inicio;

  const sucessores: SucessorSequenciaItem[] = Object.entries(contagemSucessores)
    .map(([resultado, vezes]) => {
      const pct = totalOcorrencias > 0 ? (vezes / totalOcorrencias) * 100 : 0;
      return {
        resultado,
        vezes,
        porcentagem: `${pct.toFixed(2)}%`,
        porcentagemNumero: Number(pct.toFixed(2)),
      };
    })
    .sort((a, b) => b.vezes - a.vezes);

  const topSucessor = sucessores.length > 0 ? sucessores[0] : null;

  // Proteção de dados: Menos de 20 ocorrências da sequência
  const dadosInsuficientes = totalOcorrencias < 20;
  const mensagem = dadosInsuficientes
    ? 'Dados insuficientes para identificar um padrão confiável.'
    : undefined;

  logger.info(
    `Análise de Sequência [${seqTexto}] | Registros analisados: ${N} | Ocorrências da sequência: ${totalOcorrencias} | Tempo: ${tempoExecucaoMs}ms`
  );

  return {
    sequencia: seqValida,
    sequenciaTexto: seqTexto,
    totalOcorrenciasSequencia: totalOcorrencias,
    resultadoMaisProvavel: topSucessor ? topSucessor.resultado : null,
    probabilidadeHistorica: topSucessor ? topSucessor.porcentagem : '0.00%',
    dadosInsuficientes,
    mensagem,
    sucessores,
    tempoExecucaoMs,
    totalRegistrosAnalisados: N,
  };
}

/**
 * analisarSequencia3(seqFiltro?)
 * Encontra e analisa padrões de 3 elementos consecutivos (resultado1 -> resultado2 -> resultado3).
 */
export async function analisarSequencia3(
  seqFiltro?: string[]
): Promise<RespostaAnaliseSequencia> {
  const inicio = Date.now();
  const { itens } = await obterHistoricoCronologico();
  const N = itens.length;
  const tamanho = 3;

  if (N < tamanho) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: 0,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs,
      dadosInsuficientes: true,
      mensagem: 'Dados insuficientes para identificar um padrão confiável.',
      topSequencias: [],
    };
  }

  // Se um filtro de sequência de 3 foi passado
  if (seqFiltro && seqFiltro.length === 3) {
    const resProximo = await buscarProximoDepoisDaSequencia(seqFiltro);
    const totalFatias = N - tamanho + 1;
    const pct = totalFatias > 0 ? (resProximo.totalOcorrenciasSequencia / totalFatias) * 100 : 0;

    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: totalFatias,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs,
      dadosInsuficientes: resProximo.dadosInsuficientes,
      mensagem: resProximo.mensagem,
      topSequencias: [
        {
          sequencia: resProximo.sequencia,
          sequenciaTexto: resProximo.sequenciaTexto,
          quantidade: resProximo.totalOcorrenciasSequencia,
          porcentagem: `${pct.toFixed(2)}%`,
          porcentagemNumero: Number(pct.toFixed(2)),
          proximosResultados: resProximo.sucessores,
        },
      ],
    };
  }

  // Agrupar todas as fatias de 3 itens
  const contagem: Record<string, { seq: string[]; count: number; proximos: Record<string, number> }> = {};
  let totalFatias = 0;

  for (let i = 0; i <= N - tamanho; i++) {
    const slice = [itens[i], itens[i + 1], itens[i + 2]];
    const key = slice.join('→');
    totalFatias++;

    if (!contagem[key]) {
      contagem[key] = { seq: slice, count: 0, proximos: {} };
    }
    contagem[key].count++;

    if (i + tamanho < N) {
      const proximo = itens[i + tamanho];
      contagem[key].proximos[proximo] = (contagem[key].proximos[proximo] || 0) + 1;
    }
  }

  const topSequencias: AnaliseSequenciaInfo[] = Object.values(contagem)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => {
      const pct = totalFatias > 0 ? (item.count / totalFatias) * 100 : 0;
      const proximosResultados: SucessorSequenciaItem[] = Object.entries(item.proximos)
        .map(([res, vezes]) => {
          const p = item.count > 0 ? (vezes / item.count) * 100 : 0;
          return {
            resultado: res,
            vezes,
            porcentagem: `${p.toFixed(2)}%`,
            porcentagemNumero: Number(p.toFixed(2)),
          };
        })
        .sort((a, b) => b.vezes - a.vezes);

      return {
        sequencia: item.seq,
        sequenciaTexto: item.seq.join(' → '),
        quantidade: item.count,
        porcentagem: `${pct.toFixed(2)}%`,
        porcentagemNumero: Number(pct.toFixed(2)),
        proximosResultados,
      };
    });

  const tempoExecucaoMs = Date.now() - inicio;
  const maiorQuantidade = topSequencias.length > 0 ? topSequencias[0].quantidade : 0;
  const dadosInsuficientes = maiorQuantidade < 20;

  logger.info(`Análise Sequência 3 | Total fatias: ${totalFatias} | Tempo: ${tempoExecucaoMs}ms`);

  return {
    sucesso: true,
    tamanhoSequencia: tamanho,
    totalFatiasAnalisadas: totalFatias,
    totalRegistrosAnalisados: N,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagem: dadosInsuficientes ? 'Dados insuficientes para identificar um padrão confiável.' : undefined,
    topSequencias,
  };
}

/**
 * analisarSequencia4(seqFiltro?)
 * Encontra e analisa padrões de 4 elementos consecutivos (resultado1 -> resultado2 -> resultado3 -> resultado4).
 */
export async function analisarSequencia4(
  seqFiltro?: string[]
): Promise<RespostaAnaliseSequencia> {
  const inicio = Date.now();
  const { itens } = await obterHistoricoCronologico();
  const N = itens.length;
  const tamanho = 4;

  if (N < tamanho) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: 0,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs,
      dadosInsuficientes: true,
      mensagem: 'Dados insuficientes para identificar um padrão confiável.',
      topSequencias: [],
    };
  }

  // Se um filtro de sequência de 4 foi passado
  if (seqFiltro && seqFiltro.length === 4) {
    const resProximo = await buscarProximoDepoisDaSequencia(seqFiltro);
    const totalFatias = N - tamanho + 1;
    const pct = totalFatias > 0 ? (resProximo.totalOcorrenciasSequencia / totalFatias) * 100 : 0;

    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: totalFatias,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs,
      dadosInsuficientes: resProximo.dadosInsuficientes,
      mensagem: resProximo.mensagem,
      topSequencias: [
        {
          sequencia: resProximo.sequencia,
          sequenciaTexto: resProximo.sequenciaTexto,
          quantidade: resProximo.totalOcorrenciasSequencia,
          porcentagem: `${pct.toFixed(2)}%`,
          porcentagemNumero: Number(pct.toFixed(2)),
          proximosResultados: resProximo.sucessores,
        },
      ],
    };
  }

  // Agrupar todas as fatias de 4 itens
  const contagem: Record<string, { seq: string[]; count: number; proximos: Record<string, number> }> = {};
  let totalFatias = 0;

  for (let i = 0; i <= N - tamanho; i++) {
    const slice = [itens[i], itens[i + 1], itens[i + 2], itens[i + 3]];
    const key = slice.join('→');
    totalFatias++;

    if (!contagem[key]) {
      contagem[key] = { seq: slice, count: 0, proximos: {} };
    }
    contagem[key].count++;

    if (i + tamanho < N) {
      const proximo = itens[i + tamanho];
      contagem[key].proximos[proximo] = (contagem[key].proximos[proximo] || 0) + 1;
    }
  }

  const topSequencias: AnaliseSequenciaInfo[] = Object.values(contagem)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => {
      const pct = totalFatias > 0 ? (item.count / totalFatias) * 100 : 0;
      const proximosResultados: SucessorSequenciaItem[] = Object.entries(item.proximos)
        .map(([res, vezes]) => {
          const p = item.count > 0 ? (vezes / item.count) * 100 : 0;
          return {
            resultado: res,
            vezes,
            porcentagem: `${p.toFixed(2)}%`,
            porcentagemNumero: Number(p.toFixed(2)),
          };
        })
        .sort((a, b) => b.vezes - a.vezes);

      return {
        sequencia: item.seq,
        sequenciaTexto: item.seq.join(' → '),
        quantidade: item.count,
        porcentagem: `${pct.toFixed(2)}%`,
        porcentagemNumero: Number(pct.toFixed(2)),
        proximosResultados,
      };
    });

  const tempoExecucaoMs = Date.now() - inicio;
  const maiorQuantidade = topSequencias.length > 0 ? topSequencias[0].quantidade : 0;
  const dadosInsuficientes = maiorQuantidade < 20;

  logger.info(`Análise Sequência 4 | Total fatias: ${totalFatias} | Tempo: ${tempoExecucaoMs}ms`);

  return {
    sucesso: true,
    tamanhoSequencia: tamanho,
    totalFatiasAnalisadas: totalFatias,
    totalRegistrosAnalisados: N,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagem: dadosInsuficientes ? 'Dados insuficientes para identificar um padrão confiável.' : undefined,
    topSequencias,
  };
}
