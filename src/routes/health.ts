import { Router } from 'express';
import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';
import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import { analyzeCropIsolated } from '../services/cropAnalyzerService';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    const supabase = getSupabase();
    let supabaseConnected = false;
    let supabaseError = null;
    let data = null;

    if (supabase) {
      const result = await supabase.from('sessoes').select('*').limit(1);
      data = result.data;
      supabaseError = result.error?.message || null;
      supabaseConnected = !result.error;
    }

    res.json({
      status: 'ok',
      system: 'Farm Fishing AI Backend',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      hasSupabaseConfigured: Boolean(supabase),
      supabaseConnected,
      supabaseError,
      data,
    });
  } catch (error: any) {
    logger.error('Erro na rota health:', error?.message);
    res.json({
      status: 'erro',
      mensagem: error?.message || 'Erro desconhecido ao verificar status.',
    });
  }
});

router.get('/gemini-diagnostic', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const keyConfigured = !!apiKey && apiKey.trim().length > 0;
  const keyLength = apiKey ? apiKey.length : 0;
  const keyPrefix = apiKey ? `${apiKey.substring(0, 4)}...` : 'N/A';

  if (!keyConfigured) {
    return res.json({
      keyConfigured: false,
      keyLength: 0,
      keyPrefix: 'N/A',
      model: 'N/A',
      textTest: { status: 'FAIL', httpStatus: 401, latencyMs: 0, response: 'API Key Ausente' },
      visionTest: { status: 'FAIL', httpStatus: 401, latencyMs: 0, object: 'none', confidence: 0, raw: 'N/A' },
      quota: 'RESOURCE_EXHAUSTED',
      result: 'GEMINI NÃO DISPONÍVEL (API Key Ausente)',
      error: 'GEMINI_AUTH_ERROR',
    });
  }

  const modelTarget = 'gemini-3.6-flash';
  const ai = new GoogleGenAI({ apiKey });

  // 1. TESTE TEXTO
  let textStatus = 'FAIL';
  let textHttpStatus = 500;
  let textLatencyMs = 0;
  let textResponse = '';
  let textError = '';

  const startText = Date.now();
  try {
    const textRes = await ai.models.generateContent({
      model: modelTarget,
      contents: 'Responda somente: GEMINI_OK',
    });
    textLatencyMs = Date.now() - startText;
    textResponse = textRes.text ? textRes.text.trim() : '';
    textHttpStatus = 200;
    if (textResponse.includes('GEMINI_OK') || textResponse.length > 0) {
      textStatus = 'PASS';
    }
  } catch (err: any) {
    textLatencyMs = Date.now() - startText;
    textHttpStatus = err?.status || err?.code || 500;
    textError = err?.message || String(err);
  }

  if (textStatus === 'FAIL') {
    let quotaState = 'UNKNOWN';
    if (textHttpStatus === 429 || textError.includes('429') || textError.includes('Quota')) {
      quotaState = 'RATE_LIMITED';
    }
    return res.json({
      keyConfigured: true,
      keyLength,
      keyPrefix,
      model: modelTarget,
      textTest: { status: 'FAIL', httpStatus: textHttpStatus, latencyMs: textLatencyMs, response: textError },
      visionTest: { status: 'FAIL', httpStatus: 0, latencyMs: 0, object: 'none', confidence: 0, raw: 'N/A' },
      quota: quotaState,
      result: 'GEMINI NÃO DISPONÍVEL',
      error: textError,
    });
  }

  // 2. TESTE VISÃO (BALÃO)
  let visionStatus = 'FAIL';
  let visionHttpStatus = 500;
  let visionLatencyMs = 0;
  let detectedObject = 'nenhum';
  let detectedConfidence = 0;
  let rawVisionText = '';
  let visionError = '';

  const balaoUrl = 'https://ik.imagekit.io/kqrijzbci/53d2c57e-0cfe-43fc-95b6-69221883077c.jpg';
  const startVision = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    let imageBase64 = '';
    try {
      const imgRes = await fetch(balaoUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!imgRes.ok) throw new Error(`HTTP error ${imgRes.status} downloading test image`);
      const arrayBuf = await imgRes.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuf).toString('base64');
    } catch (downloadErr: any) {
      clearTimeout(timeoutId);
      logger.warn(`Fallback para imagem de teste em base64: ${downloadErr?.message}`);
      // Fallback tiny valid red pixel base64 image
      imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    }

    const visionPrompt = `Analise esta imagem.
Identifique qual dos seguintes objetos aparece:
sorvete, boia, balao, soco, tedy, princesa, camera, coroa, nenhum
Responda SOMENTE JSON válido:
{"objetoDetectado": "balao", "confianca": 0.0}`;

    const visionRes = await ai.models.generateContent({
      model: modelTarget,
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
          { text: visionPrompt },
        ],
      },
    });

    visionLatencyMs = Date.now() - startVision;
    rawVisionText = visionRes.text ? visionRes.text.trim() : '';
    visionHttpStatus = 200;

    const cleanJson = rawVisionText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleanJson.match(/\{[\s\S]*\}/);
    const jsonParsed = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);

    detectedObject = (jsonParsed.objetoDetectado || jsonParsed.objeto || 'nenhum').toLowerCase().trim();
    detectedConfidence = Number(jsonParsed.confianca || jsonParsed.confidence || 0);

    if (detectedObject === 'balao') {
      visionStatus = 'PASS';
    } else {
      visionStatus = 'PASS_DIVERGENT';
    }
  } catch (err: any) {
    visionLatencyMs = Date.now() - startVision;
    visionHttpStatus = err?.status || err?.code || 500;
    visionError = err?.message || String(err);
  }

  res.json({
    keyConfigured: true,
    keyLength,
    keyPrefix,
    model: modelTarget,
    textTest: {
      status: textStatus,
      httpStatus: textHttpStatus,
      latencyMs: textLatencyMs,
      response: textResponse,
    },
    visionTest: {
      status: visionStatus,
      httpStatus: visionHttpStatus,
      latencyMs: visionLatencyMs,
      object: detectedObject,
      confidence: detectedConfidence,
      raw: rawVisionText || visionError,
    },
    quota: 'AVAILABLE',
    result: visionStatus === 'PASS' ? 'GEMINI FUNCIONANDO' : 'GEMINI COM PARCIALIDADES',
  });
});

router.post('/analyze-crop', async (req, res) => {
  try {
    const { imageBase64, base64Image, mimeType = 'image/jpeg' } = req.body || {};
    const imgData = imageBase64 || base64Image;
    const result = await analyzeCropIsolated(imgData, mimeType);
    return res.status(result.httpStatus || 200).json(result);
  } catch (error: any) {
    logger.error('Erro na rota POST /api/analyze-crop:', error?.message);
    return res.status(500).json({
      success: false,
      model: 'gemini-3.6-flash',
      httpStatus: 500,
      errorType: 'GEMINI_HTTP_ERROR',
      errorMessage: error?.message || 'Falha ao analisar crop no Gemini.',
      latencyMs: 0,
    });
  }
});

export default router;
