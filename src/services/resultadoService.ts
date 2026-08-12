import { getSupabase, getSupabaseConnectionTraceInfo } from '../database/supabase';
import { logger } from '../utils/logger';
import { getCutoffTimestamp } from './limpezaState';
import { obterSessaoAtual, criarSessao } from './sessaoService';
import { registrarTransicao } from './transicaoService';
import { executarDetectorPadroes } from './padraoService';
import { invalidarCacheEstatistico } from './estatisticaService';

export interface ResultadoRecord {
  id?: string;
  sessao_id?: string;
  item: string;
  rodada?: number;
  criado_em?: string;
  [key: string]: any;
}

export const OBJETOS_PERMITIDOS = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
] as const;

export const MIN_CONFIDENCE = 80;

// CONTROLE RIGOROSO DE AUTO-PERSISTÊNCIA (MANDATÓRIO REQUISITO #1)
// Habilitado por padrão para execuções reais do Live API (AUTO_PERSIST_ENABLED = true por padrão).
let autoPersistFlag = process.env.AUTO_PERSIST_ENABLED !== 'false';

export function setAutoPersistEnabled(enabled: boolean) {
  autoPersistFlag = enabled;
}

export function isAutoPersistEnabled(): boolean {
  return autoPersistFlag;
}

export const AUTO_PERSIST_ENABLED = autoPersistFlag;

// Estado de Idempotência e Bloqueio de Concorrência em Memória
const persistedEventIds = new Set<string>();
const activePersistLocks = new Map<string, Promise<AutoRegisterResult>>();
const sessionInsertTimestamps = new Map<string, number[]>();

export interface ActiveScreenLifecycle {
  inFlight: boolean;
  eventId: string | null;
  objeto: string | null;
  timestamp: number;
  screenExitConfirmed: boolean;
}

const activeScreenLifecycleMap = new Map<string, ActiveScreenLifecycle>();

export function notificarSaidaTelaResultado(sessaoId?: string | number | null): void {
  activeScreenLifecycleMap.clear();
  logger.info(`[SCREEN_LIFECYCLE] Exit confirmed for session ${sessaoId || 'all'}. Round lock released.`);
}

export function obterEstadoTelaResultado(sessaoId?: string | number | null): ActiveScreenLifecycle | undefined {
  const key = String(sessaoId || 1);
  return activeScreenLifecycleMap.get(key);
}

let ultimoObjetoRegistrado: string | null = null;
let ultimoTimestampRegistro: number = 0;

/**
 * Limpa o estado em memória de idempotência, locks e timestamps de persistência.
 */
export function limparMemoriaResultadoService(): void {
  persistedEventIds.clear();
  activePersistLocks.clear();
  sessionInsertTimestamps.clear();
  activeScreenLifecycleMap.clear();
  ultimoObjetoRegistrado = null;
  ultimoTimestampRegistro = 0;
}

export interface AutoRegisterResult {
  registrado: boolean;
  motivo: string;
  sessaoId?: string | number | null;
  rodadaRegistrada?: number | null;
  eventId?: string | null;
  insertedId?: string | number | null;
}

/**
 * Registra automaticamente um resultado identificado pela IA
 * de forma IDEMPOTENTE e blindada contra duplicações e race conditions.
 */
export async function registrarResultadoAutomaticamente(
  objeto: string,
  confianca: number,
  eventId?: string,
  sessaoIdParam?: string | number | null
): Promise<AutoRegisterResult> {
  const callId = `CALL_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const objetoFormatado = (objeto || '').trim().toLowerCase();
  const eventIdEfetivo = eventId || `LIVE_EVT_${Date.now()}_${objetoFormatado}`;
  const timestampIso = new Date().toISOString();
  const connTrace = getSupabaseConnectionTraceInfo();

  // TELEMETRIA DE CONEXÃO SUPABASE
  logger.info(
    `[SUPABASE_CONNECTION_TRACE]\n` +
      `urlHost=${connTrace.urlHost}\n` +
      `projectRef=${connTrace.projectRef}\n` +
      `environment=${connTrace.environment}\n` +
      `table=resultados`
  );

  // LOG FORENSE OBRIGATÓRIO (MANDATÓRIO REQUISITO #5)
  logger.info(
    `[FORENSIC-PERSISTENCE]\n` +
      `• CALL_ID: ${callId}\n` +
      `• Timestamp: ${timestampIso}\n` +
      `• SessionId: ${sessaoIdParam || 'N/A'}\n` +
      `• EventId: ${eventIdEfetivo}\n` +
      `• Objeto: "${objetoFormatado}"\n` +
      `• Confiança: ${confianca}%\n` +
      `• Source: gemini_live\n` +
      `• Caller: registrarResultadoAutomaticamente\n` +
      `• AutoPersistEnabled: ${isAutoPersistEnabled()}`
  );

  // REQUISITO #1: Se a auto-persistência estiver DESABILITADA, interceptar imediatamente
  if (!isAutoPersistEnabled()) {
    const motivo = 'PERSISTÊNCIA DESABILITADA — TESTE';
    logger.info(
      `[ROUND-PERSISTENCE] CALL_ID=${callId} | sessionId=${sessaoIdParam || 'N/A'} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | acao=INTERCEPTADO_AUTO_PERSIST_DISABLED`
    );
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=PERSISTENCE_DISABLED`);
    return {
      registrado: false,
      motivo,
      sessaoId: sessaoIdParam || null,
      rodadaRegistrada: null,
      eventId: eventIdEfetivo,
    };
  }

  // 1. Validar objeto
  if (!OBJETOS_PERMITIDOS.includes(objetoFormatado as any)) {
    const motivo = `Objeto inválido ou não permitido: "${objeto}". Objetos aceitos: ${OBJETOS_PERMITIDOS.join(', ')}`;
    logger.warn(`[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || 'N/A'} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=INVALIDO | jaPersistido=false | acao=IGNORADO_OBJETO_INVALIDO`);
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=INVALID_OBJECT`);
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }

  // 2. Validar confiança mínima
  if (typeof confianca !== 'number' || confianca < MIN_CONFIDENCE) {
    const motivo = `Confiança insuficiente (${confianca}%). Mínimo exigido: ${MIN_CONFIDENCE}%`;
    logger.warn(`[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || 'N/A'} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=DESCARTO_BAIXA_CONF | jaPersistido=false | acao=IGNORADO_BAIXA_CONFIANCA`);
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=INVALID_OBJECT`);
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }

  // 3. TELEMETRIA OBRIGATÓRIA DE EVENT_ID UNIQUENESS
  const previousEventId = Array.from(persistedEventIds).slice(-1)[0] || 'NONE';
  const isUnique = !persistedEventIds.has(eventIdEfetivo);

  logger.info(
    `[EVENT_ID_PERSISTENCE_CHECK]\n` +
      `eventId=${eventIdEfetivo}\n` +
      `previousEventId=${previousEventId}\n` +
      `isUnique=${isUnique}\n` +
      `roundId=${eventIdEfetivo}`
  );

  if (!isUnique) {
    const motivo = `PERSISTENCE_REJECTED=DUPLICATE_EVENT_ID (${eventIdEfetivo})`;
    logger.info(`PERSISTENCE_REJECTED=DUPLICATE_EVENT_ID eventId=${eventIdEfetivo}`);
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=DUPLICATE_EVENT_ID`);
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }

  // 4. PROTEÇÃO CONTRA RACE CONDITION: Se o mesmo eventId estiver em processamento ativo
  const existingLock = activePersistLocks.get(eventIdEfetivo);
  if (existingLock) {
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || 'N/A'} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=AGUARDANDO_MUDANCA | jaPersistido=false | acao=IGNORADO_LOCK_CONCORRENTE`
    );
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=SESSION_LOCKED`);
    return {
      registrado: false,
      motivo: 'PERSISTENCE_REJECTED=CONCURRENT_LOCK',
      sessaoId: sessaoIdParam || null,
      rodadaRegistrada: null,
      eventId: eventIdEfetivo,
    };
  }

  // 5. PROTEÇÃO DE CICLO DE VIDA DA TELA / RODADA (IN-FLIGHT CONCURRENCY & DEDUP)
  const sessionKey = String(sessaoIdParam || 1);
  const activeLifecycle = activeScreenLifecycleMap.get(sessionKey);

  // A) Bloqueio de chamada concorrente em voo na mesma sessão/tela (mesmo ou outro eventId)
  if (activeLifecycle && activeLifecycle.inFlight) {
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessionKey} | eventId=${eventIdEfetivo} | activeEventId=${activeLifecycle.eventId} | state=IN_FLIGHT_LOCK_ACTIVE | action=REJECT_ROUND_ALREADY_LOCKED`
    );
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=ROUND_ALREADY_LOCKED`);
    return {
      registrado: false,
      motivo: `PERSISTENCE_REJECTED=ROUND_ALREADY_LOCKED (${eventIdEfetivo})`,
      sessaoId: sessaoIdParam || null,
      rodadaRegistrada: null,
      eventId: eventIdEfetivo,
    };
  }

  // B) Bloqueio de segunda chamada para a mesma aparição física da tela (diferentes eventIds na mesma tela)
  if (
    activeLifecycle &&
    !activeLifecycle.screenExitConfirmed &&
    activeLifecycle.eventId &&
    activeLifecycle.eventId !== eventIdEfetivo
  ) {
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessionKey} | eventId=${eventIdEfetivo} | activeEventId=${activeLifecycle.eventId} | object=${objetoFormatado} | action=REJECT_DUPLICATE_SCREEN_LIFECYCLE`
    );
    logger.info(`[PERSISTENCE_SKIPPED] eventId=${eventIdEfetivo} roundId=${eventIdEfetivo} object=${objetoFormatado} reason=DUPLICATE_SCREEN_LIFECYCLE`);
    return {
      registrado: false,
      motivo: `PERSISTENCE_REJECTED=DUPLICATE_SCREEN_LIFECYCLE (${eventIdEfetivo})`,
      sessaoId: sessaoIdParam || null,
      rodadaRegistrada: null,
      eventId: eventIdEfetivo,
    };
  }

  // Adquire a trava de ciclo de vida da tela/rodada
  activeScreenLifecycleMap.set(sessionKey, {
    inFlight: true,
    eventId: eventIdEfetivo,
    objeto: objetoFormatado,
    timestamp: Date.now(),
    screenExitConfirmed: false,
  });

  // CADEIA DE TELEMETRIA OBRIGATÓRIA: [PERSISTENCE_TRACE_START]
  logger.info(
    `[PERSISTENCE_TRACE_START]\n` +
      `eventId=${eventIdEfetivo}\n` +
      `roundId=${eventIdEfetivo}\n` +
      `object=${objeto}\n` +
      `normalizedObject=${objetoFormatado}\n` +
      `timestamp=${timestampIso}`
  );

  const executePersistence = async (): Promise<AutoRegisterResult> => {
    try {
      logger.info(
        `[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || 'N/A'} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=CONFIRMADO | jaPersistido=false | acao=INSERT`
      );

      const supabase = getSupabase();
      if (!supabase) {
        const motivo = 'Supabase não configurado ou indisponível.';
        logger.error(
          `[SUPABASE_INSERT_ERROR]\n` +
            `eventId=${eventIdEfetivo}\n` +
            `roundId=${eventIdEfetivo}\n` +
            `object=${objetoFormatado}\n` +
            `code=NO_SUPABASE_CLIENT\n` +
            `message=${motivo}\n` +
            `details=N/A\n` +
            `hint=N/A`
        );
        logger.error(`PERSISTENCE_STATUS=FAILED eventId=${eventIdEfetivo}`);
        return { registrado: false, motivo: `PERSISTENCE_STATUS=FAILED: ${motivo}`, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
      }

      // Localizar ou criar sessão ativa
      let sessaoId: string | number | null = sessaoIdParam || null;
      let numericSessaoId: number | null = null;
      
      if (typeof sessaoId === 'number') {
        numericSessaoId = sessaoId;
      } else if (typeof sessaoId === 'string' && /^\d+$/.test(sessaoId.trim())) {
        numericSessaoId = parseInt(sessaoId.trim(), 10);
      }

      if (!numericSessaoId && !sessaoIdParam) {
        const [resSessao] = await Promise.all([
          obterSessaoAtual(),
          buscarResultadoAnterior(),
        ]);
        if (resSessao.data && resSessao.data.id && resSessao.data.status !== 'encerrada') {
          sessaoId = resSessao.data.id;
          numericSessaoId = typeof sessaoId === 'number' ? sessaoId : parseInt(String(sessaoId), 10) || null;
        } else {
          const novaSessao = await criarSessao();
          if (novaSessao.data && novaSessao.data.id) {
            sessaoId = novaSessao.data.id;
            numericSessaoId = typeof sessaoId === 'number' ? sessaoId : parseInt(String(sessaoId), 10) || null;
          }
        }
      }

      const resAnterior = await buscarResultadoAnterior();
      const itemAnterior = resAnterior.data?.objeto || resAnterior.data?.item || null;
      const confiancaDecimal = confianca > 1 ? Number((confianca / 100).toFixed(4)) : confianca;

      // Calcular próximo número de rodada sequencial no Supabase
      let nextRodada = 1;
      try {
        const { data: maxRow } = await supabase
          .from('resultados')
          .select('rodada')
          .order('rodada', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxRow && typeof maxRow.rodada === 'number' && !isNaN(maxRow.rodada)) {
          nextRodada = maxRow.rodada + 1;
        }
      } catch {
        nextRodada = 1;
      }

      logger.info(
        `[ROUND_PERSISTENCE]\n` +
          `roundId=${eventIdEfetivo}\n` +
          `rodada=${nextRodada}\n` +
          `object=${objetoFormatado}\n` +
          `eventId=${eventIdEfetivo}`
      );

      const payloadReal: any = {
        sessao_id: numericSessaoId || 1,
        rodada: nextRodada,
        objeto: objetoFormatado,
        confianca: confiancaDecimal,
        origem: 'gemini_live',
        status: 'confirmado',
        criado_em: timestampIso,
        horario_resultado: timestampIso,
      };

      // TELEMETRIA OBRIGATÓRIA: [SUPABASE_INSERT_REQUEST]
      logger.info(
        `[SUPABASE_INSERT_REQUEST]\n` +
          `eventId=${eventIdEfetivo}\n` +
          `roundId=${nextRodada}\n` +
          `object=${objetoFormatado}\n` +
          `table=resultados\n` +
          `payload=${JSON.stringify(payloadReal)}`
      );

      // Inserção Direta na tabela 'resultados'
      const { data: insertedData, error: insertError } = await supabase
        .from('resultados')
        .insert([payloadReal])
        .select()
        .single();

      if (insertError) {
        logger.error(
          `[SUPABASE_INSERT_ERROR]\n` +
            `eventId=${eventIdEfetivo}\n` +
            `roundId=${nextRodada}\n` +
            `object=${objetoFormatado}\n` +
            `code=${insertError.code || 'UNKNOWN'}\n` +
            `message=${insertError.message}\n` +
            `details=${insertError.details || 'N/A'}\n` +
            `hint=${insertError.hint || 'N/A'}`
        );
        logger.error(`PERSISTENCE_STATUS=FAILED eventId=${eventIdEfetivo}`);
        activeScreenLifecycleMap.delete(sessionKey);

        return {
          registrado: false,
          motivo: `PERSISTENCE_STATUS=FAILED: ${insertError.message}`,
          sessaoId: numericSessaoId,
          rodadaRegistrada: null,
          eventId: eventIdEfetivo,
        };
      }

      const insertedId = insertedData?.id;
      const insertedObject = insertedData?.objeto || objetoFormatado;
      const insertedRound = insertedData?.rodada || nextRodada;
      const databaseTimestamp = insertedData?.criado_em || insertedData?.horario_resultado || timestampIso;

      // TELEMETRIA OBRIGATÓRIA: [SUPABASE_INSERT_RESPONSE]
      logger.info(
        `[SUPABASE_INSERT_RESPONSE]\n` +
          `eventId=${eventIdEfetivo}\n` +
          `roundId=${insertedRound}\n` +
          `success=true\n` +
          `errorCode=null\n` +
          `errorMessage=null\n` +
          `insertedId=${insertedId}\n` +
          `insertedObject=${insertedObject}\n` +
          `insertedRound=${insertedRound}\n` +
          `databaseTimestamp=${databaseTimestamp}`
      );

      // REQUISITO #8: VERIFICAÇÃO LEITURA SELECT NO SUPABASE
      const { data: verifyData, error: verifyError } = await supabase
        .from('resultados')
        .select('*')
        .eq('id', insertedId)
        .maybeSingle();

      if (verifyData && verifyData.id === insertedId) {
        logger.info(
          `[PERSISTENCE_CONFIRMED]\n` +
            `eventId=${eventIdEfetivo}\n` +
            `roundId=${insertedRound}\n` +
            `object=${insertedObject}\n` +
            `databaseId=${insertedId}\n` +
            `status=CONFIRMED`
        );

        // Marca como persistido APENAS após confirmação real
        persistedEventIds.add(eventIdEfetivo);
        ultimoObjetoRegistrado = objetoFormatado;
        ultimoTimestampRegistro = Date.now();

        // Atualiza trava do ciclo de vida: inFlight = false (para que a mesma tela continue bloqueando outras chamadas enquanto não sair)
        activeScreenLifecycleMap.set(sessionKey, {
          inFlight: false,
          eventId: eventIdEfetivo,
          objeto: objetoFormatado,
          timestamp: Date.now(),
          screenExitConfirmed: false,
        });

        invalidarCacheEstatistico();

        if (itemAnterior) {
          registrarTransicao(itemAnterior, objetoFormatado).catch(() => {});
        }
        executarDetectorPadroes(sessaoId).catch(() => {});

        return {
          registrado: true,
          motivo: 'Resultado registrado e confirmado via SELECT no Supabase.',
          sessaoId: numericSessaoId,
          rodadaRegistrada: insertedRound,
          eventId: eventIdEfetivo,
          insertedId: insertedId,
        };
      } else {
        logger.error(
          `[PERSISTENCE_VERIFY_FAILED]\n` +
            `eventId=${eventIdEfetivo}\n` +
            `roundId=${insertedRound}\n` +
            `object=${insertedObject}\n` +
            `error=${verifyError?.message || 'Registro não retornado no SELECT de verificação'}`
        );
        logger.error(`PERSISTENCE_STATUS=FAILED eventId=${eventIdEfetivo}`);

        return {
          registrado: false,
          motivo: 'PERSISTENCE_STATUS=FAILED: Verificação SELECT pós-inserção falhou.',
          sessaoId: numericSessaoId,
          rodadaRegistrada: null,
          eventId: eventIdEfetivo,
        };
      }
    } catch (err: any) {
      logger.error(
        `[SUPABASE_INSERT_ERROR]\n` +
          `eventId=${eventIdEfetivo}\n` +
          `roundId=${eventIdEfetivo}\n` +
          `object=${objetoFormatado}\n` +
          `code=EXCEPTION\n` +
          `message=${err?.message || 'Exceção desconhecida'}\n` +
          `details=${err?.stack || 'N/A'}\n` +
          `hint=N/A`
      );
      logger.error(`PERSISTENCE_STATUS=FAILED eventId=${eventIdEfetivo}`);

      return {
        registrado: false,
        motivo: `PERSISTENCE_STATUS=FAILED: Exceção durante registro: ${err?.message || 'Erro desconhecido'}`,
        sessaoId: sessaoIdParam || null,
        rodadaRegistrada: null,
        eventId: eventIdEfetivo,
      };
    } finally {
      // REMOVER LOCK APÓS EXECUÇÃO
      activePersistLocks.delete(eventIdEfetivo);
    }
  };

  const promise = executePersistence();
  activePersistLocks.set(eventIdEfetivo, promise);
  return await promise;
}

/**
 * Registra um novo resultado no Supabase.
 */
export async function registrarResultado(resultado: ResultadoRecord) {
  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('Supabase não configurado em registrarResultado');
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const { data, error } = await supabase
      .from('resultados')
      .insert([resultado])
      .select();

    if (error) {
      logger.error('Erro ao registrar resultado:', error.message);
    }
    return { data, error };
  } catch (err: any) {
    logger.error('Exceção ao registrar resultado:', err?.message);
    return { data: null, error: err };
  }
}

/**
 * Busca os N últimos resultados registrados.
 */
export async function buscarUltimosResultados(limite: number = 10) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: [], error: new Error('Supabase cliente não disponível') };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('*');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query
      .order('criado_em', { ascending: false })
      .limit(limite);

    if (error) {
      logger.error('Erro ao buscar últimos resultados:', error.message);
    }
    return { data: data || [], error };
  } catch (err: any) {
    logger.error('Exceção ao buscar últimos resultados:', err?.message);
    return { data: [], error: err };
  }
}

/**
 * Busca o resultado imediatamente anterior ao ID/rodada especificado.
 */
export async function buscarResultadoAnterior(rodadaOuId?: string | number) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('*');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query.order('criado_em', { ascending: false }).limit(2);
    if (error) {
      logger.error('Erro ao buscar resultado anterior:', error.message);
      return { data: null, error };
    }
    const anterior = data && data.length > 1 ? data[1] : null;
    return { data: anterior, error: null };
  } catch (err: any) {
    logger.error('Exceção ao buscar resultado anterior:', err?.message);
    return { data: null, error: err };
  }
}

/**
 * Busca resultado por número de rodada.
 */
export async function buscarPorRodada(rodada: number) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: new Error('Supabase cliente não disponível') };
  }

  try {
    const { data, error } = await supabase
      .from('resultados')
      .select('*')
      .eq('rodada', rodada)
      .maybeSingle();

    if (error) {
      logger.error(`Erro ao buscar por rodada ${rodada}:`, error.message);
    }
    return { data, error };
  } catch (err: any) {
    logger.error(`Exceção ao buscar por rodada ${rodada}:`, err?.message);
    return { data: null, error: err };
  }
}

/**
 * Busca o histórico completo de resultados.
 */
export async function buscarHistorico(limite: number = 100) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: [], error: new Error('Supabase cliente não disponível') };
  }

  try {
    const cutoff = getCutoffTimestamp();
    let query = supabase.from('resultados').select('*');
    if (cutoff) {
      query = query.gt('criado_em', cutoff);
    }
    const { data, error } = await query
      .order('criado_em', { ascending: true })
      .limit(limite);

    if (error) {
      logger.error('Erro ao buscar histórico:', error.message);
    }
    return { data: data || [], error };
  } catch (err: any) {
    logger.error('Exceção ao buscar histórico:', err?.message);
    return { data: [], error: err };
  }
}
