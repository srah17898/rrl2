import { getSupabase } from '../database/supabase';

async function testAuth() {
  const supabase = getSupabase();
  if (!supabase) return;

  console.log('--- TESTING SUPABASE AUTH ---');

  const { data: authData, error: authErr } = await supabase.auth.signInAnonymously();
  console.log('signInAnonymously result:', { authData, authErr });

  // Test inserting into resultados after auth
  const rpcRes = await supabase.rpc('registrar_resultado_completo', {
    p_confianca: 0.95,
    p_objeto: 'boia',
    p_sessao_id: null
  });
  console.log('RPC result after auth:', rpcRes);

  const rpc2Res = await supabase.rpc('registrar_resultado', {
    p_confianca: 0.95,
    p_objeto: 'boia',
    p_origem: 'gemini_live',
    p_sessao_id: null
  });
  console.log('RPC 2 result after auth:', rpc2Res);
}

testAuth().catch(console.error);
