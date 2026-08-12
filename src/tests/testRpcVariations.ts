import { getSupabase } from '../database/supabase';

async function testWithSession() {
  const supabase = getSupabase();
  if (!supabase) return;

  console.log('--- TESTING RPC WITH SESSION ---');

  // Query existing sessions
  const { data: sessoes, error: errS } = await supabase.from('sessoes').select('*').limit(5);
  console.log('Existing sessions:', { sessoes, errS });

  let sessaoId: any = sessoes && sessoes.length > 0 ? sessoes[0].id : null;

  if (!sessaoId) {
    // Try creating a session
    const { data: newSess, error: errNew } = await supabase
      .from('sessoes')
      .insert([{ status: 'ativa' }])
      .select()
      .single();
    console.log('Created session:', { newSess, errNew });
    if (newSess) sessaoId = newSess.id;
  }

  console.log('Using sessaoId:', sessaoId);

  const resRpc = await supabase.rpc('registrar_resultado_completo', {
    p_confianca: 0.95,
    p_objeto: 'boia',
    p_sessao_id: sessaoId
  });
  console.log('RPC result with sessaoId:', resRpc);

  const resRpc2 = await supabase.rpc('registrar_resultado', {
    p_confianca: 0.95,
    p_objeto: 'boia',
    p_origem: 'gemini_live',
    p_sessao_id: sessaoId
  });
  console.log('RPC 2 result with sessaoId:', resRpc2);
}

testWithSession().catch(console.error);
