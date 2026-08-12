import { getSupabase } from '../database/supabase';

async function testRpcNames() {
  const supabase = getSupabase();
  if (!supabase) return;

  const candidateNames = [
    'registrar_resultado_completo',
    'registrar_resultado',
    'inserir_resultado',
    'salvar_resultado',
    'add_resultado',
    'registrar_rodada',
    'nova_rodada',
    'criar_resultado',
    'insert_resultado'
  ];

  console.log('--- TESTING RPC FUNCTION NAMES ---');

  for (const name of candidateNames) {
    const res = await supabase.rpc(name as any, {});
    console.log(`RPC [${name}]: code=${res.error?.code}, message="${res.error?.message}", hint="${res.error?.hint}"`);
  }
}

testRpcNames().catch(console.error);
