import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { getCutoffTimestamp } from './limpezaState';
import { OBJETOS_PERMITIDOS } from './resultadoService';

export type ObjetoPermitido = typeof OBJETOS_PERMITIDOS[number];

export interface FrequenciaObjeto {
  quantidade: number;
  percentual: number;
  percentualFormatado: string;
}

export interface FrequenciaJanelas {
  janela20: Record<string, FrequenciaObjeto>;
  janela50: Record<string, FrequenciaObjeto>;
  janela100: Record<string, FrequenciaObjeto>;
  janela500: Record<string, FrequenciaObjeto>;
  historicoCompleto: Record<string, FrequenciaObjeto>;
}

export interface AtrasoObjeto {
  objeto: string;
  atrasoAtual: number; // Quantidade de rodadas desde a última ocorrência (0 = saiu na última)
  maiorAtrasoHistorico: number; // Maior sequência contínua sem aparecer
  atrasoMedio: number; // Distância média em rodadas entre aparições
  ultimaOcorrenciaEm: string | null;
}

export interface IntervaloObjeto {
  objeto: string;
  intervalos: number[]; // Distâncias entre ocorrências consecutivas
  intervaloMedio: number; // Média dos intervalos
  intervaloMinimo: number;
  intervaloMaximo: number;
  totalOcorrencias: number;
}

export interface ProbabilidadeProximoItem {
  objeto: string;
  quantidade: number;
  porcentagem: number;
  porcentagemFormatada: string;
  confianca: 'baixa' | 'media' | 'alta';
}

export interface ProbabilidadeCondicional {
  sequenciaAnalisada: string[];
  totalOcorrenciasSequencia: number;
  distribuicaoProximo: Record<string, ProbabilidadeProximoItem>;
  proximoMaisProvavel: ProbabilidadeProximoItem | null;
  nivelConfianca: 'baixa' | 'media' | 'alta';
  mensagem?: string;
}

export interface DistribuicaoItem {
  objeto: string;
  frequencia: number;
  percentual: number;
  percentualFormatado: string;
  posicaoRanking: number;
}

export interface DesvioItem {
  objeto: string;
  percentualHistorico: number;
  percentualRecente: number;
  diferencaPercentual: number;
  diferencaFormatada: string;
  nivelDesvio: 'normal' | 'moderado' | 'alto';
  impacto: 'acima_da_media' | 'abaixo_da_media' | 'estavel';
}

export interface RelatorioEstatisticoCompleto {
  sucesso: boolean;
  dadosInsuficientes: boolean;
  mensagemInsuficiencia?: string;
  frequencias: FrequenciaJanelas;
  atrasos: Record<string, AtrasoObjeto>;
  intervalos: Record<string, IntervaloObjeto>;
  distribuicao: DistribuicaoItem[];
  desvios: DesvioItem[];
  confianca: {
    totalRodadas: number;
    nivelGeral: 'baixa' | 'media' | 'alta';
    descricao: string;
  };
  tempoCalculoMs: number;
  rodadasUtilizadas: number;
  fromCache: boolean;
}

// Estrutura do Cache Interno em Memória
let cacheEstatistico: RelatorioEstatisticoCompleto | null = null;
let timestampUltimoCalculo: number = 0;

/**
 * Invalida o cache estatístico interno.
 * Deve ser chamado sempre que uma nova rodada for registrada ou o histórico for alterado/corrigido.
 */
export function invalidarCacheEstatistico(): void {
  cacheEstatistico = null;
  timestampUltimoCalculo = 0;
  logger.info('[MOTOR ESTATÍSTICO] Cache estático invalidado com sucesso.');
}

/**
 * Normaliza e valida se um item pertence aos 8 objetos oficiais.
 */
function normalizarObjeto(item: string | null | undefined): string | null {
  if (!item) return null;
  const limpo = String(item).trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo as any)) {
    return limpo;
  }
  return null;
}

/**
 * 1. calcularIndiceConfianca()
 * Menos de 20 ocorrências: 'baixa'
 * 20 a 100: 'media'
 * Acima de 100: 'alta'
 */
export function calcularIndiceConfianca(totalAmostras: number): 'baixa' | 'media' | 'alta' {
  if (totalAmostras < 20) return 'baixa';
  if (totalAmostras <= 100) return 'media';
  return 'alta';
}

/**
 * Helper para extrair histórico bruto ordenado do Supabase.
 * Retorna itens do MAIS ANTIGO para o MAIS RECENTE (cronológico)
 */
async function buscarHistoricoBruto(): Promise<{
  itensMaisNovosPrimeiro: { id?: string | number; objeto: string; criadoEm: string; rodada?: number }[];
  itensMaisAntigosPrimeiro: { id?: string | number; objeto: string; criadoEm: string; rodada?: number }[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('*');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query.order('criado_em', { ascending: false });

    if (error || !data) {
      logger.error('Erro ao buscar histórico bruto no Supabase:', error?.message);
      return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
    }

    const maisNovos = data
      .map((row) => {
        const norm = normalizarObjeto(row.item || row.objeto);
        if (!norm) return null;
        return {
          id: row.id,
          objeto: norm,
          criadoEm: row.criado_em || new Date().toISOString(),
          rodada: row.rodada,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const maisAntigos = [...maisNovos].reverse();

    return {
      itensMaisNovosPrimeiro: maisNovos,
      itensMaisAntigosPrimeiro: maisAntigos,
    };
  } catch (err: any) {
    logger.error('Exceção ao buscar histórico bruto:', err?.message);
    return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
  }
}

/**
 * 2. calcularFrequencia()
 * Calcula a frequência absoluta e percentual dos 8 objetos para uma amostra dada.
 */
export function calcularFrequencia(
  amostraItens: { objeto: string }[]
): Record<string, FrequenciaObjeto> {
  const contagem: Record<string, number> = {};
  OBJETOS_PERMITIDOS.forEach((obj) => (contagem[obj] = 0));

  let totalValidos = 0;
  amostraItens.forEach((item) => {
    const norm = normalizarObjeto(item.objeto);
    if (norm && contagem[norm] !== undefined) {
      contagem[norm]++;
      totalValidos++;
    }
  });

  const resultado: Record<string, FrequenciaObjeto> = {};

  OBJETOS_PERMITIDOS.forEach((obj) => {
    const qtd = contagem[obj] || 0;
    const pct = totalValidos > 0 ? (qtd / totalValidos) * 100 : 0;
    resultado[obj] = {
      quantidade: qtd,
      percentual: Number(pct.toFixed(2)),
      percentualFormatado: `${pct.toFixed(2)}%`,
    };
  });

  return resultado;
}

/**
 * Helper para calcular frequências nas janelas de 20, 50, 100, 500 e histórico completo.
 */
export function calcularFrequenciasJanelas(
  itensMaisNovosPrimeiro: { objeto: string }[]
): FrequenciaJanelas {
  return {
    janela20: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 20)),
    janela50: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 50)),
    janela100: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 100)),
    janela500: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 500)),
    historicoCompleto: calcularFrequencia(itensMaisNovosPrimeiro),
  };
}

/**
 * 3. calcularAtrasos()
 * Para cada um dos 8 objetos calcula:
 * - quantidade de rodadas desde a última ocorrência (atrasoAtual)
 * - maior atraso histórico
 * - atraso médio (distância média entre ocorrências)
 * - última ocorrência em timestamp ISO
 */
export function calcularAtrasos(
  itensMaisNovosPrimeiro: { objeto: string; criadoEm: string }[]
): Record<string, AtrasoObjeto> {
  const totalRodadas = itensMaisNovosPrimeiro.length;
  const resultado: Record<string, AtrasoObjeto> = {};

  OBJETOS_PERMITIDOS.forEach((objeto) => {
    // 1. Atraso Atual & Última Ocorrência
    let atrasoAtual = totalRodadas;
    let ultimaOcorrenciaEm: string | null = null;

    for (let i = 0; i < totalRodadas; i++) {
      if (itensMaisNovosPrimeiro[i].objeto === objeto) {
        atrasoAtual = i; // 0 indica que saiu na última rodada (índice 0)
        ultimaOcorrenciaEm = itensMaisNovosPrimeiro[i].criadoEm;
        break;
      }
    }

    // 2. Maior Atraso Histórico & Atraso Médio
    // Varre em ordem cronológica (do mais antigo para o mais novo)
    const itensAntigos = [...itensMaisNovosPrimeiro].reverse();
    let maiorAtraso = 0;
    let contadorSemAparecer = 0;
    let aparicoes = 0;
    const intervalos: number[] = [];

    for (let i = 0; i < itensAntigos.length; i++) {
      if (itensAntigos[i].objeto === objeto) {
        aparicoes++;
        if (contadorSemAparecer > maiorAtraso) {
          maiorAtraso = contadorSemAparecer;
        }
        if (aparicoes > 1) {
          intervalos.push(contadorSemAparecer);
        }
        contadorSemAparecer = 0;
      } else {
        contadorSemAparecer++;
      }
    }

    // Considerar o atraso até o presente para o maior atraso
    if (contadorSemAparecer > maiorAtraso) {
      maiorAtraso = contadorSemAparecer;
    }

    // Atraso médio = Média dos intervalos entre aparições consecutivos
    let atrasoMedio = 0;
    if (intervalos.length > 0) {
      const soma = intervalos.reduce((acc, curr) => acc + curr, 0);
      atrasoMedio = Number((soma / intervalos.length).toFixed(1));
    } else if (aparicoes === 1 && totalRodadas > 1) {
      atrasoMedio = totalRodadas;
    }

    resultado[objeto] = {
      objeto,
      atrasoAtual,
      maiorAtrasoHistorico: maiorAtraso,
      atrasoMedio,
      ultimaOcorrenciaEm,
    };
  });

  return resultado;
}

/**
 * 4. calcularIntervalos()
 * Calcula a distância média entre duas ocorrências consecutivas do mesmo objeto.
 * Exemplo: Boia apareceu nas rodadas 10, 18, 27, 40 -> Intervalos: 8, 9, 13 -> Média: 10
 */
export function calcularIntervalos(
  itensMaisAntigosPrimeiro: { objeto: string }[]
): Record<string, IntervaloObjeto> {
  const resultado: Record<string, IntervaloObjeto> = {};

  OBJETOS_PERMITIDOS.forEach((objeto) => {
    // Coletar os índices (posições de rodada) em que o objeto apareceu
    const posicoes: number[] = [];
    itensMaisAntigosPrimeiro.forEach((item, index) => {
      if (item.objeto === objeto) {
        posicoes.push(index + 1); // Rodadas de 1 a N
      }
    });

    const intervalos: number[] = [];
    for (let i = 1; i < posicoes.length; i++) {
      intervalos.push(posicoes[i] - posicoes[i - 1]);
    }

    let intervaloMedio = 0;
    let intervaloMinimo = 0;
    let intervaloMaximo = 0;

    if (intervalos.length > 0) {
      const soma = intervalos.reduce((acc, curr) => acc + curr, 0);
      intervaloMedio = Number((soma / intervalos.length).toFixed(1));
      intervaloMinimo = Math.min(...intervalos);
      intervaloMaximo = Math.max(...intervalos);
    }

    resultado[objeto] = {
      objeto,
      intervalos,
      intervaloMedio,
      intervaloMinimo,
      intervaloMaximo,
      totalOcorrencias: posicoes.length,
    };
  });

  return resultado;
}

/**
 * 5. calcularProbabilidadeCondicional()
 * Permite perguntas como: Depois de Boia -> Soco ou Boia -> Soco -> Sorvete, qual objeto apareceu?
 * Retorna ocorrências, porcentagem e nível de confiança.
 */
export function calcularProbabilidadeCondicional(
  sequenciaInput: string[],
  itensMaisAntigosPrimeiro: { objeto: string }[]
): ProbabilidadeCondicional {
  // Normalizar sequência de entrada
  const seq = sequenciaInput
    .map((s) => normalizarObjeto(s))
    .filter((s): s is string => s !== null);

  if (seq.length === 0) {
    return {
      sequenciaAnalisada: [],
      totalOcorrenciasSequencia: 0,
      distribuicaoProximo: {},
      proximoMaisProvavel: null,
      nivelConfianca: 'baixa',
      mensagem: 'Nenhuma sequência válida foi informada para análise condicional.',
    };
  }

  const n = seq.length;
  const contagemProximo: Record<string, number> = {};
  OBJETOS_PERMITIDOS.forEach((obj) => (contagemProximo[obj] = 0));

  let totalEncontrado = 0;

  // Buscar no histórico cronológico
  for (let i = 0; i <= itensMaisAntigosPrimeiro.length - n - 1; i++) {
    let bateu = true;
    for (let j = 0; j < n; j++) {
      if (itensMaisAntigosPrimeiro[i + j].objeto !== seq[j]) {
        bateu = false;
        break;
      }
    }

    if (bateu) {
      const proximo = itensMaisAntigosPrimeiro[i + n].objeto;
      if (contagemProximo[proximo] !== undefined) {
        contagemProximo[proximo]++;
        totalEncontrado++;
      }
    }
  }

  const distribuicaoProximo: Record<string, ProbabilidadeProximoItem> = {};
  let maxQtd = -1;
  let proximoMaisProvavel: ProbabilidadeProximoItem | null = null;

  const nivelGeral = calcularIndiceConfianca(totalEncontrado);

  OBJETOS_PERMITIDOS.forEach((obj) => {
    const qtd = contagemProximo[obj] || 0;
    const pct = totalEncontrado > 0 ? (qtd / totalEncontrado) * 100 : 0;
    const itemProb: ProbabilidadeProximoItem = {
      objeto: obj,
      quantidade: qtd,
      porcentagem: Number(pct.toFixed(2)),
      porcentagemFormatada: `${pct.toFixed(2)}%`,
      confianca: calcularIndiceConfianca(qtd),
    };

    distribuicaoProximo[obj] = itemProb;

    if (qtd > maxQtd && qtd > 0) {
      maxQtd = qtd;
      proximoMaisProvavel = itemProb;
    }
  });

  return {
    sequenciaAnalisada: seq,
    totalOcorrenciasSequencia: totalEncontrado,
    distribuicaoProximo,
    proximoMaisProvavel,
    nivelConfianca: nivelGeral,
  };
}

/**
 * 6. calcularDistribuicao()
 * Retorna a distribuição completa dos 8 objetos com frequência, percentual e posição no ranking.
 */
export function calcularDistribuicao(
  itensMaisNovosPrimeiro: { objeto: string }[]
): DistribuicaoItem[] {
  const freq = calcularFrequencia(itensMaisNovosPrimeiro);

  const lista = OBJETOS_PERMITIDOS.map((objeto) => {
    const item = freq[objeto];
    return {
      objeto,
      frequencia: item.quantidade,
      percentual: item.percentual,
      percentualFormatado: item.percentualFormatado,
    };
  }).sort((a, b) => b.frequencia - a.frequencia);

  return lista.map((item, index) => ({
    posicaoRanking: index + 1,
    ...item,
  }));
}

/**
 * 7. detectarDesvios()
 * Compara Histórico Completo VS Últimas 100 rodadas.
 * Encontra objetos aparecendo muito acima ou abaixo do esperado.
 */
export function detectarDesvios(
  itensMaisNovosPrimeiro: { objeto: string }[]
): DesvioItem[] {
  const freqHistorico = calcularFrequencia(itensMaisNovosPrimeiro);
  const freqRecente = calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 100));

  return OBJETOS_PERMITIDOS.map((objeto) => {
    const pctHist = freqHistorico[objeto]?.percentual || 0;
    const pctRec = freqRecente[objeto]?.percentual || 0;
    const dif = Number((pctRec - pctHist).toFixed(2));

    const difAbs = Math.abs(dif);
    let nivelDesvio: 'normal' | 'moderado' | 'alto' = 'normal';
    if (difAbs >= 8) {
      nivelDesvio = 'alto';
    } else if (difAbs >= 4) {
      nivelDesvio = 'moderado';
    }

    let impacto: 'acima_da_media' | 'abaixo_da_media' | 'estavel' = 'estavel';
    if (dif > 2) {
      impacto = 'acima_da_media';
    } else if (dif < -2) {
      impacto = 'abaixo_da_media';
    }

    const difSinal = dif > 0 ? `+${dif.toFixed(2)}%` : `${dif.toFixed(2)}%`;

    return {
      objeto,
      percentualHistorico: pctHist,
      percentualRecente: pctRec,
      diferencaPercentual: dif,
      diferencaFormatada: difSinal,
      nivelDesvio,
      impacto,
    };
  }).sort((a, b) => Math.abs(b.diferencaPercentual) - Math.abs(a.diferencaPercentual));
}

/**
 * Função Mestre: obterRelatorioEstatisticoCompleto()
 * Ponto de entrada oficial para todas as estatísticas do sistema.
 * Suporta cache em memória e tratamento de base de dados insuficiente (< 5 rodadas).
 */
export async function obterRelatorioEstatisticoCompleto(
  forceRefresh: boolean = false
): Promise<RelatorioEstatisticoCompleto> {
  const inicio = Date.now();

  // 1. Checar se podemos servir direto do Cache
  if (!forceRefresh && cacheEstatistico) {
    logger.info(
      `[MOTOR ESTATÍSTICO] Servindo estatísticas do Cache em memória | Tempo: ${Date.now() - inicio}ms`
    );
    return {
      ...cacheEstatistico,
      fromCache: true,
      tempoCalculoMs: Date.now() - inicio,
    };
  }

  // 2. Buscar dados do banco de dados Supabase
  const { itensMaisNovosPrimeiro, itensMaisAntigosPrimeiro } = await buscarHistoricoBruto();
  const totalRodadas = itensMaisNovosPrimeiro.length;

  // 3. Regra de Segurança: Travar se base for insuficiente (< 5 rodadas)
  if (totalRodadas < 5) {
    const relatorioInsuficiente: RelatorioEstatisticoCompleto = {
      sucesso: false,
      dadosInsuficientes: true,
      mensagemInsuficiencia: 'Base histórica insuficiente para uma análise confiável.',
      frequencias: {
        janela20: calcularFrequencia([]),
        janela50: calcularFrequencia([]),
        janela100: calcularFrequencia([]),
        janela500: calcularFrequencia([]),
        historicoCompleto: calcularFrequencia([]),
      },
      atrasos: calcularAtrasos([]),
      intervalos: calcularIntervalos([]),
      distribuicao: calcularDistribuicao([]),
      desvios: detectarDesvios([]),
      confianca: {
        totalRodadas,
        nivelGeral: 'baixa',
        descricao: 'Base de dados insuficiente. Adicione pelo menos 5 rodadas.',
      },
      tempoCalculoMs: Date.now() - inicio,
      rodadasUtilizadas: totalRodadas,
      fromCache: false,
    };

    return relatorioInsuficiente;
  }

  // 4. Calcular todas as estatísticas usando as funções dedicadas
  const frequencias = calcularFrequenciasJanelas(itensMaisNovosPrimeiro);
  const atrasos = calcularAtrasos(itensMaisNovosPrimeiro);
  const intervalos = calcularIntervalos(itensMaisAntigosPrimeiro);
  const distribuicao = calcularDistribuicao(itensMaisNovosPrimeiro);
  const desvios = detectarDesvios(itensMaisNovosPrimeiro);
  const nivelGeral = calcularIndiceConfianca(totalRodadas);

  const tempoCalculoMs = Date.now() - inicio;

  const resultado: RelatorioEstatisticoCompleto = {
    sucesso: true,
    dadosInsuficientes: false,
    frequencias,
    atrasos,
    intervalos,
    distribuicao,
    desvios,
    confianca: {
      totalRodadas,
      nivelGeral,
      descricao:
        nivelGeral === 'alta'
          ? 'Nível de confiança ALTO (Mais de 100 rodadas analisadas).'
          : nivelGeral === 'media'
          ? 'Nível de confiança MÉDIO (Entre 20 e 100 rodadas analisadas).'
          : 'Nível de confiança BAIXO (Menos de 20 rodadas no histórico).',
    },
    tempoCalculoMs,
    rodadasUtilizadas: totalRodadas,
    fromCache: false,
  };

  // 5. Atualizar Cache Interno
  cacheEstatistico = resultado;
  timestampUltimoCalculo = Date.now();

  // Log de Performance Obrigatório
  logger.info(
    `[MOTOR ESTATÍSTICO] Novo cálculo estatístico concluído | Rodadas: ${totalRodadas} | Tempo: ${tempoCalculoMs}ms | Cache Atualizado`
  );

  return resultado;
}
