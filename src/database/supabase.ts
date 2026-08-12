import { createClient, SupabaseClient } from '@supabase/supabase-js';

function sanitizarUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  url = url.replace(/\/rest\/v1\/?$/i, '');
  url = url.replace(/\/+$/, '');
  return url;
}

// Helper to safely extract environment variables in both Node.js (CJS/server) and Vite (client)
function getEnvVar(key: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'): string {
  const viteKey = `VITE_${key}`;
  
  // 1. Check Node / server process.env
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key]!;
    if (process.env[viteKey]) return process.env[viteKey]!;
  }

  // 2. Check import.meta.env dynamically to avoid esbuild CJS warning
  try {
    const getMeta = new Function('try { return import.meta.env; } catch { return undefined; }');
    const env = getMeta();
    if (env) {
      if (env[key]) return env[key];
      if (env[viteKey]) return env[viteKey];
    }
  } catch {
    // Ignore in non-ESM environments
  }

  return '';
}

const rawSupabaseUrl = getEnvVar('SUPABASE_URL');
const supabaseUrl = sanitizarUrl(rawSupabaseUrl);
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY');

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConnectionTraceInfo() {
  const url = sanitizarUrl(getEnvVar('SUPABASE_URL'));
  let host = 'N/A';
  let projectRef = 'N/A';
  if (url) {
    try {
      host = new URL(url).hostname;
      projectRef = host.split('.')[0] || 'N/A';
    } catch {
      host = url;
    }
  }
  return {
    urlHost: host,
    projectRef,
    environment: typeof process !== 'undefined' && process.env?.NODE_ENV ? process.env.NODE_ENV : 'development',
    table: 'resultados',
  };
}

/**
 * Returns the singleton instance of SupabaseClient if valid credentials exist.
 */
export function getSupabase(): SupabaseClient | null {
  const url = sanitizarUrl(getEnvVar('SUPABASE_URL'));
  const anonKey = getEnvVar('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: typeof window !== 'undefined',
        },
      });
    } catch (error) {
      console.error('Erro ao inicializar o cliente Supabase:', error);
      return null;
    }
  }
  return supabaseInstance;
}

/**
 * Exported single client instance
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Tests connection to Supabase table and handles errors cleanly.
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      message: 'Supabase não configurado. As variáveis SUPABASE_URL e SUPABASE_ANON_KEY são necessárias.',
    };
  }

  try {
    const { data, error } = await client.from('sessoes').select('*').limit(1);
    if (error) {
      return {
        success: false,
        message: `Erro na consulta ao Supabase: ${error.message}`,
      };
    }
    return {
      success: true,
      message: 'Conexão com o Supabase estabelecida com sucesso.',
      data,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Falha na comunicação com o Supabase: ${err?.message || 'Erro desconhecido.'}`,
    };
  }
}
