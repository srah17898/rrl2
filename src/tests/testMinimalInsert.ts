import { getSupabase } from '../database/supabase';

async function testMinimal() {
  const supabase = getSupabase();
  if (!supabase) return;

  console.log('--- TESTING MINIMAL COLUMN COMBINATIONS ON RESULTADOS ---');

  const testPayloads = [
    { objeto: 'boia' },
    { objeto: 'boia', confianca: 0.95 },
    { objeto: 'boia', confianca: 0.95, criado_em: new Date().toISOString() },
    { objeto: 'boia', confianca: 0.95, origem: 'gemini_live' },
    { objeto: 'boia', confianca: 0.95, sessao_id: null },
  ];

  for (const payload of testPayloads) {
    const res = await supabase.from('resultados').insert([payload]).select();
    console.log('Payload:', JSON.stringify(payload), '=>', res.error ? res.error : 'SUCCESS!');
  }
}

testMinimal().catch(console.error);
