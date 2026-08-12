import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { getCutoffTimestamp } from './limpezaState';
import { OBJETOS_PERMITIDOS } from './transicaoService';
import { analisarSequencia3, analisarSequencia4 } from './sequenciaService';

export type NivelConfianca = 'BAIXA' | 'MÉDIA' | 'ALTA';

export interface PadraoAlternancia {
  tipo: 'alternancia';
  objetos: [string, string];
  ocorrencias: number;
  confianca: NivelConfianca;
  descricao: string;
}

export interface PadraoRepeticao {
  tipo: 'repeticao';
  objeto: string;
  quantidadeMaiorSequencia: number;
  ocorrenciasTotais: number;
  confianca: NivelConfianca;
  descricao: string;
}

export interface DetalheAtrasoItem {
  objeto: string;
  ultimaOcorrenciaEm: string | null;
  rodadasSemAparecer: number;
  atrasoRelativo: string;
}

export interface PadraoAtrasos {
  tipo: 'atrasos';
  totalRodadasAnalisadas: number;
  objetoMaisAtrasado: string | null;
  maiorAtrasoRodadas: number;
  itens: DetalheAtrasoItem[];
}

export interface PadraoRecenteComparacao {
  objeto: string;
  freqJanelaRecente: number;
  pctJanelaRecente: string;
  pctGeralHistorico: string;
  diferencaPct: string;
  tendencia: 'alta' | 'baixa' | 'estavel';
}

export interface PadraoRecenteResult {
  tipo: 'padroes_recentes';
  janela: number;
  totalRodadasGerais: number;
  comparacoes: PadraoRecenteComparacao[];
}

export interface PadraoSequenciaFrequente {
  tipo: 'sequencia_frequente';
  tamanho: number;
  sequenciaTexto: string;
  quantidade: number;
  porcentagem: string;
  confianca: NivelConfianca;
}

export interface ResultadoDetectorPadroes {
  sucesso: boolean;
  tempoExecucaoMs: number;
  totalRegistrosAnalisados: number;
  padroesAtivos: {
    alternancias: PadraoAlternancia[];
    repeticoes: PadraoRepeticao[];
    atrasos: PadraoAtrasos;
    sequenciasFrequentes: PadraoSequenciaFrequente[];
  };
  padroesRecentes: PadraoRecenteResult;
  resumoConfiancaGeral: NivelConfianca;
  mensagem?: string;
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
 * Classifica a confiança com base na quantidade de ocorrências reais.
 * BAIXA: < 20
 * MÉDIA: 20 a 100
 * ALTA: > 100
 */
export function calcularNivelConfianca(ocorrencias: number): NivelConfianca {
  if (ocorrencias > 100) return 'ALTA';
  if (ocorrencias >= 20) return 'MÉDIA';
  return 'BAIXA';
}

/**
 * Obtém todo o histórico cronológico de resultados.
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
      if (error) logger.error('Erro ao buscar historico no padraoService:', error.message);
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
    logger.error('Exceção ao buscar histórico no padraoService:', err?.message);
    return { itens: [], criadoEms: [] };
  }
}

/**
 * 1. detectarAlternancias()
 * Encontra padrões de troca entre dois objetos (ex: Boia -> Soco -> Boia -> Soco).
 */
export async function detectarAlternancias(
  historicoItens?: string[]
): Promise<PadraoAlternancia[]> {
  const itens = historicoItens || (await obterHistoricoCronologico()).itens;
  const N = itens.length;

  if (N < 4) return [];

  const paresContagem: Record<string, { objA: string; objB: string; count: number }> = {};

  for (let i = 0; i < N - 3; i++) {
    const a = itens[i];
    const b = itens[i + 1];
    if (a !== b) {
      // Verificar se há troca A -> B -> A -> B ou B -> A -> B -> A
      if (itens[i + 2] === a && itens[i + 3] === b) {
        const key = [a, b].sort().join('↔');
        if (!paresContagem[key]) {
          paresContagem[key] = { objA: a < b ? a : b, objB: a < b ? b : a, count: 0 };
        }
        paresContagem[key].count++;
      }
    }
  }

  const resultados: PadraoAlternancia[] = Object.values(paresContagem)
    .sort((x, y) => y.count - x.count)
    .map((item) => {
      const confianca = calcularNivelConfianca(item.count);
      return {
        tipo: 'alternancia',
        objetos: [item.objA, item.objB],
        ocorrencias: item.count,
        confianca,
        descricao: `Alternância entre ${item.objA} e ${item.objB} identificada ${item.count} vezes (${confianca} confiança).`,
      };
    });

  return resultados;
}

/**
 * 2. detectarRepeticoes()
 * Encontra repetições consecutivas de um mesmo objeto (3x, 4x, 5x, 6+).
 */
export async function detectarRepeticoes(
  historicoItens?: string[]
): Promise<PadraoRepeticao[]> {
  const itens = historicoItens || (await obterHistoricoCronologico()).itens;
  const N = itens.length;

  if (N < 2) return [];

  const estatisticasRep: Record<string, { maxRun: number; totalRuns: number; runCount2: number; runCount3Plus: number }> = {};

  OBJETOS_PERMITIDOS.forEach((obj) => {
    estatisticasRep[obj] = { maxRun: 0, totalRuns: 0, runCount2: 0, runCount3Plus: 0 };
  });

  let curItem = itens[0];
  let curRun = 1;

  for (let i = 1; i < N; i++) {
    if (itens[i] === curItem) {
      curRun++;
    } else {
      if (curRun >= 2 && estatisticasRep[curItem]) {
        estatisticasRep[curItem].totalRuns++;
        if (curRun === 2) estatisticasRep[curItem].runCount2++;
        if (curRun >= 3) estatisticasRep[curItem].runCount3Plus++;
        if (curRun > estatisticasRep[curItem].maxRun) {
          estatisticasRep[curItem].maxRun = curRun;
        }
      }
      curItem = itens[i];
      curRun = 1;
    }
  }
  // Processar última run
  if (curRun >= 2 && estatisticasRep[curItem]) {
    estatisticasRep[curItem].totalRuns++;
    if (curRun === 2) estatisticasRep[curItem].runCount2++;
    if (curRun >= 3) estatisticasRep[curItem].runCount3Plus++;
    if (curRun > estatisticasRep[curItem].maxRun) {
      estatisticasRep[curItem].maxRun = curRun;
    }
  }

  const resultados: PadraoRepeticao[] = Object.entries(estatisticasRep)
    .filter(([_, stats]) => stats.totalRuns > 0)
    .map(([objeto, stats]): PadraoRepeticao => {
      const confianca = calcularNivelConfianca(stats.totalRuns);
      return {
        tipo: 'repeticao',
        objeto,
        quantidadeMaiorSequencia: stats.maxRun,
        ocorrenciasTotais: stats.totalRuns,
        confianca,
        descricao: `${objeto} repetiu-se consecutivamente ${stats.totalRuns} vezes (maior sequência: ${stats.maxRun}x em seguida).`,
      };
    })
    .sort((a, b) => b.ocorrenciasTotais - a.ocorrenciasTotais);

  return resultados;
}

/**
 * 3. detectarAtrasos()
 * Analisa objetos que estão há mais tempo sem aparecer no histórico.
 */
export async function detectarAtrasos(
  historicoItens?: string[],
  criadoEms?: string[]
): Promise<PadraoAtrasos> {
  const data = historicoItens
    ? { itens: historicoItens, criadoEms: criadoEms || [] }
    : await obterHistoricoCronologico();

  const N = data.itens.length;

  const ultimosIndices: Record<string, { index: number; dataEm: string | null }> = {};
  OBJETOS_PERMITIDOS.forEach((obj) => {
    ultimosIndices[obj] = { index: -1, dataEm: null };
  });

  for (let i = 0; i < N; i++) {
    const item = data.itens[i];
    if (ultimosIndices[item]) {
      ultimosIndices[item] = {
        index: i,
        dataEm: data.criadoEms[i] || null,
      };
    }
  }

  const itensFormatados: DetalheAtrasoItem[] = OBJETOS_PERMITIDOS.map((objeto) => {
    const info = ultimosIndices[objeto];
    const rodadasSemAparecer = info.index === -1 ? N : N - 1 - info.index;
    return {
      objeto,
      ultimaOcorrenciaEm: info.dataEm,
      rodadasSemAparecer,
      atrasoRelativo: `${rodadasSemAparecer} rodada(s) sem sair`,
    };
  }).sort((a, b) => b.rodadasSemAparecer - a.rodadasSemAparecer);

  const objetoMaisAtrasado = itensFormatados.length > 0 ? itensFormatados[0].objeto : null;
  const maiorAtrasoRodadas = itensFormatados.length > 0 ? itensFormatados[0].rodadasSemAparecer : 0;

  return {
    tipo: 'atrasos',
    totalRodadasAnalisadas: N,
    objetoMaisAtrasado,
    maiorAtrasoRodadas,
    itens: itensFormatados,
  };
}

/**
 * 4. detectarPadroesRecentes()
 * Analisa as últimas rodadas (janela de 20, 50 ou 100 resultados) e compara com a média geral.
 */
export async function detectarPadroesRecentes(
  tamanhoJanela: number = 50,
  historicoItens?: string[]
): Promise<PadraoRecenteResult> {
  const itens = historicoItens || (await obterHistoricoCronologico()).itens;
  const N = itens.length;

  if (N === 0) {
    return {
      tipo: 'padroes_recentes',
      janela: tamanhoJanela,
      totalRodadasGerais: 0,
      comparacoes: [],
    };
  }

  const janelaReal = Math.min(tamanhoJanela, N);
  const itensJanela = itens.slice(N - janelaReal);

  const contagemJanela: Record<string, number> = {};
  const contagemGeral: Record<string, number> = {};

  OBJETOS_PERMITIDOS.forEach((obj) => {
    contagemJanela[obj] = 0;
    contagemGeral[obj] = 0;
  });

  itensJanela.forEach((item) => {
    if (contagemJanela[item] !== undefined) contagemJanela[item]++;
  });

  itens.forEach((item) => {
    if (contagemGeral[item] !== undefined) contagemGeral[item]++;
  });

  const comparacoes: PadraoRecenteComparacao[] = OBJETOS_PERMITIDOS.map((objeto) => {
    const countJan = contagemJanela[objeto] || 0;
    const countGer = contagemGeral[objeto] || 0;

    const pctJan = (countJan / janelaReal) * 100;
    const pctGer = (countGer / N) * 100;
    const diff = pctJan - pctGer;

    let tendencia: 'alta' | 'baixa' | 'estavel' = 'estavel';
    if (diff >= 3) tendencia = 'alta';
    else if (diff <= -3) tendencia = 'baixa';

    return {
      objeto,
      freqJanelaRecente: countJan,
      pctJanelaRecente: `${pctJan.toFixed(2)}%`,
      pctGeralHistorico: `${pctGer.toFixed(2)}%`,
      diferencaPct: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`,
      tendencia,
    };
  }).sort((a, b) => b.freqJanelaRecente - a.freqJanelaRecente);

  return {
    tipo: 'padroes_recentes',
    janela: janelaReal,
    totalRodadasGerais: N,
    comparacoes,
  };
}

/**
 * 5. detectarSequenciasFrequentes()
 * Encontra sequências de 3 e 4 resultados que mais se repetiram.
 */
export async function detectarSequenciasFrequentes(): Promise<PadraoSequenciaFrequente[]> {
  const [res3, res4] = await Promise.all([analisarSequencia3(), analisarSequencia4()]);

  const lista: PadraoSequenciaFrequente[] = [];

  if (res3.sucesso && res3.topSequencias) {
    res3.topSequencias.slice(0, 5).forEach((seq) => {
      lista.push({
        tipo: 'sequencia_frequente',
        tamanho: 3,
        sequenciaTexto: seq.sequenciaTexto,
        quantidade: seq.quantidade,
        porcentagem: seq.porcentagem,
        confianca: calcularNivelConfianca(seq.quantidade),
      });
    });
  }

  if (res4.sucesso && res4.topSequencias) {
    res4.topSequencias.slice(0, 5).forEach((seq) => {
      lista.push({
        tipo: 'sequencia_frequente',
        tamanho: 4,
        sequenciaTexto: seq.sequenciaTexto,
        quantidade: seq.quantidade,
        porcentagem: seq.porcentagem,
        confianca: calcularNivelConfianca(seq.quantidade),
      });
    });
  }

  return lista.sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Tenta salvar o padrão detectado na tabela 'padroes_detectados' no Supabase.
 * Nunca interrompe a aplicação caso a tabela não exista.
 */
async function salvarPadraoDetectadoNoBanco(
  sessaoId: string | number | null,
  tipoPadrao: string,
  descricao: string,
  dadosJson: any,
  quantidadeOcorrencias: number,
  nivelConfianca: NivelConfianca
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase.from('padroes_detectados').insert([
      {
        sessao_id: sessaoId || null,
        tipo_padrao: tipoPadrao,
        descricao,
        dados_json: dadosJson,
        quantidade_ocorrencias: quantidadeOcorrencias,
        nivel_confianca: nivelConfianca,
        criado_em: new Date().toISOString(),
      },
    ]);

    if (error) {
      logger.warn(`Aviso: Tabela 'padroes_detectados' indisponível (${error.message}). A análise continuará em memória/consulta direta.`);
    }
  } catch (err: any) {
    logger.warn(`Erro não-bloqueante ao salvar padrão no Supabase: ${err?.message}`);
  }
}

/**
 * Função Mestre: executarDetectorPadroes()
 * Executa todas as detecções e salva no Supabase.
 */
export async function executarDetectorPadroes(
  sessaoId?: string | number | null
): Promise<ResultadoDetectorPadroes> {
  const inicio = Date.now();

  const { itens, criadoEms } = await obterHistoricoCronologico();
  const N = itens.length;

  const [alternancias, repeticoes, atrasos, recentes, sequencias] = await Promise.all([
    detectarAlternancias(itens),
    detectarRepeticoes(itens),
    detectarAtrasos(itens, criadoEms),
    detectarPadroesRecentes(50, itens),
    detectarSequenciasFrequentes(),
  ]);

  const tempoExecucaoMs = Date.now() - inicio;

  // Determinar confiança geral
  const maiorQtd = Math.max(
    alternancias.length > 0 ? alternancias[0].ocorrencias : 0,
    repeticoes.length > 0 ? repeticoes[0].ocorrenciasTotais : 0,
    sequencias.length > 0 ? sequencias[0].quantidade : 0
  );

  const resumoConfiancaGeral = calcularNivelConfianca(maiorQtd);

  // Salvar principais padrões no banco de dados de forma não-bloqueante
  if (alternancias.length > 0) {
    const topAlt = alternancias[0];
    salvarPadraoDetectadoNoBanco(
      sessaoId || null,
      'alternancia',
      topAlt.descricao,
      topAlt,
      topAlt.ocorrencias,
      topAlt.confianca
    ).catch(() => {});
  }

  if (repeticoes.length > 0) {
    const topRep = repeticoes[0];
    salvarPadraoDetectadoNoBanco(
      sessaoId || null,
      'repeticao',
      topRep.descricao,
      topRep,
      topRep.ocorrenciasTotais,
      topRep.confianca
    ).catch(() => {});
  }

  logger.info(
    `Detector de Padrões Executado | Registros: ${N} | Alternâncias: ${alternancias.length} | Repetições: ${repeticoes.length} | Tempo: ${tempoExecucaoMs}ms`
  );

  return {
    sucesso: true,
    tempoExecucaoMs,
    totalRegistrosAnalisados: N,
    padroesAtivos: {
      alternancias,
      repeticoes,
      atrasos,
      sequenciasFrequentes: sequencias,
    },
    padroesRecentes: recentes,
    resumoConfiancaGeral,
  };
}
