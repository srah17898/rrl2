import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';

export const OBJETOS_PERMITIDOS = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
] as const;

export type TipoObjeto = (typeof OBJETOS_PERMITIDOS)[number];

export interface TransicaoResultadoItem {
  resultado: string;
  vezes: number;
  porcentagem: string;
  porcentagemNumero: number;
}

export interface ResultadoMaisProvavel {
  objetoAnterior: string;
  resultadoMaisProvavel: string | null;
  ocorrencias: number;
  probabilidadeHistorica: string;
  totalOcorrenciasAnterior: number;
  dadosInsuficientes: boolean;
  mensagem?: string;
  listaTodosSucessores: TransicaoResultadoItem[];
}

export interface DetalhesTransicaoEspecifica {
  anterior: string;
  atual: string;
  quantidade: number;
  percentual: string;
  percentualNumero: number;
  totalOcorrenciasAnterior: number;
  ultimaOcorrencia: string | null;
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
 * 1. registrarTransicao(itemAnterior, itemAtual)
 * Registra ou incrementa a transição entre resultado_anterior e resultado_atual no Supabase.
 * Nunca lança exceção para não interromper o fluxo principal de registro.
 */
export async function registrarTransicao(
  itemAnterior: string,
  itemAtual: string
): Promise<{ sucesso: boolean; mensagem?: string }> {
  const de = normalizarObjeto(itemAnterior);
  const para = normalizarObjeto(itemAtual);

  if (!de || !para) {
    logger.warn(`Transição inválida ignorada: "${itemAnterior}" -> "${itemAtual}"`);
    return { sucesso: false, mensagem: 'Itens inválidos' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('Supabase indisponível ao registrar transição');
    return { sucesso: false, mensagem: 'Supabase indisponível' };
  }

  try {
    logger.info(`Registrando transição histórica: ${de} -> ${para}`);

    // Tentar inserir na tabela 'transicoes' se ela existir
    // Usamos tentativa com nomes de colunas comuns: 'de', 'para' / 'resultado_anterior', 'resultado_atual'
    let { error } = await supabase.from('transicoes').insert([
      {
        de,
        para,
        criado_em: new Date().toISOString(),
      },
    ]);

    if (error) {
      // Tentar variação de colunas alternativa: resultado_anterior e resultado_atual
      const resAlt = await supabase.from('transicoes').insert([
        {
          resultado_anterior: de,
          resultado_atual: para,
          criado_em: new Date().toISOString(),
        },
      ]);
      if (resAlt.error) {
        logger.warn(`Nota: Tabela 'transicoes' indisponível ou com esquema diferente (${error.message}). Transições serão calculadas dinamicamente a partir de 'resultados'.`);
      }
    }

    return { sucesso: true };
  } catch (err: any) {
    logger.error('Exceção ao registrar transição:', err?.message);
    return { sucesso: false, mensagem: err?.message };
  }
}

/**
 * Busca todas as transições diretamente da tabela 'resultados' em ordem cronológica.
 * Garantia de precisão matemática a partir de todos os registros reais.
 */
async function obterTodasTransicoesCronologicas(): Promise<Array<{ de: string; para: string; criadoEm: string }>> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('resultados')
      .select('objeto, criado_em')
      .order('criado_em', { ascending: true });

    if (error || !data || data.length < 2) {
      if (error) logger.error('Erro ao buscar transicoes cronologicas:', error.message);
      return [];
    }

    const transicoes: Array<{ de: string; para: string; criadoEm: string }> = [];
    for (let i = 0; i < data.length - 1; i++) {
      const de = normalizarObjeto((data[i] as any).objeto || (data[i] as any).item);
      const para = normalizarObjeto((data[i + 1] as any).objeto || (data[i + 1] as any).item);
      if (de && para) {
        transicoes.push({
          de,
          para,
          criadoEm: data[i + 1].criado_em,
        });
      }
    }
    return transicoes;
  } catch (err: any) {
    logger.error('Exceção ao obter transições cronológicas:', err?.message);
    return [];
  }
}

/**
 * 2. buscarDepoisDe(objeto)
 * Recebe um objeto e retorna a lista de todos os resultados que vieram depois dele,
 * com contagem de vezes e porcentagem, ordenados do maior para o menor.
 */
export async function buscarDepoisDe(objetoSolicitado: string): Promise<{
  sucesso: boolean;
  objeto: string;
  totalOcorrenciasAnterior: number;
  tempoExecucaoMs: number;
  dados: TransicaoResultadoItem[];
  mensagem?: string;
}> {
  const inicio = Date.now();
  const objNormalizado = normalizarObjeto(objetoSolicitado);

  if (!objNormalizado) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      objeto: objetoSolicitado,
      totalOcorrenciasAnterior: 0,
      tempoExecucaoMs,
      dados: [],
      mensagem: `Objeto inválido: "${objetoSolicitado}". Objetos permitidos: ${OBJETOS_PERMITIDOS.join(', ')}`,
    };
  }

  const transicoes = await obterTodasTransicoesCronologicas();
  const tempoExecucaoMs = Date.now() - inicio;

  const contagemSucessores: Record<string, number> = {};
  let totalOcorrencias = 0;

  transicoes.forEach((t) => {
    if (t.de === objNormalizado) {
      contagemSucessores[t.para] = (contagemSucessores[t.para] || 0) + 1;
      totalOcorrencias++;
    }
  });

  const listaFormatada: TransicaoResultadoItem[] = Object.entries(contagemSucessores)
    .map(([sucessor, vezes]) => {
      const pct = totalOcorrencias > 0 ? (vezes / totalOcorrencias) * 100 : 0;
      return {
        resultado: sucessor,
        vezes,
        porcentagem: `${pct.toFixed(2)}%`,
        porcentagemNumero: Number(pct.toFixed(2)),
      };
    })
    .sort((a, b) => b.vezes - a.vezes);

  logger.info(`Consulta transições depois de "${objNormalizado}" | Total ocorrências: ${totalOcorrencias} | Tempo: ${tempoExecucaoMs}ms`);

  return {
    sucesso: true,
    objeto: objNormalizado,
    totalOcorrenciasAnterior: totalOcorrencias,
    tempoExecucaoMs,
    dados: listaFormatada,
  };
}

/**
 * 3. buscarMaisProvavelDepoisDe(objeto)
 * Retorna o resultado mais frequente após determinado objeto, com probabilidade histórica.
 */
export async function buscarMaisProvavelDepoisDe(objetoSolicitado: string): Promise<ResultadoMaisProvavel> {
  const inicio = Date.now();
  const resDepois = await buscarDepoisDe(objetoSolicitado);
  const tempoExecucaoMs = Date.now() - inicio;

  const objNormalizado = normalizarObjeto(objetoSolicitado) || objetoSolicitado;

  if (!resDepois.sucesso || resDepois.totalOcorrenciasAnterior === 0 || resDepois.dados.length === 0) {
    return {
      objetoAnterior: objNormalizado,
      resultadoMaisProvavel: null,
      ocorrencias: 0,
      probabilidadeHistorica: '0.00%',
      totalOcorrenciasAnterior: resDepois.totalOcorrenciasAnterior,
      dadosInsuficientes: true,
      mensagem: `Dados insuficientes para uma análise confiável sobre "${objNormalizado}".`,
      listaTodosSucessores: [],
    };
  }

  const topSucessor = resDepois.dados[0];

  // Se houver menos de 3 ocorrências no total, marcar como dados insuficientes
  const dadosInsuficientes = resDepois.totalOcorrenciasAnterior < 3;

  logger.info(`Mais provável depois de "${objNormalizado}" -> ${topSucessor.resultado} (${topSucessor.porcentagem}) | Tempo: ${tempoExecucaoMs}ms`);

  return {
    objetoAnterior: objNormalizado,
    resultadoMaisProvavel: topSucessor.resultado,
    ocorrencias: topSucessor.vezes,
    probabilidadeHistorica: topSucessor.porcentagem,
    totalOcorrenciasAnterior: resDepois.totalOcorrenciasAnterior,
    dadosInsuficientes,
    mensagem: dadosInsuficientes
      ? `Dados insuficientes para uma análise confiável (apenas ${resDepois.totalOcorrenciasAnterior} ocorrência(s) de "${objNormalizado}").`
      : undefined,
    listaTodosSucessores: resDepois.dados,
  };
}

/**
 * 4. buscarTransicaoEspecifica(anterior, atual)
 * Retorna estatísticas de uma transição específica (ex: Soco -> Boia).
 */
export async function buscarTransicaoEspecifica(
  anteriorSolicitado: string,
  atualSolicitado: string
): Promise<DetalhesTransicaoEspecifica> {
  const de = normalizarObjeto(anteriorSolicitado) || anteriorSolicitado;
  const para = normalizarObjeto(atualSolicitado) || atualSolicitado;

  const transicoes = await obterTodasTransicoesCronologicas();

  let quantidade = 0;
  let totalAnterior = 0;
  let ultimaOcorrencia: string | null = null;

  transicoes.forEach((t) => {
    if (t.de === de) {
      totalAnterior++;
      if (t.para === para) {
        quantidade++;
        ultimaOcorrencia = t.criadoEm;
      }
    }
  });

  const pct = totalAnterior > 0 ? (quantidade / totalAnterior) * 100 : 0;

  return {
    anterior: de,
    atual: para,
    quantidade,
    percentual: `${pct.toFixed(2)}%`,
    percentualNumero: Number(pct.toFixed(2)),
    totalOcorrenciasAnterior: totalAnterior,
    ultimaOcorrencia,
  };
}
