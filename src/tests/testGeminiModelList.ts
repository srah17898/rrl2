import { GoogleGenAI } from '@google/genai';

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('GEMINI_API_KEY present:', !!apiKey);

  const ai = new GoogleGenAI({ apiKey });
  const models = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

  for (const m of models) {
    try {
      console.log(`Testing model "${m}"...`);
      const res = await ai.models.generateContent({
        model: m,
        contents: 'Hello, respond with OK',
      });
      console.log(`SUCCESS with model "${m}":`, res.text);
      break;
    } catch (err: any) {
      console.log(`FAILED with model "${m}":`, err?.message || err);
    }
  }
}

testModels();
