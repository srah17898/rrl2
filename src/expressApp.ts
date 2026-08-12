import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import healthRouter from './routes/health';
import consultarRouter from './routes/consultar';
import padroesRouter from './routes/padroes';
import dashboardRouter from './routes/dashboard';
import estatisticasRouter from './routes/estatisticas';
import liveRouter from './routes/live';
import { registrarResultadoAutomaticamente } from './services/resultadoService';
import { processarOrquestradorAI } from './services/aiRouterService';
import {
  auditarHistoricoPorImagem,
  corrigirHistorico,
} from './services/auditoriaService';
import { logger } from './utils/logger';

const app = express();

// CORS Middleware to allow cross-origin requests from preview iframe or external clients
app.use((req, res, next) => {
  const reqOrigin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', reqOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware for parsing JSON with increased limits for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware normalization: ensure API routes are correctly matched whether called with or without /api prefix
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') || req.url === '/api') {
    return next();
  }
  const knownApiPaths = [
    '/live',
    '/health',
    '/gemini-diagnostic',
    '/consultar',
    '/padroes',
    '/dashboard',
    '/estatisticas',
    '/analyze-wheel',
    '/query-ai',
    '/auditoria',
    '/engine',
  ];
  if (knownApiPaths.some((p) => req.url.startsWith(p))) {
    req.url = '/api' + req.url;
  }
  next();
});

// Register modular routes
app.use('/api', healthRouter);
app.use('/api', consultarRouter);
app.use('/api', padroesRouter);
app.use('/api', dashboardRouter);
app.use('/api', estatisticasRouter);
app.use('/api', liveRouter);

// Initialize Gemini API client lazily / on request
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateContentWithFallback(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const candidateModels = [
    params.model || 'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ];
  const modelsToTry = Array.from(new Set(candidateModels));
  let lastError: any = null;
  const ai = getGenAIClient();

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: modelName,
      });
      return { response, modelUsed: modelName };
    } catch (err: any) {
      lastError = err;
      const isQuotaOrNotFound =
        err?.status === 429 ||
        err?.code === 429 ||
        err?.status === 404 ||
        err?.code === 404 ||
        (err?.message &&
          (err.message.includes('429') ||
            err.message.includes('404') ||
            err.message.includes('Quota exceeded') ||
            err.message.includes('RESOURCE_EXHAUSTED')));

      if (isQuotaOrNotFound) {
        logger.warn(
          `[GEMINI SERVER FALLBACK] Modelo ${modelName} falhou (${err?.message || err?.status}). Tentando próximo modelo...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
export function normalizeConfidenceScore(value: any): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  if (num > 0 && num <= 1) return Math.round(num * 100);
  return Math.min(100, Math.max(0, Math.round(num)));
}

// Computer Vision endpoint for wheel / history bar image recognition
app.post('/api/analyze-wheel', async (req, res) => {
  const startTime = Date.now();
  let selectedModel = 'gemini-3.6-flash';

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};

    if (!imageBase64) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[GEMINI_ERROR] requestId=wheel_${startTime} errorMessage="Nenhuma imagem fornecida" httpStatus=400 latencyMs=${latencyMs}`);
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Nenhuma imagem foi fornecida.',
        latencyMs,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[GEMINI_ERROR] requestId=wheel_${startTime} errorName=AuthError errorMessage="GEMINI_API_KEY_MISSING" httpStatus=500 errorCode=GEMINI_API_KEY_MISSING latencyMs=${latencyMs}`);
      return res.status(500).json({
        error: 'GEMINI_API_KEY_MISSING',
        message: 'A chave do Gemini não está configurada no servidor.',
        latencyMs,
      });
    }

    // Format clean base64 data
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageSize = cleanBase64.length;

    logger.info(`[GEMINI] REQUEST_START`);
    logger.info(`[GEMINI] MODEL: ${selectedModel}`);
    logger.info(`[GEMINI] IMAGE_SIZE: ${imageSize}`);
    logger.info(`[GEMINI] MIME_TYPE: ${mimeType}`);
    logger.info(`[GEMINI] REQUEST_SENT`);

    const prompt = `Você é o Farm Fishing AI, o sistema oficial de visão computacional para análise da Roda Gigante.
Sua função é identificar com máxima precisão os objetos sorteados na foto da roda ou da barra de histórico visual.

Os únicos 8 objetos válidos são estritamente:
- sorvete
- boia
- balao
- soco
- tedy
- princesa
- camera
- coroa

REGRAS DE ANÁLISE VISUAL:
1. NUNCA invente objetos que não estejam claramente visíveis na foto.
2. NUNCA agrupe resultados iguais consecutivamente. Exemplo: se houver 3 boias visíveis seguidas, você deve registrar ["boia", "boia", "boia"]. Cada uma é uma rodada distinta.
3. ORIENTAÇÃO TEMPORAL IMPORTANTE:
   - O LADO ESQUERDO da foto/barra de histórico contém os resultados MAIS RECENTES (mais novos).
   - O LADO DIREITO contém os resultados MAIS ANTIGOS (mais velhos).
4. Forneça a lista de itens ordenados DO MAIS RECENTE (esquerda) PARA O MAIS ANTIGO (direita).
5. O campo confidenceScore deve ser OBRIGATORIAMENTE um número inteiro de 0 a 100 indicando a porcentagem de confiança (exemplo: 98 para 98%).
6. Se a imagem estiver turva, cortada, borrada ou houver incerteza sobre algum item, atribua confidence = "baixa" e explique a limitação na descrição.

Retorne ESTRITAMENTE a resposta em formato JSON de acordo com a estrutura solicitada.`;

    const { response, modelUsed } = await generateContentWithFallback({
      model: selectedModel,
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
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
            },

            confidence: {
              type: Type.STRING,
              enum: ['alta', 'media', 'baixa'],
            },

            confidenceScore: {
              type: Type.NUMBER,
              description: 'Pontuação de 0 a 100 de confiança (ex: 98)',
            },

            description: {
              type: Type.STRING,
            },

            rawObservations: {
              type: Type.STRING,
            },
          },

          required: [
            'detectedItems',
            'confidence',
            'confidenceScore',
            'description',
          ],
        },
      },
    });

    const latencyMs = Date.now() - startTime;
    logger.info(`[GEMINI] RESPONSE_RECEIVED`);
    logger.info(`[GEMINI] LATENCY: ${latencyMs} ms`);

    const responseText = response.text;

    if (!responseText) {
      logger.error(`[GEMINI_ERROR] STATUS: 502 CODE: GEMINI_EMPTY_RESPONSE MESSAGE: "O Gemini respondeu, mas não retornou conteúdo." MODEL: ${modelUsed} LATENCY: ${latencyMs} ms`);
      return res.status(502).json({
        error: 'GEMINI_EMPTY_RESPONSE',
        message: 'O Gemini respondeu, mas não retornou conteúdo.',
        latencyMs,
      });
    }

    const parsed = JSON.parse(responseText);

    if (parsed && typeof parsed === 'object') {
      parsed.confidenceScore = normalizeConfidenceScore(parsed.confidenceScore ?? 90);
    }

    // Executar registro automático do resultado no Supabase se houver item identificado
    const itemMaisRecente = parsed.detectedItems && parsed.detectedItems.length > 0 ? parsed.detectedItems[0] : null;
    let autoRegister: any = {
      registrado: false,
      motivo: 'Nenhum item detectado para registro.',
      sessaoId: null,
      rodadaRegistrada: null,
    };

    if (itemMaisRecente) {
      autoRegister = await registrarResultadoAutomaticamente(itemMaisRecente, parsed.confidenceScore);
    }

    return res.json({
      ...parsed,
      registrado: autoRegister.registrado,
      motivo: autoRegister.motivo,
      sessaoId: autoRegister.sessaoId,
      rodadaRegistrada: autoRegister.rodadaRegistrada,
      latencyMs,
      modelUsed,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const httpStatus = error?.status || error?.code || 500;
    const errorMsg = error?.message || 'Falha ao comunicar com o Gemini.';

    logger.error(`[GEMINI_ERROR] STATUS: ${httpStatus} CODE: ${error?.code || 'GEMINI_COMMUNICATION_FAILED'} MESSAGE: "${errorMsg}" MODEL: ${selectedModel} LATENCY: ${latencyMs} ms`);

    return res.status(typeof httpStatus === 'number' ? httpStatus : 500).json({
      error: 'GEMINI_COMMUNICATION_FAILED',
      message: errorMsg,
      status: httpStatus,
      latencyMs,
    });
  }
});
// Natural language query endpoint for Farm Fishing AI questions (PROMPT 008 - Orquestrador Inteligente)
app.post('/api/query-ai', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Nenhuma pergunta foi enviada.' });
    }

    const resultadoOrquestrador = await processarOrquestradorAI(String(query));

    return res.json({
      answer: resultadoOrquestrador.explicacaoHumana,
      roteamento: resultadoOrquestrador.roteamento,
      relevantData: {
        intencao: resultadoOrquestrador.roteamento.intencao,
        modulo: resultadoOrquestrador.roteamento.modulo,
        dadosConsulta: resultadoOrquestrador.roteamento.dados,
        confianca: resultadoOrquestrador.roteamento.confianca,
        tempoExecucaoMs: resultadoOrquestrador.tempoTotalMs,
      },
    });
  } catch (error: any) {
    logger.error('Erro no orquestrador de consulta AI:', error);
    return res.status(500).json({
      error: error?.message || 'Falha ao processar orquestração inteligente da consulta.',
    });
  }
});

// Endpoint de Auditoria Inteligente do Histórico por Imagem (PROMPT 009)
app.post('/api/auditoria', async (req, res) => {
  try {
    const { imageBase64, sessaoId } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada para auditoria.' });
    }

    const relatorio = await auditarHistoricoPorImagem(imageBase64, sessaoId);
    return res.json(relatorio);
  } catch (error: any) {
    logger.error('Erro ao processar auditoria de imagem:', error);
    return res.status(500).json({
      error: error?.message || 'Erro ao realizar auditoria do histórico.',
    });
  }
});

// Endpoint de Aplicação de Correções de Auditoria
app.post('/api/auditoria/aplicar-correcoes', async (req, res) => {
  try {
    const { correcoes, usuarioConfirmou, usuarioNome, sessaoId } = req.body;

    if (usuarioConfirmou !== true) {
      return res.status(400).json({
        error: 'É necessária a confirmação explícita do usuário para aplicar correções.',
      });
    }

    if (!Array.isArray(correcoes) || correcoes.length === 0) {
      return res.status(400).json({ error: 'Nenhuma correção fornecida.' });
    }

    const resultado = await corrigirHistorico(
      correcoes,
      usuarioConfirmou,
      usuarioNome || 'operador_sistema',
      sessaoId
    );

    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro ao aplicar correções de auditoria:', error);
    return res.status(500).json({
      error: error?.message || 'Erro ao salvar correções de auditoria no banco de dados.',
    });
  }
});

export default app;
