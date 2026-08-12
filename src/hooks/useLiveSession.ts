import { useState, useEffect, useCallback } from 'react';
import {
  LiveConnectionState,
  LiveSessionStatus,
  LiveSessionConfig,
  LiveFramePayload,
  LiveResultPayload,
  LiveEventType,
} from '../types/live';
import { liveService } from '../services/liveService';

export interface UseLiveSessionReturn {
  estado: LiveConnectionState;
  status: LiveSessionStatus;
  iniciarSessao: (config?: Partial<LiveSessionConfig>) => Promise<void>;
  encerrarSessao: (motivo?: string) => Promise<void>;
  enviarFrame: (frame: LiveFramePayload) => Promise<boolean>;
  reconectar: () => Promise<void>;
  executarTesteSimulado: (objeto?: string, confianca?: number) => Promise<any>;
  lastResult: LiveResultPayload | null;
  lastEvent: { tipo: LiveEventType; payload?: any } | null;
  error: string | null;
  isOnline: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
}

export const useLiveSession = (): UseLiveSessionReturn => {
  const [sessionStatus, setSessionStatus] = useState<LiveSessionStatus>(() => liveService.status());
  const [lastResult, setLastResult] = useState<LiveResultPayload | null>(null);
  const [lastEvent, setLastEvent] = useState<{ tipo: LiveEventType; payload?: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Inscrever para atualizar o estado do React dinamicamente via eventos do liveService
    const unsubscribe = liveService.receberEventos((tipo, payload) => {
      setSessionStatus(liveService.status());
      setLastEvent({ tipo, payload });

      if (tipo === 'RESULT_RECEIVED' && payload) {
        setLastResult(payload as LiveResultPayload);
      } else if (tipo === 'ERROR' && payload) {
        setError(payload.mensagem || 'Erro na sessão Live');
      } else if (tipo === 'LIVE_CONNECTED') {
        setError(null);
      }
    });

    // Atualização inicial
    setSessionStatus(liveService.status());

    return () => {
      unsubscribe();
    };
  }, []);

  const iniciarSessao = useCallback(async (config?: Partial<LiveSessionConfig>) => {
    setError(null);
    await liveService.iniciarSessao(config);
    setSessionStatus(liveService.status());
  }, []);

  const encerrarSessao = useCallback(async (motivo?: string) => {
    await liveService.encerrarSessao(motivo);
    setSessionStatus(liveService.status());
  }, []);

  const enviarFrame = useCallback(async (frame: LiveFramePayload) => {
    const ok = await liveService.enviarFrame(frame);
    setSessionStatus(liveService.status());
    return ok;
  }, []);

  const reconectar = useCallback(async () => {
    await liveService.reconectar();
    setSessionStatus(liveService.status());
  }, []);

  const executarTesteSimulado = useCallback(async (objeto?: string, confianca?: number) => {
    const res = await liveService.executarTesteSimulado(objeto, confianca);
    setSessionStatus(liveService.status());
    return res;
  }, []);

  return {
    estado: sessionStatus.estado,
    status: sessionStatus,
    iniciarSessao,
    encerrarSessao,
    enviarFrame,
    reconectar,
    executarTesteSimulado,
    lastResult,
    lastEvent,
    error,
    isOnline: sessionStatus.estado === 'conectado',
    isConnecting: sessionStatus.estado === 'conectando',
    isReconnecting: sessionStatus.estado === 'reconectando',
  };
};
