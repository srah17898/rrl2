import { getSupabase } from '../database/supabase';

async function testResultadosQuery() {
  const supabase = getSupabase();
  if (!supabase) return;

  console.log('--- TESTING RESULTADOS QUERY ---');

  const { data, error } = await supabase.from('resultados').select('*').order('id', { ascending: false }).limit(5);
  console.log('resultados query:', { data, error });
}

testResultadosQuery().catch(console.error);
