import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import { StatisticsEngine } from './StatisticsEngine';
import {
  buscarUltimosResultados,
  buscarObjetoMaisFrequente,
  buscarObjetoMenosFrequente,
  buscarQuantidadePorObjeto,
  buscarMaiorAtraso,
} from './consultaService';
import { buscarMaisProvavelDepoisDe } from './transicaoService';
import {
  buscarProximoDepoisDaSequencia,
  analisarSequencia3,
  analisarSequencia4,
} from './sequenciaService';
import { executarDetectorPadroes } from './padraoService';
import {
  obterDashboardCompleto,
  obterObjetosAtrasados,
  obterRankingObjetos,
} from './dashboardService';
import {
  obterRelatorioEstatisticoCompleto,
  calcularProbabilidadeCondicional,
} from './estatisticaService';
import { OBJETOS_PERMITIDOS } from './resultadoService';
import { getSupabase } from '../database/supabase';

export type IntencaoCategoria =
  | 'HISTORICO'
  | 'TRANSICAO'
  | 'SEQUENCIA'
  | 'PADROES'
  | 'ESTATISTICAS'
  | 'REANALISE';

export interface RespostaEstruturadaInterna {
  intencao: IntencaoCategoria;
  modulo: string;
  dados: any;
  confianca: string;
  tempoExecucaoMs?: number;
  perguntaOriginal?: string;
}

export interface ResultadoOrquestradorAI {
  roteamento: RespostaEstruturadaInterna;
  explicacaoHumana: string;
  sucesso: boolean;
  tempoTotalMs: number;
}

/**
 * Executa uma verificação/reanálise no histórico visual gravado no Supabase.
 * Identifica possíveis lacunas nas rodadas, registros muito próximos ou inconsistências.
 */
export async function executarReanaliseHistorico() {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      sucesso: false,
      mensagem: 'Supabase não configurado.',
      totalAnalisados: 0,
      falhasDetectadas: 0,
      lacunasRodada: [],
    };
  }

  try {
    const { data, error } = await supabase
      .from('resultados')
      .select('rodada, objeto, criado_em')
      .order('criado_em', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      return {
        sucesso: true,
        mensagem: 'Nenhum histórico encontrado para reanálise.',
        totalAnalisados: 0,
        falhasDetectadas: 0,
        lacunasRodada: [],
      };
    }

    const lacunasRodada: number[] = [];
    let duplicadosSuspeitos = 0;

    for (let i = 0; i < data.length - 1; i++) {
      const atual = data[i];
      const proximo = data[i + 1];

      // Checar se a diferença de rodadas tem lacunas (ex: rodada 10 e rodada 8 => faltou rodada 9)
      if (atual.rodada && proximo.rodada && atual.rodada - proximo.rodada > 1) {
        for (let r = proximo.rodada + 1; r < atual.rodada; r++) {
          lacunasRodada.push(r);
        }
      }

      // Checar registros duplicados muito próximos (< 2s)
      if (atual.criado_em && proximo.criado_em) {
        const diffMs = Math.abs(
          new Date(atual.criado_em).getTime() - new Date(proximo.criado_em).getTime()
        );
        if (diffMs < 2000 && ((atual as any).objeto || (atual as any).item) === ((proximo as any).objeto || (proximo as any).item)) {
          duplicadosSuspeitos++;
        }
      }
    }

    return {
      sucesso: true,
      totalAnalisados: data.length,
      falhasDetectadas: lacunasRodada.length + duplicadosSuspeitos,
      lacunasRodada,
      duplicadosSuspeitos,
      statusGeral:
        lacunasRodada.length === 0 && duplicadosSuspeitos === 0
          ? 'Histórico Íntegro (Nenhuma falha grave encontrada)'
          : 'Falhas/Inconsistências identificadas no histórico recente',
    };
  } catch (err: any) {
    return {
      sucesso: false,
      mensagem: err?.message || 'Erro ao reanalisar histórico.',
      totalAnalisados: 0,
      falhasDetectadas: 0,
    };
  }
}

/**
 * Classifica a intenção da pergunta do usuário em uma das 6 categorias oficiais.
 */
export function identificarIntencao(query: string): {
  intencao: IntencaoCategoria;
  modulo: string;
  objetosMencionados: string[];
} {
  const queryLower = query.toLowerCase().trim();

  // Extrair objetos permitidos em ordem de aparição na frase
  const objetosMencionados = OBJETOS_PERMITIDOS.map((obj) => ({
    obj,
    idx: queryLower.indexOf(obj),
  }))
    .filter((item) => item.idx !== -1)
    .sort((a, b) => a.idx - b.idx)
    .map((item) => item.obj);

  // 1. REANALISE
  if (
    queryLower.includes('reanalise') ||
    queryLower.includes('reanalisar') ||
    queryLower.includes('analise a roda') ||
    queryLower.includes('analisar a roda') ||
    queryLower.includes('analise novamente a barra') ||
    queryLower.includes('analise a barra') ||
    queryLower.includes('veja se houve falha') ||
    queryLower.includes('houve falha') ||
    queryLower.includes('confira se houve erro') ||
    queryLower.includes('erro no histórico') ||
    queryLower.includes('erro no historico') ||
    queryLower.includes('veja se perdi alguma rodada') ||
    queryLower.includes('perdi alguma rodada') ||
    queryLower.includes('auditar') ||
    queryLower.includes('auditoria') ||
    queryLower.includes('confira o histórico') ||
    queryLower.includes('confira o historico') ||
    queryLower.includes('conferir histórico') ||
    queryLower.includes('conferir historico') ||
    queryLower.includes('falha no histórico') ||
    queryLower.includes('falha no historico') ||
    queryLower.includes('inconsistência') ||
    queryLower.includes('inconsistencia') ||
    queryLower.includes('erro na roda')
  ) {
    return { intencao: 'REANALISE', modulo: 'auditoriaService', objetosMencionados };
  }

  // 2. SEQUENCIA (Se houver 2+ objetos mencionados ou termos explícitos de sequência encadeada)
  if (
    objetosMencionados.length >= 2 ||
    queryLower.includes('sequência de 3') ||
    queryLower.includes('sequencia de 3') ||
    queryLower.includes('sequência de 4') ||
    queryLower.includes('sequencia de 4') ||
    queryLower.includes('nessa sequência') ||
    queryLower.includes('nessa sequencia') ||
    queryLower.includes('após essa sequência') ||
    queryLower.includes('apos essa sequencia')
  ) {
    return { intencao: 'SEQUENCIA', modulo: 'sequenciaService', objetosMencionados };
  }

  // 3. TRANSICAO (Transição simples de 1 objeto para o próximo)
  if (
    queryLower.includes('depois de') ||
    queryLower.includes('vem depois') ||
    queryLower.includes('próximo depois') ||
    queryLower.includes('proximo depois') ||
    queryLower.includes('qual aparece depois') ||
    queryLower.includes('qual o sucessor') ||
    queryLower.includes('sucessor de') ||
    queryLower.includes('transição') ||
    queryLower.includes('transicao') ||
    (queryLower.includes('após') && objetosMencionados.length === 1) ||
    (queryLower.includes('apos') && objetosMencionados.length === 1)
  ) {
    return { intencao: 'TRANSICAO', modulo: 'transicaoService', objetosMencionados };
  }

  // 4. PADROES (Detector de padrões, repetições, alternâncias, tendências)
  if (
    queryLower.includes('padrão') ||
    queryLower.includes('padrao') ||
    queryLower.includes('padrões') ||
    queryLower.includes('padroes') ||
    queryLower.includes('repetindo') ||
    queryLower.includes('repetição') ||
    queryLower.includes('repeticao') ||
    queryLower.includes('alternância') ||
    queryLower.includes('alternancia') ||
    queryLower.includes('tendência') ||
    queryLower.includes('tendencia') ||
    queryLower.includes('comportamento') ||
    queryLower.includes('acontecendo')
  ) {
    return { intencao: 'PADROES', modulo: 'padraoService', objetosMencionados };
  }

  // 5. HISTORICO (Consultas sobre histórico recente/últimas rodadas)
  if (
    queryLower.includes('últimos resultados') ||
    queryLower.includes('ultimos resultados') ||
    queryLower.includes('últimas rodadas') ||
    queryLower.includes('ultimas rodadas') ||
    queryLower.includes('mostre o histórico') ||
    queryLower.includes('mostre o historico') ||
    queryLower.includes('veja o histórico') ||
    queryLower.includes('veja o historico') ||
    queryLower.includes('ver histórico') ||
    queryLower.includes('ver historico') ||
    queryLower.includes('últimos símbolos') ||
    queryLower.includes('ultimos simbolos')
  ) {
    return { intencao: 'HISTORICO', modulo: 'consultaService', objetosMencionados };
  }

  // 6. ESTATISTICAS (Dashboard, atrasados, mais/menos frequentes, porcentagens)
  if (
    queryLower.includes('atrasado') ||
    queryLower.includes('maior atraso') ||
    queryLower.includes('mais saiu') ||
    queryLower.includes('menos saiu') ||
    queryLower.includes('mais apareceu') ||
    queryLower.includes('menos apareceu') ||
    queryLower.includes('frequência') ||
    queryLower.includes('frequencia') ||
    queryLower.includes('estatística') ||
    queryLower.includes('estatistica') ||
    queryLower.includes('ranking') ||
    queryLower.includes('porcentagem')
  ) {
    return { intencao: 'ESTATISTICAS', modulo: 'dashboardService', objetosMencionados };
  }

  // Fallback padrão se não se encaixar estritamente: ESTATISTICAS
  return { intencao: 'ESTATISTICAS', modulo: 'dashboardService', objetosMencionados };
}

/**
 * Função Mestre: processarOrquestradorAI
 * Recebe a pergunta do usuário, interpreta a intenção, escolhe e executa o serviço correto,
 * gera a resposta estruturada e utiliza o Gemini para traduzir em texto humano profissional.
 */
export async function processarOrquestradorAI(
  pergunta: string
): Promise<ResultadoOrquestradorAI> {
  const tempoInicio = Date.now();

  if (!pergunta || typeof pergunta !== 'string' || !pergunta.trim()) {
    throw new Error('Nenhuma pergunta válida foi fornecida.');
  }

  // 1. Identificar intenção e extrair objetos
  const { intencao, modulo, objetosMencionados } = identificarIntencao(pergunta);

  // Consultar StatisticsEngine obrigatoriamente
  const objetoAlvo = objetosMencionados[0] || 'soco';
  const statsNextAfter = await StatisticsEngine.getNextAfter(objetoAlvo);
  const statsFrequency = await StatisticsEngine.getFrequency();
  const statsLast10 = await StatisticsEngine.getLastResults(10);
  const statsSequences = await StatisticsEngine.getSequences();

  let dadosBackend: any = {
    statisticsEngine: {
      objetoPesquisado: objetoAlvo,
      nextAfter: statsNextAfter,
      frequency: statsFrequency,
      lastResults: statsLast10,
      sequences: statsSequences,
    },
  };
  let confianca = '85%';

  // 2. Executar o serviço backend correto com base na intenção
  switch (intencao) {
    case 'HISTORICO': {
      const res = await buscarUltimosResultados(20);
      dadosBackend = { ...dadosBackend, consultaService: res };
      confianca = '95%';
      break;
    }

    case 'TRANSICAO': {
      dadosBackend = {
        ...dadosBackend,
        transicaoCalculadaEngine: statsNextAfter,
      };
      confianca = '95%';
      break;
    }

    case 'SEQUENCIA': {
      if (objetosMencionados.length >= 2) {
        const res = await buscarProximoDepoisDaSequencia(objetosMencionados);
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      } else if (pergunta.toLowerCase().includes('4')) {
        const res = await analisarSequencia4();
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      } else {
        const res = await analisarSequencia3();
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      }
      confianca = '90%';
      break;
    }

    case 'PADROES': {
      const res = await executarDetectorPadroes();
      dadosBackend = { ...dadosBackend, padroesRes: res };
      confianca = '90%';
      break;
    }

    case 'ESTATISTICAS': {
      const pLower = pergunta.toLowerCase();
      const relatorio = await obterRelatorioEstatisticoCompleto();

      if (pLower.includes('atrasado') || pLower.includes('atraso')) {
        dadosBackend = {
          ...dadosBackend,
          atrasos: relatorio.atrasos,
          confianca: relatorio.confianca,
        };
      } else if (pLower.includes('frequência') || pLower.includes('frequencia')) {
        dadosBackend = {
          ...dadosBackend,
          frequencias: relatorio.frequencias,
          confianca: relatorio.confianca,
        };
      } else {
        dadosBackend = { ...dadosBackend, relatorioEstatistico: relatorio };
      }
      confianca = relatorio.confianca?.nivelGeral === 'alta' ? '95%' : relatorio.confianca?.nivelGeral === 'media' ? '85%' : '70%';
      break;
    }

    case 'REANALISE': {
      dadosBackend = { ...dadosBackend, reanalise: await executarReanaliseHistorico() };
      confianca = '90%';
      break;
    }

    default: {
      dadosBackend = { ...dadosBackend, dashboard: await obterDashboardCompleto() };
      confianca = '80%';
      break;
    }
  }

  const tempoExecucaoMs = Date.now() - tempoInicio;

  // Logging OBRIGATÓRIO de orquestração
  logger.info(`Pergunta recebida: "${pergunta}"`);
  logger.info(`Intenção detectada: ${intencao}`);
  logger.info(`Serviço utilizado: ${modulo}`);
  logger.info(`Tempo: ${tempoExecucaoMs}ms`);

  // 3. Resposta Estruturada Interna
  const respostaEstruturada: RespostaEstruturadaInterna = {
    intencao,
    modulo,
    dados: dadosBackend,
    confianca,
    tempoExecucaoMs,
    perguntaOriginal: pergunta,
  };

  // 4. Verificar se há dados suficientes
  const semDadosOuInsuficiente =
    !dadosBackend ||
    (Array.isArray(dadosBackend) && dadosBackend.length === 0) ||
    (dadosBackend.dados && Array.isArray(dadosBackend.dados) && dadosBackend.dados.length === 0) ||
    dadosBackend.dadosInsuficientes === true ||
    dadosBackend.totalRegistrosAnalisados === 0 ||
    dadosBackend.totalRodadas === 0;

  let explicacaoHumana = '';

  if (semDadosOuInsuficiente) {
    explicacaoHumana =
      'Não encontrei dados suficientes no histórico para realizar essa análise.';
  } else {
    // Sintetizar com Gemini se a API KEY estiver configurada
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });

        const promptSintese = `Você é o assistente orquestrador de IA do "Farm Fishing AI".

DADOS ESTATÍSTICOS OFICIAIS RETORNADOS PELO BANCO DE DADOS:
${JSON.stringify(respostaEstruturada, null, 2)}

REGRAS RÍGIDAS DE RESPOSTA:
1. Responda à pergunta do usuário: "${pergunta}"
2. Use EXCLUSIVAMENTE os dados estatísticos reais fornecidos acima.
3. NUNCA invente números, contagens ou probabilidades.
4. Se os dados forem vazios ou indicarem insuficiência de rodadas, responda exatamente:
   "Não encontrei dados suficientes no histórico para realizar essa análise."
5. Seja claro, direto, elegante e profissional em Português.`;

        const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
        let geminiRes: any = null;

        for (const m of modelsToTry) {
          try {
            geminiRes = await ai.models.generateContent({
              model: m,
              contents: promptSintese,
            });
            if (geminiRes) break;
          } catch (err: any) {
            const isQuota = err?.status === 429 || err?.code === 429 || (err?.message && err.message.includes('429'));
            if (isQuota) continue;
            throw err;
          }
        }

        explicacaoHumana =
          geminiRes?.text ||
          'Não encontrei dados suficientes no histórico para realizar essa análise.';
      } catch (err: any) {
        logger.error('Erro na síntese com Gemini:', err?.message);
        explicacaoHumana =
          'Não encontrei dados suficientes no histórico para realizar essa análise.';
      }
    } else {
      explicacaoHumana =
        'Não encontrei dados suficientes no histórico para realizar essa análise.';
    }
  }

  const tempoTotalMs = Date.now() - tempoInicio;

  return {
    roteamento: respostaEstruturada,
    explicacaoHumana,
    sucesso: true,
    tempoTotalMs,
  };
}
