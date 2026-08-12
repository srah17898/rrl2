import { getSupabase } from '../database/supabase';

async function testRoutines() {
  const supabase = getSupabase();
  if (!supabase) return;

  console.log('--- TESTING RPC SIGNATURES ---');

  // Test RPC 1: registrar_resultado_completo with p_confianca as float 0.95 and p_sessao_id as number 1
  try {
    const r1 = await supabase.rpc('registrar_resultado_completo', {
      p_confianca: 0.95,
      p_objeto: 'boia',
      p_sessao_id: 1
    });
    console.log('RPC 1 (p_sessao_id = 1, p_confianca = 0.95):', r1);
  } catch (err: any) {
    console.error('RPC 1 catch:', err?.message);
  }

  // Test RPC 2: registrar_resultado with p_confianca as 0.95
  try {
    const r2 = await supabase.rpc('registrar_resultado', {
      p_confianca: 0.95,
      p_objeto: 'boia',
      p_origem: 'gemini_live',
      p_sessao_id: 1
    });
    console.log('RPC 2 (p_sessao_id = 1, p_confianca = 0.95):', r2);
  } catch (err: any) {
    console.error('RPC 2 catch:', err?.message);
  }
}

testRoutines().catch(console.error);
