import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { getCutoffTimestamp } from './limpezaState';

export const OBJETOS_OFICIAIS = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
] as const;

export type ObjetoRoda = typeof OBJETOS_OFICIAIS[number];

export interface ResultadoProximoItem {
  quantidade: number;
  porcentagem: number;
}

export interface NextAfterResponse {
  objetoPesquisado: string;
  ocorrencias: number;
  resultados: Record<string, ResultadoProximoItem>;
}

export interface FrequenciaSimbolo {
  quantidade: number;
  porcentagem: number;
  porcentagemFormatada: string;
}

export interface FrequencyResponse {
  totalRodadas: number;
  frequencia: Record<string, FrequenciaSimbolo>;
  ultimoResultado: string | null;
  maisFrequentes: {
    objeto: string;
    quantidade: number;
    porcentagem: number;
  }[];
}

export interface SequenciaInfo {
  sequenciaTexto: string;
  itens: string[];
  quantidade: number;
  porcentagem: number;
}

export interface RepeticaoInfo {
  objeto: string;
  maiorSequenciaConsecutiva: number;
  totalOcorrenciasConsecutivas: number;
}

export interface MudancaPadraoInfo {
  alternancia: [string, string];
  quantidade: number;
  descricao: string;
}

export interface SequencesResponse {
  repeticoes: RepeticaoInfo[];
  sequenciasConsecutivas: SequenciaInfo[];
  mudancasPadrao: MudancaPadraoInfo[];
}

export interface ResultadoRegistroSupabase {
  id?: string | number;
  objeto: string;
  criadoEm: string;
  rodada?: number | null;
}

// Fallback in-memory storage for test/offline data if Supabase has no data
let fallbackMemoryHistory: ResultadoRegistroSupabase[] = [];

/**
 * Limpa o histórico em memória de fallback do StatisticsEngine.
 */
export function clearFallbackHistory(): void {
  fallbackMemoryHistory = [];
  logger.info('[StatisticsEngine] Histórico de fallback limpo.');
}

/**
 * Permite injetar ou definir histórico em memória para testes e ambiente offline.
 */
export function setFallbackHistory(history: { objeto: string; criadoEm?: string; rodada?: number }[]): void {
  fallbackMemoryHistory = history.map((item, idx) => ({
    id: idx + 1,
    objeto: StatisticsEngine.normalizarObjeto(item.objeto) || 'soco',
    criadoEm: item.criadoEm || new Date(Date.now() - (history.length - idx) * 10000).toISOString(),
    rodada: item.rodada || idx + 1,
  }));
  logger.info(`[StatisticsEngine] Histórico de fallback atualizado com ${fallbackMemoryHistory.length} registros.`);
}

/**
 * Adiciona um resultado diretamente ao histórico de testes/fallback.
 */
export function addTestResult(objeto: string): void {
  const norm = StatisticsEngine.normalizarObjeto(objeto);
  if (!norm) return;
  fallbackMemoryHistory.unshift({
    id: Date.now(),
    objeto: norm,
    criadoEm: new Date().toISOString(),
    rodada: fallbackMemoryHistory.length + 1,
  });
}

/**
 * Motor Estatístico Oficial do Farm Fishing.
 * Analisa unicamente dados reais provenientes do Supabase (com suporte a fallback em memória).
 * NENHUMA previsão aleatória ou palpite.
 */
export class StatisticsEngineClass {
  /**
   * Normaliza a string do objeto para um dos 8 objetos oficiais do Farm Fishing.
   */
  normalizarObjeto(objeto: string | null | undefined): string | null {
    if (!objeto) return null;
    const clean = String(objeto)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (OBJETOS_OFICIAIS.includes(clean as any)) {
      return clean;
    }
    // Mapeamento de sinonimos comuns
    if (clean === 'teddy' || clean === 'urso') return 'tedy';
    if (clean === 'soco' || clean === 'luva') return 'soco';
    if (clean === 'balao' || clean === 'balão') return 'balao';
    if (clean === 'boia' || clean === 'bóia') return 'boia';

    return null;
  }

  /**
   * Consulta o histórico bruto no Supabase.
   * Retorna do mais recente para o mais antigo (ou vice-versa se solicitado).
   */
  async fetchRawHistory(): Promise<{
    maisNovosPrimeiro: ResultadoRegistroSupabase[];
    maisAntigosPrimeiro: ResultadoRegistroSupabase[];
  }> {
    const supabase = getSupabase();
    const cutoff = getCutoffTimestamp();

    if (supabase) {
      try {
        let query = supabase
          .from('resultados')
          .select('*')
          .order('criado_em', { ascending: false });

        if (cutoff) {
          query = query.gt('criado_em', cutoff);
        }

        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          const mapped: (ResultadoRegistroSupabase | null)[] = data.map((row) => {
            const norm = this.normalizarObjeto(row.item || row.objeto);
            if (!norm) return null;
            return {
              id: row.id,
              objeto: norm,
              criadoEm: row.criado_em || new Date().toISOString(),
              rodada: row.rodada ?? null,
            };
          });

          const maisNovos: ResultadoRegistroSupabase[] = mapped.filter(
            (i): i is ResultadoRegistroSupabase => i !== null
          );

          if (maisNovos.length > 0) {
            const maisAntigos = [...maisNovos].reverse();
            return {
              maisNovosPrimeiro: maisNovos,
              maisAntigosPrimeiro: maisAntigos,
            };
          }
        }
      } catch (err: any) {
        logger.error('[StatisticsEngine] Erro ao consultar Supabase:', err?.message);
      }
    }

    // Usar fallback em memória se Supabase não retornar dados ou não estiver conectado
    const filteredFallback = cutoff
      ? fallbackMemoryHistory.filter((i) => i.criadoEm > cutoff)
      : fallbackMemoryHistory;

    const maisNovosFallback = [...filteredFallback];
    const maisAntigosFallback = [...filteredFallback].reverse();

    return {
      maisNovosPrimeiro: maisNovosFallback,
      maisAntigosPrimeiro: maisAntigosFallback,
    };
  }

  /**
   * 1. getLastResults(limit)
   * Retorna os últimos N resultados (mais recente → mais antigo).
   */
  async getLastResults(limit: number = 10): Promise<{
    sucesso: boolean;
    totalConsultado: number;
    limiteSolicitado: number;
    itens: string[];
    detalhes: ResultadoRegistroSupabase[];
  }> {
    const { maisNovosPrimeiro } = await this.fetchRawHistory();
    const limiteEfetivo = Math.max(1, limit);
    const fatiados = maisNovosPrimeiro.slice(0, limiteEfetivo);

    return {
      sucesso: true,
      totalConsultado: maisNovosPrimeiro.length,
      limiteSolicitado: limiteEfetivo,
      itens: fatiados.map((item) => item.objeto),
      detalhes: fatiados,
    };
  }

  /**
   * 2. getNextAfter(object)
   * Recebe um objeto (ex: "soco"), analisa todas as suas ocorrências no histórico,
   * e calcula qual resultado veio IMEDIATAMENTE DEPOIS.
   *
   * Formato de retorno estrito:
   * {
   *   objetoPesquisado: "soco",
   *   ocorrencias: 10,
   *   resultados: {
   *     boia: { quantidade: 6, porcentagem: 60 },
   *     sorvete: { quantidade: 4, porcentagem: 40 },
   *     ...
   *   }
   * }
   */
  async getNextAfter(object: string): Promise<NextAfterResponse> {
    const normSearch = this.normalizarObjeto(object) || object.toLowerCase().trim();
    const { maisAntigosPrimeiro } = await this.fetchRawHistory();

    const contagemSucessores: Record<string, number> = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      contagemSucessores[obj] = 0;
    });

    let ocorrencias = 0;

    // Percorre em ordem cronológica (do mais antigo ao mais novo)
    for (let i = 0; i < maisAntigosPrimeiro.length - 1; i++) {
      if (maisAntigosPrimeiro[i].objeto === normSearch) {
        ocorrencias++;
        const proximoObjeto = maisAntigosPrimeiro[i + 1].objeto;
        if (contagemSucessores[proximoObjeto] !== undefined) {
          contagemSucessores[proximoObjeto]++;
        } else {
          contagemSucessores[proximoObjeto] = 1;
        }
      }
    }

    const resultadosFormatted: Record<string, ResultadoProximoItem> = {};

    OBJETOS_OFICIAIS.forEach((obj) => {
      const qtd = contagemSucessores[obj] || 0;
      const pct = ocorrencias > 0 ? (qtd / ocorrencias) * 100 : 0;
      resultadosFormatted[obj] = {
        quantidade: qtd,
        porcentagem: Number(pct.toFixed(2)),
      };
    });

    return {
      objetoPesquisado: normSearch,
      ocorrencias,
      resultados: resultadosFormatted,
    };
  }

  /**
   * 3. getFrequency()
   * Calcula a quantidade total de cada símbolo e a porcentagem geral no histórico.
   */
  async getFrequency(): Promise<FrequencyResponse> {
    const { maisNovosPrimeiro } = await this.fetchRawHistory();
    const totalRodadas = maisNovosPrimeiro.length;

    const contagem: Record<string, number> = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      contagem[obj] = 0;
    });

    maisNovosPrimeiro.forEach((item) => {
      if (contagem[item.objeto] !== undefined) {
        contagem[item.objeto]++;
      }
    });

    const frequencia: Record<string, FrequenciaSimbolo> = {};

    OBJETOS_OFICIAIS.forEach((obj) => {
      const qtd = contagem[obj] || 0;
      const pct = totalRodadas > 0 ? (qtd / totalRodadas) * 100 : 0;
      frequencia[obj] = {
        quantidade: qtd,
        porcentagem: Number(pct.toFixed(2)),
        porcentagemFormatada: `${pct.toFixed(2)}%`,
      };
    });

    const ultimoResultado = maisNovosPrimeiro.length > 0 ? maisNovosPrimeiro[0].objeto : null;

    const maisFrequentes = OBJETOS_OFICIAIS.map((obj) => ({
      objeto: obj,
      quantidade: contagem[obj] || 0,
      porcentagem: totalRodadas > 0 ? Number(((contagem[obj] / totalRodadas) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.quantidade - a.quantidade);

    return {
      totalRodadas,
      frequencia,
      ultimoResultado,
      maisFrequentes,
    };
  }

  /**
   * 4. getSequences()
   * Identifica:
   * - repetição (símbolos consecutivos iguais);
   * - sequências consecutivas de 2 e 3 símbolos;
   * - mudanças de padrão (alternâncias frequentes).
   */
  async getSequences(): Promise<SequencesResponse> {
    const { maisAntigosPrimeiro } = await this.fetchRawHistory();
    const total = maisAntigosPrimeiro.length;

    // 1. Repetições consecutivas do mesmo símbolo
    const repeticoesMap: Record<string, { maiorSeq: number; totalConsecutivas: number }> = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      repeticoesMap[obj] = { maiorSeq: 1, totalConsecutivas: 0 };
    });

    let itemAtual = '';
    let contadorSeqAtual = 0;

    for (let i = 0; i < total; i++) {
      const obj = maisAntigosPrimeiro[i].objeto;
      if (obj === itemAtual) {
        contadorSeqAtual++;
        repeticoesMap[obj].totalConsecutivas++;
        if (contadorSeqAtual > repeticoesMap[obj].maiorSeq) {
          repeticoesMap[obj].maiorSeq = contadorSeqAtual;
        }
      } else {
        itemAtual = obj;
        contadorSeqAtual = 1;
      }
    }

    const repeticoes: RepeticaoInfo[] = OBJETOS_OFICIAIS.map((obj) => ({
      objeto: obj,
      maiorSequenciaConsecutiva: repeticoesMap[obj].maiorSeq,
      totalOcorrenciasConsecutivas: repeticoesMap[obj].totalConsecutivas,
    })).sort((a, b) => b.maiorSequenciaConsecutiva - a.maiorSequenciaConsecutiva);

    // 2. Sequências consecutivas de 2 símbolos
    const seq2Map: Record<string, number> = {};
    for (let i = 0; i < total - 1; i++) {
      const pairKey = `${maisAntigosPrimeiro[i].objeto} → ${maisAntigosPrimeiro[i + 1].objeto}`;
      seq2Map[pairKey] = (seq2Map[pairKey] || 0) + 1;
    }

    const totalPares = Math.max(1, total - 1);
    const sequenciasConsecutivas: SequenciaInfo[] = Object.entries(seq2Map)
      .map(([seqKey, qtd]) => ({
        sequenciaTexto: seqKey,
        itens: seqKey.split(' → '),
        quantidade: qtd,
        porcentagem: Number(((qtd / totalPares) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10);

    // 3. Mudanças de Padrão (Alternâncias A -> B -> A)
    const alternanciasMap: Record<string, number> = {};
    for (let i = 0; i < total - 2; i++) {
      const a = maisAntigosPrimeiro[i].objeto;
      const b = maisAntigosPrimeiro[i + 1].objeto;
      const c = maisAntigosPrimeiro[i + 2].objeto;

      if (a === c && a !== b) {
        const altKey = [a, b].sort().join(' ↔ ');
        alternanciasMap[altKey] = (alternanciasMap[altKey] || 0) + 1;
      }
    }

    const mudancasPadrao: MudancaPadraoInfo[] = Object.entries(alternanciasMap)
      .map(([altKey, qtd]) => {
        const parts = altKey.split(' ↔ ') as [string, string];
        return {
          alternancia: parts,
          quantidade: qtd,
          descricao: `Alternância identificada ${qtd}x entre ${parts[0]} e ${parts[1]}.`,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade);

    return {
      repeticoes,
      sequenciasConsecutivas,
      mudancasPadrao,
    };
  }
}

export const StatisticsEngine = new StatisticsEngineClass();
