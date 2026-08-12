import { getSupabase } from '../database/supabase';
import { logger } from '../utils/logger';

export interface SessaoRecord {
  id?: string;
  status?: string;
  iniciada_em?: string;
  finalizada_em?: string;
  [key: string]: any;
}

/**
 * Obtém a sessão ativa/mais recente.
 */
export async function obterSessaoAtual() {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    let res = await supabase
      .from('sessoes')
      .select('*')
      .order('iniciada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error && res.error.message.includes('iniciada_em')) {
      res = await supabase
        .from('sessoes')
        .select('*')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    return { data: res.data, error: res.error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Cria uma nova sessão no banco de dados.
 */
export async function criarSessao(dadosSessao?: SessaoRecord) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const payload: any = {
      criado_em: new Date().toISOString(),
      ...dadosSessao,
    };
    // remove status/iniciada_em if not part of schema
    delete payload.iniciada_em;

    let { data, error } = await supabase
      .from('sessoes')
      .insert([payload])
      .select()
      .single();

    if (error && error.message.includes('status')) {
      delete payload.status;
      const resAlt = await supabase
        .from('sessoes')
        .insert([payload])
        .select()
        .single();
      data = resAlt.data;
      error = resAlt.error;
    }

    if (error) {
      logger.error('Erro ao criar sessão:', error.message);
    }
    return { data, error };
  } catch (err: any) {
    logger.error('Exceção ao criar sessão:', err?.message);
    return { data: null, error: err };
  }
}

/**
 * Encerra uma sessão específica.
 */
export async function encerrarSessao(sessaoId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const { data, error } = await supabase
      .from('sessoes')
      .update({
        status: 'encerrada',
        finalizada_em: new Date().toISOString(),
      })
      .eq('id', sessaoId)
      .select();

    if (error) {
      logger.error(`Erro ao encerrar sessão ${sessaoId}:`, error.message);
    }
    return { data, error };
  } catch (err: any) {
    logger.error(`Exceção ao encerrar sessão ${sessaoId}:`, err?.message);
    return { data: null, error: err };
  }
}

/**
 * Buscar detalhes de uma sessão pelo ID.
 */
export async function buscarSessao(sessaoId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const { data, error } = await supabase
      .from('sessoes')
      .select('*')
      .eq('id', sessaoId)
      .maybeSingle();

    if (error) {
      logger.error(`Erro ao buscar sessão ${sessaoId}:`, error.message);
    }
    return { data, error };
  } catch (err: any) {
    logger.error(`Exceção ao buscar sessão ${sessaoId}:`, err?.message);
    return { data: null, error: err };
  }
}
