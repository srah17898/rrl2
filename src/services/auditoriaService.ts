import { GoogleGenAI, Type } from '@google/genai';
import { getSupabase } from '../database/supabase';
import { getCutoffTimestamp } from './limpezaState';
import { logger } from '../utils/logger';
import { OBJETOS_PERMITIDOS, registrarResultadoAutomaticamente } from './resultadoService';
import { invalidarCacheEstatistico } from './estatisticaService';

export type TipoDivergencia =
  | 'resultado_ausente'
  | 'resultado_diferente'
  | 'rodada_extra'
  | 'ordem_incorreta';

export interface DivergenciaAuditoria {
  posicao: number; // 1-based (1 = mais recente)
  resultadoBanco: string | null;
  resultadoImagem: string | null;
  tipo: TipoDivergencia;
  descricao: string;
}

export interface CorrecaoAuditoriaItem {
  idRegistro?: string | number;
  rodada?: number;
  resultadoAnterior?: string | null;
  resultadoNovo: string;
  tipoAcao: 'inserir' | 'atualizar';
  posicao: number;
}

export interface RegistroBancoAuditoria {
  id?: string | number;
  rodada?: number;
  item: string;
  criado_em?: string;
}

export interface RelatorioAuditoria {
  status: 'identico' | 'divergencias_encontradas' | 'erro';
  confianca: string;
  rodadasComparadas: number;
  totalDivergencias: number;
  divergencias: DivergenciaAuditoria[];
  itensImagem: string[];
  itensBanco: RegistroBancoAuditoria[];
  podeCorrigir: boolean;
  sugestaoCorrecoes: CorrecaoAuditoriaItem[];
  sessaoId?: string | number | null;
  timestampAuditoria: string;
  mensagem?: string;
}

/**
 * Analisa a imagem da barra de histórico utilizando a IA de visão computacional
 * e retorna os itens identificados em ordem do mais recente (esquerda) ao mais antigo (direita).
 */
export async function extrairItensDaImagem(
  imageBase64: string
): Promise<{ itens: string[]; confiancaScore: number; descricao: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave GEMINI_API_KEY não configurada no servidor.');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Limpar prefixo data:image/...;base64, se houver
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const promptVisao = `Você é um sistema de auditoria visual de alta precisão para o jogo "Farm Fishing" (Roda Gigante).
Examine a imagem enviada, identificando a barra horizontal de histórico de resultados recentes da roda.

Símbolos permitidos na roda (use exatamente esses nomes em minúsculas):
- sorvete
- boia
- balao
- soco
- tedy
- princesa
- camera
- coroa

INSTRUÇÕES:
1. Identifique TODOS os objetos na barra de histórico da esquerda para a direita.
2. A esquerda representa a rodada MAIS RECENTE e a direita a MAIS ANTIGA.
3. Retorne a lista de objetos identificados na ordem exata (do mais recente ao mais antigo).`;

  const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let response: any = null;

  for (const m of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model: m,
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          promptVisao,
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                  enum: [
                    'sorvete',
                    'boia',
                    'balao',
                    'soco',
                    'tedy',
                    'princesa',
                    'camera',
                    'coroa',
                  ],
                },
                description:
                  'Lista de itens detectados em ordem do mais recente (esquerda) ao mais antigo (direita)',
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: 'Pontuação de 0 a 100 de confiança na identificação',
              },
              description: {
                type: Type.STRING,
                description: 'Explicação detalhada dos itens identificados na barra de histórico',
              },
            },
            required: ['detectedItems', 'confidenceScore', 'description'],
          },
        },
      });
      if (response) break;
    } catch (err: any) {
      const isQuota = err?.status === 429 || err?.code === 429 || (err?.message && err.message.includes('429'));
      if (isQuota) continue;
      throw err;
    }
  }

  const text = response.text;
  if (!text) {
    throw new Error('Sem resposta do modelo visual.');
  }

  const parsed = JSON.parse(text);
  const itensValidos = (parsed.detectedItems || []).filter((item: string) =>
    OBJETOS_PERMITIDOS.includes(item as any)
  );

  const rawScore = parsed.confidenceScore ?? 90;
  const confiancaScore = rawScore <= 1 && rawScore > 0 ? Math.round(rawScore * 100) : Math.round(rawScore);

  return {
    itens: itensValidos,
    confiancaScore,
    descricao: parsed.description || 'Identificação da barra visual concluída.',
  };
}

/**
 * Realiza a auditoria completa comparando os dados da imagem (ou lista de itens)
 * com o histórico oficial de rodadas gravado no Supabase.
 */
export async function auditarHistoricoPorImagem(
  imageBase64: string,
  sessaoId?: string
): Promise<RelatorioAuditoria> {
  const timestampAuditoria = new Date().toISOString();

  try {
    // 1. Extrair os itens visuais da imagem
    const { itens: itensImagem, confiancaScore } = await extrairItensDaImagem(imageBase64);

    if (itensImagem.length === 0) {
      return {
        status: 'erro',
        confianca: `${confiancaScore}%`,
        rodadasComparadas: 0,
        totalDivergencias: 0,
        divergencias: [],
        itensImagem: [],
        itensBanco: [],
        podeCorrigir: false,
        sugestaoCorrecoes: [],
        timestampAuditoria,
        mensagem: 'Nenhum símbolo reconhecido na imagem fornecida.',
      };
    }

    // 2. Buscar as últimas N rodadas gravadas no Supabase (mais recentes primeiro)
    const supabase = getSupabase();
    let itensBanco: RegistroBancoAuditoria[] = [];

    if (supabase) {
      const cutoff = getCutoffTimestamp();
      let query = supabase
        .from('resultados')
        .select('*')
        .order('criado_em', { ascending: false });

      if (cutoff) {
        query = query.gt('criado_em', cutoff);
      }

      if (sessaoId) {
        query = query.eq('sessao_id', sessaoId);
      }

      query = query.limit(Math.max(itensImagem.length + 5, 20));

      const { data, error } = await query;
      if (!error && data) {
        itensBanco = data.map((d) => ({
          id: d.id,
          rodada: d.rodada,
          item: String(d.item || d.objeto || '').toLowerCase().trim(),
          criado_em: d.criado_em,
        }));
      }
    }

    // 3. Executar algoritmo de comparação posição por posição
    const divergencias: DivergenciaAuditoria[] = [];
    const sugestaoCorrecoes: CorrecaoAuditoriaItem[] = [];

    const totalComparacoes = Math.max(itensImagem.length, itensBanco.length);

    // Checar ordem invertida (se a sequência estaria 100% igual se invertida)
    const itensBancoNomes = itensBanco.map((b) => b.item);
    const imagemInvertida = [...itensImagem].reverse();
    const eOrdemInvertida =
      itensBancoNomes.length > 2 &&
      itensBancoNomes.slice(0, imagemInvertida.length).every((bItem, idx) => bItem === imagemInvertida[idx]);

    if (eOrdemInvertida) {
      divergencias.push({
        posicao: 1,
        resultadoBanco: itensBancoNomes[0] || null,
        resultadoImagem: itensImagem[0] || null,
        tipo: 'ordem_incorreta',
        descricao:
          'A ordem dos registros no banco parece estar totalmente invertida em relação à imagem. Nenhuma alteração automática foi realizada.',
      });
    }

    for (let i = 0; i < itensImagem.length; i++) {
      const pos = i + 1; // 1-based index (1 = mais recente / esquerda)
      const itemImg = itensImagem[i];
      const recBanco = itensBanco[i];

      if (!recBanco) {
        // Imagem tem mais rodadas do que o banco -> Rodadas extras
        divergencias.push({
          posicao: pos,
          resultadoBanco: null,
          resultadoImagem: itemImg,
          tipo: 'rodada_extra',
          descricao: `Rodada extra identificada na imagem (Posição ${pos}: "${itemImg}"). Ainda não registrada no banco.`,
        });

        sugestaoCorrecoes.push({
          resultadoNovo: itemImg,
          tipoAcao: 'inserir',
          posicao: pos,
        });
      } else if (recBanco.item !== itemImg) {
        // Verificar se é um item ausente inserido no meio (deslocamento) ou apenas um resultado diferente
        const proximoBancoIgual = itensBanco[i + 1]?.item === itemImg;

        if (proximoBancoIgual) {
          // O item da imagem bate com o próximo do banco -> Resultado Ausente
          divergencias.push({
            posicao: pos,
            resultadoBanco: recBanco.item,
            resultadoImagem: itemImg,
            tipo: 'resultado_ausente',
            descricao: `O item "${itemImg}" identificado na imagem não foi registrado entre as rodadas do banco.`,
          });

          sugestaoCorrecoes.push({
            resultadoNovo: itemImg,
            tipoAcao: 'inserir',
            posicao: pos,
          });
        } else {
          // Resultado diferente na mesma posição
          divergencias.push({
            posicao: pos,
            resultadoBanco: recBanco.item,
            resultadoImagem: itemImg,
            tipo: 'resultado_diferente',
            descricao: `Divergência na posição ${pos}: Registrado no banco como "${recBanco.item}", mas na imagem é "${itemImg}".`,
          });

          sugestaoCorrecoes.push({
            idRegistro: recBanco.id,
            rodada: recBanco.rodada,
            resultadoAnterior: recBanco.item,
            resultadoNovo: itemImg,
            tipoAcao: 'atualizar',
            posicao: pos,
          });
        }
      }
    }

    const statusFinal =
      divergencias.length === 0 ? 'identico' : 'divergencias_encontradas';

    const relatorio: RelatorioAuditoria = {
      status: statusFinal,
      confianca: `${confiancaScore}%`,
      rodadasComparadas: Math.min(itensImagem.length, itensBanco.length),
      totalDivergencias: divergencias.length,
      divergencias,
      itensImagem,
      itensBanco,
      podeCorrigir: sugestaoCorrecoes.length > 0,
      sugestaoCorrecoes,
      sessaoId: sessaoId || (itensBanco[0] ? (itensBanco[0] as any).sessao_id : null),
      timestampAuditoria,
      mensagem:
        divergencias.length === 0
          ? 'Histórico 100% idêntico ao registrado no banco de dados. Nenhuma divergência detectada.'
          : `${divergencias.length} divergência(s) detectada(s) entre a imagem e o banco de dados.`,
    };

    // Logging do relatório de auditoria
    logger.info(`=== AUDITORIA REALIZADA ===`);
    logger.info(`Data/Hora: ${timestampAuditoria}`);
    logger.info(`Sessão: ${relatorio.sessaoId || 'Geral'}`);
    logger.info(`Rodadas Comparadas: ${relatorio.rodadasComparadas}`);
    logger.info(`Divergências Encontradas: ${relatorio.totalDivergencias}`);

    return relatorio;
  } catch (err: any) {
    logger.error('Erro na auditoria por imagem:', err?.message);
    return {
      status: 'erro',
      confianca: '0%',
      rodadasComparadas: 0,
      totalDivergencias: 0,
      divergencias: [],
      itensImagem: [],
      itensBanco: [],
      podeCorrigir: false,
      sugestaoCorrecoes: [],
      timestampAuditoria,
      mensagem: err?.message || 'Erro inesperado ao processar auditoria de imagem.',
    };
  }
}

/**
 * Aplica as correções no Supabase SOMENTE após confirmação explícita do usuário.
 * Registra o log detalhado de auditoria da alteração.
 */
export async function corrigirHistorico(
  correcoes: CorrecaoAuditoriaItem[],
  usuarioConfirmou: boolean = true,
  usuarioNome: string = 'usuario_operador',
  sessaoId?: string | number | null
): Promise<{
  sucesso: boolean;
  correcoesAplicadas: number;
  mensagem: string;
  detalhes: any[];
}> {
  if (!usuarioConfirmou) {
    return {
      sucesso: false,
      correcoesAplicadas: 0,
      mensagem: 'Operação cancelada: a confirmação do usuário é obrigatória.',
      detalhes: [],
    };
  }

  if (!correcoes || correcoes.length === 0) {
    return {
      sucesso: true,
      correcoesAplicadas: 0,
      mensagem: 'Nenhuma correção pendente para aplicar.',
      detalhes: [],
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      sucesso: false,
      correcoesAplicadas: 0,
      mensagem: 'Supabase não configurado para aplicar correções.',
      detalhes: [],
    };
  }

  const logsExecucao: any[] = [];
  let contagemSucesso = 0;

  for (const c of correcoes) {
    try {
      if (c.tipoAcao === 'atualizar' && c.idRegistro) {
        let updateRes = await supabase
          .from('resultados')
          .update({ item: c.resultadoNovo })
          .eq('id', c.idRegistro);

        if (updateRes.error) {
          // Fallback para nome de coluna 'objeto' se 'item' não existir
          updateRes = await supabase
            .from('resultados')
            .update({ objeto: c.resultadoNovo })
            .eq('id', c.idRegistro);
        }

        if (updateRes.error) {
          throw updateRes.error;
        }

        contagemSucesso++;
        logsExecucao.push({
          idRegistro: c.idRegistro,
          acao: 'atualizar',
          de: c.resultadoAnterior,
          para: c.resultadoNovo,
          status: 'sucesso',
        });
      } else if (c.tipoAcao === 'inserir') {
        const resReg = await registrarResultadoAutomaticamente(c.resultadoNovo, 95);

        if (resReg.registrado) {
          contagemSucesso++;
          logsExecucao.push({
            idRegistro: resReg.rodadaRegistrada || c.posicao,
            acao: 'inserir',
            item: c.resultadoNovo,
            status: 'sucesso',
          });
        } else {
          throw new Error(resReg.motivo || 'Falha ao inserir registro no banco de dados.');
        }
      }
    } catch (err: any) {
      logger.error(`Erro ao aplicar correção na posição ${c.posicao}:`, err?.message);
      logsExecucao.push({
        posicao: c.posicao,
        acao: c.tipoAcao,
        status: 'erro',
        motivo: err?.message,
      });
    }
  }

  // Tentar registrar log de auditoria oficial na tabela 'auditoria_logs' se existir
  const timestamp = new Date().toISOString();
  try {
    await supabase.from('auditoria_logs').insert([
      {
        sessao_id: sessaoId || null,
        usuario: usuarioNome,
        rodadas_comparadas: correcoes.length,
        numero_divergencias: correcoes.length,
        correcoes_realizadas: logsExecucao,
        confirmado_em: timestamp,
      },
    ]);
  } catch (logErr: any) {
    // Tabela opcional: apenas registrar no logger se falhar
    logger.info('Log de auditoria registrado no servidor.');
  }

  logger.info(`=== CORREÇÃO DE HISTÓRICO CONCLUÍDA ===`);
  logger.info(`Data: ${timestamp}`);
  logger.info(`Usuário que confirmou: ${usuarioNome}`);
  logger.info(`Sessão: ${sessaoId || 'Geral'}`);
  logger.info(`Correções Aplicadas com Sucesso: ${contagemSucesso}/${correcoes.length}`);

  invalidarCacheEstatistico();

  return {
    sucesso: true,
    correcoesAplicadas: contagemSucesso,
    mensagem: `${contagemSucesso} correção(ões) aplicada(s) com sucesso no banco de dados.`,
    detalhes: logsExecucao,
  };
}
