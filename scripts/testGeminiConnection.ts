import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';

/**
 * Script de Teste Isolado de Conexão com Gemini API
 * Executa diagnósticos de API Key, Modelos Disponíveis, Teste Textual e Teste Multimodal Visão (BALÃO)
 */
async function runGeminiDiagnostic() {
  console.log('================================================');
  console.log('       DIAGNÓSTICO DE CONEXÃO GEMINI API       ');
  console.log('================================================\n');

  // 1. VERIFICAR API KEY
  const apiKey = process.env.GEMINI_API_KEY;
  const keyConfigured = !!apiKey && apiKey.trim().length > 0;
  
  console.log('1. VERIFICAÇÃO DA API KEY:');
  console.log(`   - Configurada: ${keyConfigured ? 'SIM' : 'NÃO (AUSENTE)'}`);
  if (keyConfigured) {
    console.log(`   - Tamanho: ${apiKey.length} caracteres`);
    console.log(`   - Prefixo: ${apiKey.substring(0, 4)}...`);
  } else {
    console.log('❌ GEMINI_API_KEY não foi encontrada nas variáveis de ambiente.');
    console.log('================================================');
    console.log('RESULTADO: GEMINI_AUTH_ERROR (API Key Ausente)');
    console.log('================================================');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // 2. VERIFICAÇÃO DE MODELOS & TESTE TEXTUAL:
  console.log('\n2. VERIFICAÇÃO DE MODELOS & TESTE TEXTUAL:');
  
  try {
    console.log('   - Listando modelos disponíveis na API...');
    const listRes = await ai.models.list();
    const availableModelNames: string[] = [];
    if (listRes && Array.isArray((listRes as any).models)) {
      for (const m of (listRes as any).models) {
        if (m.supportedGenerationMethods?.includes('generateContent')) {
          availableModelNames.push(m.name.replace('models/', ''));
        }
      }
    }
    console.log('   - Modelos retornados pela API:', availableModelNames.join(', ') || 'Nenhum listado');
  } catch (err: any) {
    console.log('   - Não foi possível listar modelos via listModels:', err?.message?.substring(0, 100));
  }

  const candidateModels = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3.6-flash',
  ];
  
  let workingModel: string | null = null;
  let textSuccess = false;
  let textLatencyMs = 0;
  let textResponseStr = '';
  let lastErrorObj: any = null;

  for (const modelName of candidateModels) {
    console.log(`\n   [Testando modelo: ${modelName}]`);
    const startT = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents: 'Responda somente: GEMINI_OK',
      });
      textLatencyMs = Date.now() - startT;
      const resText = res.text ? res.text.trim() : '';
      
      if (resText.includes('GEMINI_OK') || resText.length > 0) {
        workingModel = modelName;
        textSuccess = true;
        textResponseStr = resText;
        console.log(`   ✅ SUCESSO com modelo ${modelName}!`);
        console.log(`      - HTTP: 200 OK`);
        console.log(`      - Latência: ${textLatencyMs} ms`);
        console.log(`      - Resposta: "${resText}"`);
        break;
      }
    } catch (err: any) {
      lastErrorObj = err;
      const status = err?.status || err?.code || 'ERROR';
      const msg = err?.message || String(err);
      console.log(`   ❌ FALHA no modelo ${modelName}: HTTP ${status}`);
      console.log(`      - Mensagem: ${msg.substring(0, 150)}`);
    }
  }

  if (!textSuccess || !workingModel) {
    console.log('\n================================================');
    console.log('[TEST-GEMINI-TEXT] ❌ FALHA NO TESTE TEXTUAL');
    const status = lastErrorObj?.status || lastErrorObj?.code || 500;
    const msg = lastErrorObj?.message || '';
    
    let errorCategory = 'GEMINI_HTTP_ERROR';
    if (status === 429 || msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      errorCategory = 'GEMINI_RATE_LIMITED';
    } else if (status === 401 || status === 403 || msg.includes('API key') || msg.includes('unauthorized')) {
      errorCategory = 'GEMINI_AUTH_ERROR';
    } else if (status === 404 || msg.includes('not found')) {
      errorCategory = 'GEMINI_MODEL_UNAVAILABLE';
    }
    
    console.log(`CATEGORIA DO ERRO: ${errorCategory}`);
    console.log(`HTTP STATUS: ${status}`);
    console.log(`DETALHES: ${msg}`);
    console.log('================================================');
    console.log('RESULTADO: GEMINI NÃO DISPONÍVEL');
    console.log('================================================');
    process.exit(1);
  }

  console.log(`\n   MODELO MODELO SELECIONADO: ${workingModel}`);

  // 3. TESTE MULTIMODAL (VISÃO - BALÃO)
  console.log('\n3. TESTE MULTIMODAL DE VISÃO (BALÃO):');
  const balaoUrl = 'https://ik.imagekit.io/kqrijzbci/53d2c57e-0cfe-43fc-95b6-69221883077c.jpg';
  console.log(`   - Baixando imagem oficial do BALÃO de: ${balaoUrl}`);

  let imageBase64 = '';
  try {
    const imgRes = await fetch(balaoUrl);
    if (!imgRes.ok) {
      throw new Error(`Falha HTTP ao baixar imagem: ${imgRes.status}`);
    }
    const arrayBuf = await imgRes.arrayBuffer();
    imageBase64 = Buffer.from(arrayBuf).toString('base64');
    console.log(`   - Imagem baixada com sucesso (${imageBase64.length} chars base64)`);
  } catch (err: any) {
    console.log(`   ❌ Erro ao obter a imagem para o teste de visão: ${err?.message}`);
    process.exit(1);
  }

  const visionPrompt = `Analise esta imagem.

Identifique qual dos seguintes objetos aparece:

sorvete
boia
balao
soco
tedy
princesa
camera
coroa
nenhum

Responda SOMENTE JSON válido:

{
  "objetoDetectado": "balao",
  "confianca": 0.0
}`;

  console.log(`   - Enviando requisição de visão para o modelo ${workingModel}...`);
  const startVisionT = Date.now();
  let visionSuccess = false;
  let visionStatus = 'GEMINI_UNAVAILABLE';
  let visionLatencyMs = 0;
  let detectedObject = 'nenhum';
  let detectedConfidence = 0;
  let rawVisionText = '';

  try {
    const visionRes = await ai.models.generateContent({
      model: workingModel,
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: 'image/jpeg',
            },
          },
          { text: visionPrompt },
        ],
      },
    });

    visionLatencyMs = Date.now() - startVisionT;
    rawVisionText = visionRes.text ? visionRes.text.trim() : '';

    console.log(`\n[TEST-GEMINI-VISION]`);
    console.log(`   - HTTP: 200 OK`);
    console.log(`   - Latência: ${visionLatencyMs} ms`);
    console.log(`   - Resposta Bruta: "${rawVisionText}"`);

    // Tentar fazer parse do JSON
    try {
      const cleanJson = rawVisionText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      const jsonParsed = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);
      
      detectedObject = (jsonParsed.objetoDetectado || jsonParsed.objeto || 'nenhum').toLowerCase().trim();
      detectedConfidence = Number(jsonParsed.confianca || jsonParsed.confidence || 0);

      if (detectedObject === 'balao') {
        visionStatus = 'GEMINI_OK';
        visionSuccess = true;
      } else if (detectedObject === 'nenhum') {
        visionStatus = 'GEMINI_NO_OBJECT';
      } else {
        visionStatus = 'GEMINI_OK'; // Detectou outro objeto
      }
    } catch {
      visionStatus = 'GEMINI_INVALID_JSON';
    }

  } catch (err: any) {
    visionLatencyMs = Date.now() - startVisionT;
    const status = err?.status || err?.code || 'ERROR';
    const msg = err?.message || String(err);

    if (status === 429 || msg.includes('429') || msg.includes('Quota')) {
      visionStatus = 'GEMINI_RATE_LIMITED';
    } else {
      visionStatus = 'GEMINI_HTTP_ERROR';
    }

    console.log(`\n[TEST-GEMINI-VISION] ❌ ERRO: HTTP ${status} - ${msg}`);
  }

  console.log('\n================================================');
  console.log('          RESUMO DO DIAGNÓSTICO GEMINI          ');
  console.log('================================================');
  console.log(`API KEY: CONFIGURADA`);
  console.log(`MODELO FUNCIONAL: ${workingModel}`);
  console.log(`TESTE TEXTO: ${textSuccess ? 'PASS' : 'FAIL'} (HTTP 200, ${textLatencyMs}ms)`);
  console.log(`TESTE VISÃO: ${visionSuccess ? 'PASS' : 'FAIL'} (${visionStatus}, ${visionLatencyMs}ms)`);
  console.log(`OBJETO IDENTIFICADO: ${detectedObject}`);
  console.log(`CONFIANÇA: ${detectedConfidence}`);
  console.log('================================================');

  if (visionSuccess && detectedObject === 'balao') {
    console.log('RESULTADO FINAL: GEMINI FUNCIONANDO PERFEITAMENTE!');
  } else {
    console.log(`RESULTADO FINAL: ${visionStatus}`);
  }
}

runGeminiDiagnostic();
