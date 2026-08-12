import { getSupabase } from '../database/supabase';

const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
console.log('Anon key length:', key.length);
if (key) {
  const parts = key.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    console.log('Decoded JWT Payload:', payload);
  }
}
