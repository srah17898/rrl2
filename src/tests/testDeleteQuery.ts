import { getSupabase } from '../database/supabase';

async function testSupabaseRestDelete() {
  const rawUrl = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');

  const endpoint = `${cleanUrl}/rest/v1/resultados?id=gt.0`;
  console.log('Testing REST delete to clean endpoint:', endpoint);

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
    },
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
}

testSupabaseRestDelete();
