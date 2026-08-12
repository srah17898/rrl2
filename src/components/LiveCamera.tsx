import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Video,
  VideoOff,
  RefreshCw,
  AlertTriangle,
  Play,
  Square,
  ShieldCheck,
  Zap,
  X,
  LogOut,
  SwitchCamera,
  CheckCircle2,
  List,
  Database,
  Layers,
  Sparkles,
  Info,
  Cpu,
  Monitor,
  Smartphone,
  Radio,
  Clock,
} from 'lucide-react';
import { useLiveSession } from '../hooks/useLiveSession';
import { liveService } from '../services/liveService';
import { canSyncResultToDashboard } from '../services/dashboardSync';
import { LiveResultPayload, LiveFramePayload } from '../types/live';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem } from '../types';
import { LiveDevMetricsPanel } from './LiveDevMetricsPanel';
import {
  VideoSourceType,
  videoSourceManager,
} from '../services/videoSourceManager';
import { WheelRegionDetector } from '../services/WheelRegionDetector';
import { WheelResultScreenDetector } from '../services/WheelResultScreenDetector';
import { computeBase64Hash, computeBase64Bytes } from '../utils/hashUtils';

// Parâmetros de Captura Otimizados (PROMPT LIVE 006 / LIVE 008)
export const CONFIG_CAPTURA_PADRAO = {
  captureIntervalMs: 1000, // 1 frame por segundo (1000ms)
  jpegQuality: 0.85,       // Taxa de compressão JPEG otimizada (0.85 sem artefatos)
  maxWidth: 1920,          // Resolução máxima estendida para preservar proporção de tela do celular
  maxHeight: 1080,         // Resolução máxima estendida
};

interface LiveCameraProps {
  isOpen?: boolean;
  onClose?: () => void;
  onResultDetected?: (result: LiveResultPayload) => void;
  fps?: number; // Padrão: 1 FPS
  captureSource?: VideoSourceType;
  captureIntervalMs?: number;
  jpegQuality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

interface LiveLogEntry {
  id: string;
  timestamp: string;
  mensagem: string;
  tipo: 'info' | 'success' | 'warning' | 'error' | 'confirm';
}

export const LiveCamera: React.FC<LiveCameraProps> = ({
  isOpen = true,
  onClose,
  onResultDetected,
  fps = 1,
  captureSource = 'SCREEN_CAPTURE',
  captureIntervalMs,
  jpegQuality = CONFIG_CAPTURA_PADRAO.jpegQuality,
  maxWidth = CONFIG_CAPTURA_PADRAO.maxWidth,
  maxHeight = CONFIG_CAPTURA_PADRAO.maxHeight,
}) => {
  const {
    estado,
    status,
    iniciarSessao,
    encerrarSessao,
    enviarFrame,
    reconectar,
    executarTesteSimulado,
    lastResult,
    isOnline,
    isConnecting,
    isReconnecting,
  } = useLiveSession();

  // Estados locais da câmera / fonte de vídeo
  const [videoSource, setVideoSource] = useState<VideoSourceType>(captureSource);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [fpsConfig, setFpsConfig] = useState<number>(fps);
  const [fpsRealtime, setFpsRealtime] = useState<number>(0);
  const [lastFrameTime, setLastFrameTime] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [showDevPanel, setShowDevPanel] = useState<boolean>(true);
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);
  const [logs, setLogs] = useState<LiveLogEntry[]>([]);

  // Estados de Diagnóstico da Captura de Tela (Requirements #1 - #10)
  const [mediaStreamSettings, setMediaStreamSettings] = useState<{
    width?: number;
    height?: number;
    frameRate?: number;
    displaySurface?: string;
    label?: string;
    cursor?: string;
  } | null>(null);

  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [lastFrameSendMetadata, setLastFrameSendMetadata] = useState<{
    frameId: number;
    timestamp: number;
    width: number;
    height: number;
    jpegSizeKB: string;
    quality: number;
    requestStarted: number;
    requestFinished: number;
    httpStatus: string;
  } | null>(null);

  const [frameFrozenStatus, setFrameFrozenStatus] = useState<'FRAME_ATUALIZANDO' | 'FRAME_CONGELADO'>('FRAME_ATUALIZANDO');
  const [lastCapturedFrameDataUrl, setLastCapturedFrameDataUrl] = useState<string | null>(null);

  const previousFrameBase64Ref = useRef<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Função para manter referência local do frame para preview/debug com gerenciamento de memória (revogando Object URL anterior)
  const updateLocalDebugFrameUrl = useCallback((canvas: HTMLCanvasElement, fallbackJpegBase64: string) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const newUrl = URL.createObjectURL(blob);
            if (objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
              URL.revokeObjectURL(objectUrlRef.current);
            }
            objectUrlRef.current = newUrl;
            setLastCapturedFrameDataUrl(newUrl);
          } else {
            setLastCapturedFrameDataUrl(fallbackJpegBase64);
          }
        },
        'image/jpeg',
        0.85
      );
    } catch {
      setLastCapturedFrameDataUrl(fallbackJpegBase64);
    }
  }, []);

  // Limpeza de Object URLs ao desmontar o componente
  useEffect(() => {
    return () => {
      if (objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Refs de mídia DOM
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Controle de Concorrência & Telemetria
  const isProcessingFrameRef = useRef<boolean>(false);
  const totalFramesCapturadosRef = useRef<number>(0);
  const totalFramesDescartadosPorBackpressureRef = useRef<number>(0);

  // Adicionar log formatado
  const addLog = useCallback((mensagem: string, tipo: LiveLogEntry['tipo'] = 'info') => {
    const newEntry: LiveLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      mensagem,
      tipo,
    };

    setLogs((prev) => [...prev.slice(-49), newEntry]); // Mantém últimos 50 logs
  }, []);

  // Monitorar mudança de visibilidade da página (segundo plano / retorno à tela)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        addLog('Aplicativo colocado em segundo plano. Pausando capturas para economizar recursos.', 'warning');
      } else {
        addLog('Aplicativo voltou ao primeiro plano. Verificando saúde da sessão e da câmera...', 'info');
        if (isOpen && cameraActive && !isOnline) {
          addLog('Reconectando sessão Live automaticamente...', 'info');
          reconectar();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, cameraActive, isOnline, reconectar, addLog]);

  // Rolagem automática de logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Callback quando novo resultado for processado / confirmado
  useEffect(() => {
    if (!lastResult) return;

    const objetoName = lastResult.objetoDetectado ? lastResult.objetoDetectado.toUpperCase() : 'NENHUM';
    const conf = lastResult.confianca || 0;
    const estab = lastResult.estabilizacao;

    if (estab) {
      if (estab.foiConfirmadoAgora) {
        if (estab.gravadoNoSupabase) {
          addLog(
            `🎉 NOVA RODADA CONFIRMADA: "${estab.ultimoObjetoConfirmado?.toUpperCase()}" (${estab.confiancaUltimaConfirmacao}% conf.) -> Gravado no Supabase!`,
            'confirm'
          );
        } else {
          addLog(
            `❌ Gemini detectou ${objetoName} (${conf}%), mas o registro no Supabase falhou: ${estab.motivoEstabilizacao}`,
            'error'
          );
        }

        if (lastResult.latencia) {
          addLog(
            `⚡ [LATÊNCIA] Captura->Gemini: ${lastResult.latencia.latenciaCapturaParaDeteccaoMs}ms | Gemini->Supabase: ${lastResult.latencia.latenciaDeteccaoParaRegistroMs || 0}ms | Total: ${lastResult.latencia.latenciaTotalMs}ms`,
            'confirm'
          );
        }
        if (onResultDetected) {
          onResultDetected(lastResult);
        }
      } else if (estab.motivoEstabilizacao) {
        if (estab.motivoEstabilizacao.includes('Descartado')) {
          addLog(
            `⚠️ ${objetoName} (${conf}%) descartado pelo WheelVisionAnalyzer — motivo: ${estab.motivoEstabilizacao}`,
            'warning'
          );
        } else if (estab.motivoEstabilizacao.includes('Ignorado')) {
          addLog(
            `ℹ️ ${objetoName} (${conf}%) ignorado — motivo: ${estab.motivoEstabilizacao}`,
            'info'
          );
        } else {
          addLog(
            `🔍 ${objetoName} (${conf}%) em análise — ${estab.motivoEstabilizacao}`,
            'info'
          );
        }
      }
    } else if (lastResult.objetoDetectado) {
      addLog(`Item detectado pelo Gemini: ${objetoName} (${conf}%)`, 'info');
    }
  }, [lastResult, onResultDetected, addLog]);

  /**
   * Interrompe o loop de transmissão de quadros.
   */
  const stopFrameTransmission = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTransmitting(false);
  }, []);

  /**
   * Encerra a captura de vídeo atual e libera as tracks do navegador.
   */
  const stopVideoStream = useCallback(() => {
    videoSourceManager.stopCurrentStream();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Erro ao parar track de vídeo:', e);
        }
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  /**
   * Solicita e ativa a fonte de vídeo configurada (Câmera do dispositivo ou Captura de Tela do Celular)
   */
  const startVideoStream = useCallback(
    async (targetSource?: VideoSourceType) => {
      const activeSource = targetSource || videoSource;
      setCameraError(null);
      stopVideoStream();

      if (activeSource === 'SCREEN_CAPTURE') {
        addLog('Selecione a janela do scrcpy para compartilhar a tela do celular.', 'info');
      }

      setIsRequestingPermission(true);

      videoSourceManager.setConfig({
        sourceType: activeSource,
        facingMode,
        captureFps: fpsConfig,
        jpegQuality,
        maxWidth,
        maxHeight,
      });

      try {
        const { stream, sourceType } = await videoSourceManager.requestStream(() => {
          addLog('Tela desconectada: O compartilhamento de tela foi encerrado.', 'warning');
          setCameraActive(false);
          stopFrameTransmission();
          setCameraError('Tela desconectada');
        });

        mediaStreamRef.current = stream;

        // Registrar configurações do MediaStream / VideoTrack (Requirements #1 & #7)
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
          const trackInfo = {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            displaySurface: (settings as any).displaySurface || 'N/A',
            label: videoTrack.label || 'N/A',
            cursor: (settings as any).cursor || 'N/A',
          };
          setMediaStreamSettings(trackInfo);
          addLog(
            `[MEDIASTREAM INFO] Track: "${trackInfo.label}" | Res: ${trackInfo.width || 'N/A'}x${trackInfo.height || 'N/A'} @ ${trackInfo.frameRate || 'N/A'}fps | DisplaySurface: ${trackInfo.displaySurface}`,
            'info'
          );
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          setVideoDimensions({
            width: videoRef.current.videoWidth || 0,
            height: videoRef.current.videoHeight || 0,
          });
        }

        setCameraActive(true);
        setCameraError(null);
        if (sourceType === 'SCREEN_CAPTURE') {
          addLog('✓ Tela conectada', 'success');
        } else {
          addLog('Câmera física do dispositivo ativada com sucesso.', 'success');
        }
        return true;
      } catch (err: any) {
        console.error('[LIVE CAMERA] Erro ao iniciar vídeo:', err);
        const errMsg = err.message || 'Não foi possível inicializar a fonte de vídeo.';

        setCameraError(errMsg);
        setCameraActive(false);
        addLog(`Erro na fonte de vídeo (${activeSource}): ${errMsg}`, 'error');
        return false;
      } finally {
        setIsRequestingPermission(false);
      }
    },
    [videoSource, facingMode, fpsConfig, jpegQuality, maxWidth, maxHeight, stopVideoStream, stopFrameTransmission, addLog]
  );

  /**
   * Alterna a fonte de vídeo em tempo de execução
   */
  const handleSelectSource = async (newSource: VideoSourceType) => {
    if (newSource === videoSource && cameraActive) return;

    setVideoSource(newSource);
    setCameraError(null);
    addLog(`Fonte de vídeo alterada para: ${newSource === 'SCREEN_CAPTURE' ? 'Tela do celular (scrcpy)' : 'Câmera física'}`, 'info');

    if (newSource === 'CAMERA') {
      await startVideoStream('CAMERA');
    } else {
      stopFrameTransmission();
      stopVideoStream();
      setCameraActive(false);
      addLog('Selecione a janela do scrcpy para compartilhar a tela do celular.', 'info');
    }
  };

  /**
   * Alterna entre câmera frontal e traseira se disponível (Apenas modo CAMERA).
   */
  const toggleFacingMode = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (cameraActive && videoSource === 'CAMERA') {
      setTimeout(() => startVideoStream('CAMERA'), 100);
    }
  };

  /**
   * Executa teste estático em 1 único frame capturado da tela (Requirement #11)
   */
  const handleTestSingleFrame = useCallback(async () => {
    addLog('🧪 Executando Teste de Frame Estático Real da Tela...', 'info');

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < 2) {
      addLog('❌ Vídeo da tela não está disponível ou ativo.', 'error');
      return { httpStatus: 'Erro: Vídeo Inativo', erro: 'O vídeo da tela não está ativo.' };
    }

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    canvas.width = vWidth;
    canvas.height = vHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return { erro: 'Não foi possível obter contexto 2D do Canvas' };

    ctx.drawImage(video, 0, 0, vWidth, vHeight);
    const jpegBase64 = canvas.toDataURL('image/jpeg', 0.85);

    updateLocalDebugFrameUrl(canvas, jpegBase64);

    const tStart = Date.now();
    try {
      const res = await liveService.enviarFrameFull({
        base64Data: jpegBase64,
        mimeType: 'image/jpeg',
        timestamp: tStart,
        width: vWidth,
        height: vHeight,
        source: 'SCREEN_CAPTURE',
      });
      const tEnd = Date.now();

      addLog(
        `✓ Teste Frame Estático concluído em ${tEnd - tStart}ms. Objeto: "${res?.objetoDetectado || 'nenhum'}" (${res?.confianca || 0}%)`,
        'success'
      );

      return {
        httpStatus: '200 OK',
        tempoMs: tEnd - tStart,
        largura: vWidth,
        altura: vHeight,
        respostaBrutaGemini: res?.geminiRawResponse || res?.rawText || 'Sem resposta',
        estadoGemini: res?.geminiEstadoLog || 'N/A',
        objetoDetectado: res?.objetoDetectado || 'Nenhum',
        confianca: res?.confianca || 0,
        frameDiagnostico: res?.frameDiagnostico,
        estabilizacao: res?.estabilizacao,
      };
    } catch (err: any) {
      addLog(`❌ Erro no Teste de Frame Estático: ${err?.message}`, 'error');
      return {
        httpStatus: '500 Error',
        erro: err?.message || 'Erro ao enviar frame estático',
      };
    }
  }, [enviarFrame, addLog]);

  // Ref para armazenar o quadro mais recente capturado (Latest Frame Wins)
  const latestFramePayloadRef = useRef<{
    framePayload: LiveFramePayload;
    frameId: number;
    targetWidth: number;
    targetHeight: number;
    jpegSizeKB: string;
    effectiveJpegQuality: number;
    roi: any;
    currentFrozenStatus: string;
  } | null>(null);

  /**
   * Processador do quadro mais recente (Latest Frame Wins).
   * Garante exatamente UMA requisição ao Gemini em andamento por vez.
   */
  const processLatestFrame = useCallback(async () => {
    if (isProcessingFrameRef.current || !latestFramePayloadRef.current) {
      return;
    }

    isProcessingFrameRef.current = true;
    const currentItem = latestFramePayloadRef.current;
    latestFramePayloadRef.current = null; // consome o frame mais recente

    const {
      framePayload,
      frameId,
      targetWidth,
      targetHeight,
      jpegSizeKB,
      effectiveJpegQuality,
      roi,
    } = currentItem;

    const requestStarted = Date.now();

    try {
      addLog(`[SEND] Frame #${frameId} (ROI: ${roi.width}x${roi.height})`, 'info');
      addLog(`[BACKEND_WAIT] Frame #${frameId} enviado, aguardando resposta...`, 'info');

      const res = await liveService.enviarFrameFull(framePayload);
      const requestFinished = Date.now();
      const durationMs = requestFinished - requestStarted;

      if (res) {
        const httpStatusStr = res.geminiHttpStatus ? `HTTP ${res.geminiHttpStatus}` : 'HTTP 200';
        addLog(`[BACKEND_RESPONSE] Frame #${frameId} — ${durationMs}ms (${httpStatusStr})`, 'info');

        const objDetected = res.objetoDetectado || 'nenhum';
        const confScore = res.confianca || 0;

        addLog(`[GEMINI_RESULT] Frame #${frameId} → ${objDetected}`, 'info');
        addLog(`[CONFIDENCE] Frame #${frameId} → ${confScore}%`, 'info');

        if (res.estabilizacao) {
          const est = res.estabilizacao;
          const cand = est.candidatoAtual || objDetected;
          const count = est.confirmacoesConsecutivas || 0;
          const required = est.confirmacoesNecessarias || 3;

          addLog(`[STABILIZATION] ${cand}`, 'info');
          addLog(`[STABILIZATION] contador: ${count}/${required}`, 'info');

          if (est.foiConfirmadoAgora) {
            addLog(`[CONFIRMED] ${cand}`, 'success');
            addLog(`[REGISTER] Tentando registrar ${cand}...`, 'info');

            if (est.gravadoNoSupabase) {
              addLog(`[REGISTER] Sucesso (Rodada #${est.rodadaRegistrada || 'OK'})`, 'success');
            } else {
              addLog(`[REGISTER] BLOQUEADO — PERSISTÊNCIA DESABILITADA (${est.motivoEstabilizacao || 'MODO_TESTE'})`, 'warning');
            }

            onResultDetected?.(res);
          }
        }

        setLastFrameSendMetadata({
          frameId,
          timestamp: requestStarted,
          width: targetWidth,
          height: targetHeight,
          jpegSizeKB,
          quality: effectiveJpegQuality,
          requestStarted,
          requestFinished,
          httpStatus: '200 OK',
        });
      } else {
        addLog(`[BACKEND_ERROR] Frame #${frameId} — Falha ao processar frame no backend`, 'error');
      }
    } catch (err: any) {
      const durationMs = Date.now() - requestStarted;
      addLog(`[BACKEND_ERROR] Frame #${frameId} — HTTP 500 / ${err?.message || 'Erro no backend'} (${durationMs}ms)`, 'error');
    } finally {
      isProcessingFrameRef.current = false;
      // Processa o frame mais recente se tiver chegado um novo durante o tempo de execução
      if (latestFramePayloadRef.current) {
        processLatestFrame();
      }
    }
  }, [addLog, onResultDetected]);

  /**
   * Captura e comprime o frame do elemento `<video>` em um canvas offscreen,
   * convertendo para JPEG base64 e transmitindo efemeramente para o backend.
   * Aplica CONTROLE DE CONCORRÊNCIA e BACKPRESSURE (Latest Frame Wins).
   */
  const captureAndSendFrame = useCallback(() => {
    totalFramesCapturadosRef.current++;

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < 2) {
      return;
    }

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    setVideoDimensions({ width: vWidth, height: vHeight });

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }

    // Preservar a resolução original sem redução artificial pequena
    let targetWidth = vWidth;
    let targetHeight = vHeight;

    if (targetWidth > 1920) {
      const scale = 1920 / targetWidth;
      targetWidth = 1920;
      targetHeight = Math.round(targetHeight * scale);
    }
    if (targetHeight > 1080) {
      const scale = 1080 / targetHeight;
      targetHeight = 1080;
      targetWidth = Math.round(targetWidth * scale);
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    setCanvasDimensions({ width: targetWidth, height: targetHeight });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const effectiveJpegQuality = jpegQuality < 0.85 ? 0.85 : jpegQuality;
    const jpegBase64 = canvas.toDataURL('image/jpeg', effectiveJpegQuality);

    // Detecção e Recorte da ROI da Roda
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const roi = WheelRegionDetector.detectWheelRegion({
      width: targetWidth,
      height: targetHeight,
      imageData: imgData,
    });

    let croppedDataUrl: string | undefined;
    let croppedBase64: string | undefined;

    if (roi.found) {
      croppedDataUrl = WheelRegionDetector.cropROIFromCanvas(canvas, roi, effectiveJpegQuality) || undefined;
      if (croppedDataUrl) {
        croppedBase64 = croppedDataUrl.replace(/^data:image\/\w+;base64,/, '');
        roi.croppedDataUrl = croppedDataUrl;
      }
    }

    // Detecção da Tela de Resultado
    const resScreen = WheelResultScreenDetector.detectResultScreen({
      width: targetWidth,
      height: targetHeight,
      imageData: imgData,
    });

    let resultScreenCroppedDataUrl: string | undefined;
    let resultScreenCroppedBase64: string | undefined;

    if (resScreen.resultadoScreenDetected && resScreen.roi) {
      const cropXToUse = resScreen.roi.absCropX ?? resScreen.roi.x;
      const cropYToUse = resScreen.roi.absCropY ?? resScreen.roi.y;
      const cropWToUse = resScreen.roi.absCropWidth ?? resScreen.roi.width;
      const cropHToUse = resScreen.roi.absCropHeight ?? resScreen.roi.height;

      const resCanvas = document.createElement('canvas');
      resCanvas.width = cropWToUse;
      resCanvas.height = cropHToUse;
      const resCtx = resCanvas.getContext('2d');
      if (resCtx) {
        resCtx.drawImage(
          canvas,
          cropXToUse,
          cropYToUse,
          cropWToUse,
          cropHToUse,
          0,
          0,
          cropWToUse,
          cropHToUse
        );
        resultScreenCroppedDataUrl = resCanvas.toDataURL('image/jpeg', effectiveJpegQuality);
        resultScreenCroppedBase64 = resultScreenCroppedDataUrl.replace(/^data:image\/\w+;base64,/, '');

        console.log(`[CROP_DEBUG] created=true width=${cropWToUse} height=${cropHToUse} source=RESULT_ZONE`);
        liveService.preserveLocalCrop({
          resultScreenCroppedDataUrl,
          croppedDataUrl: resultScreenCroppedDataUrl,
          width: cropWToUse,
          height: cropHToUse,
        });
      }
    }

    // Verificação de frame congelado
    let frozen = false;
    if (previousFrameBase64Ref.current) {
      if (previousFrameBase64Ref.current === jpegBase64) {
        frozen = true;
      } else if (
        previousFrameBase64Ref.current.length === jpegBase64.length &&
        previousFrameBase64Ref.current.slice(-100) === jpegBase64.slice(-100)
      ) {
        frozen = true;
      }
    }
    previousFrameBase64Ref.current = jpegBase64;
    const currentFrozenStatus = frozen ? 'FRAME_CONGELADO' : 'FRAME_ATUALIZANDO';
    setFrameFrozenStatus(currentFrozenStatus);

    updateLocalDebugFrameUrl(canvas, jpegBase64);

    const frameId = totalFramesCapturadosRef.current;
    const cleanBase64 = jpegBase64.replace(/^data:image\/\w+;base64,/, '');
    const jpegSizeBytes = Math.round((cleanBase64.length * 3) / 4);
    const jpegSizeKB = (jpegSizeBytes / 1024).toFixed(1) + ' KB';

    const now = Date.now();
    if (lastFrameTime) {
      const deltaSec = (now - lastFrameTime) / 1000;
      if (deltaSec > 0) {
        setFpsRealtime(Number((1 / deltaSec).toFixed(1)));
      }
    }
    setLastFrameTime(now);

    addLog(`[CAPTURE] Frame #${frameId} (${targetWidth}x${targetHeight}, ${jpegSizeKB}, ROI: ${roi.status}) [${currentFrozenStatus}]`, 'info');

    if (isProcessingFrameRef.current) {
      totalFramesDescartadosPorBackpressureRef.current++;
      addLog(
        `[BACKPRESSURE] Frame #${frameId} retido. Requisição anterior em andamento (O mais recente será processado em seguida).`,
        'warning'
      );
    }

    // Metadados do MediaStream / VideoTrack se disponíveis
    const mediaStreamInfo = mediaStreamSettings
      ? {
          ...mediaStreamSettings,
          videoWidth: vWidth,
          videoHeight: vHeight,
        }
      : mediaStreamRef.current
      ? (() => {
          const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
          if (!videoTrack) return undefined;
          const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
          return {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            displaySurface: (settings as any).displaySurface || 'N/A',
            label: videoTrack.label || 'N/A',
            videoWidth: vWidth,
            videoHeight: vHeight,
          };
        })()
      : undefined;

    const winnerCropBase64ToUse = resultScreenCroppedBase64 || croppedBase64 || cleanBase64;
    const winnerCropW = resScreen.roi?.symbolCropWidth || resScreen.roi?.absCropWidth || resScreen.roi?.width || 153;
    const winnerCropH = resScreen.roi?.symbolCropHeight || resScreen.roi?.absCropHeight || resScreen.roi?.height || 153;
    const winnerBytes = computeBase64Bytes(winnerCropBase64ToUse);
    const winnerHash = computeBase64Hash(winnerCropBase64ToUse);

    const robustResultScreenRoi = {
      ...(resScreen.roi || {}),
      symbolCropWidth: winnerCropW,
      symbolCropHeight: winnerCropH,
      symbolCropValid: true,
    };

    console.log(
      `[LIVE_REAL] FRAME_CAPTURED\n` +
      `[LIVE_REAL] FRAME_ID: #${frameId}\n` +
      `[LIVE_REAL] FRAME_SIZE: ${targetWidth}x${targetHeight}\n` +
      `[LIVE_REAL] RESULT_SCREEN_DETECTED: ${resScreen.resultadoScreenDetected}\n` +
      `[LIVE_REAL] SYMBOL_CROP_AVAILABLE: ${!!resultScreenCroppedBase64}\n` +
      `[LIVE_REAL] WINNER_CROP_AVAILABLE: ${!!winnerCropBase64ToUse}\n` +
      `[LIVE_REAL] WINNER_CROP_SIZE: ${winnerCropW}x${winnerCropH}\n` +
      `[LIVE_REAL] WINNER_CROP_BASE64_LENGTH: ${winnerCropBase64ToUse.length}\n` +
      `[WINNER_CROP] size=${winnerCropW}x${winnerCropH} bytes=${winnerBytes} hash=${winnerHash}`
    );

    // Atualiza o buffer com o quadro mais recente (Latest Frame Wins)
    latestFramePayloadRef.current = {
      framePayload: {
        base64Data: croppedBase64 || cleanBase64,
        mimeType: 'image/jpeg',
        timestamp: now,
        width: targetWidth,
        height: targetHeight,
        source: 'SCREEN_CAPTURE',
        metadata: {
          statusCongelamento: currentFrozenStatus,
          qualidadeJpeg: effectiveJpegQuality,
          mediaStreamInfo,
          previewUrl: jpegBase64,
          croppedDataUrl,
          croppedBase64,
          roi,
          resultadoScreenDetected: resScreen.resultadoScreenDetected,
          resultScreenConfidence: resScreen.confidence,
          resultScreenRoi: robustResultScreenRoi,
          resultScreenCroppedDataUrl,
          resultScreenCroppedBase64,
          winnerCropBase64: winnerCropBase64ToUse,
          symbolCropBase64: winnerCropBase64ToUse,
          winnerCropDataUrl: resultScreenCroppedDataUrl || croppedDataUrl,
          symbolCropDataUrl: resultScreenCroppedDataUrl || croppedDataUrl,
        },
      },
      frameId,
      targetWidth,
      targetHeight,
      jpegSizeKB,
      effectiveJpegQuality,
      roi,
      currentFrozenStatus,
    };

    // Dispara o processamento caso não haja requisição em andamento
    processLatestFrame();
  }, [lastFrameTime, jpegQuality, addLog, mediaStreamSettings, processLatestFrame]);

  /**
   * Inicia o loop continuo de streaming de quadros.
   */
  const startFrameTransmission = useCallback(() => {
    stopFrameTransmission();

    const intervalMs = captureIntervalMs || Math.max(250, Math.round(1000 / fpsConfig));
    setIsTransmitting(true);

    captureAndSendFrame();

    timerRef.current = setInterval(() => {
      captureAndSendFrame();
    }, intervalMs);

    addLog(`Transmissão contínua iniciada (${fpsConfig} FPS - ${intervalMs}ms interval)`, 'info');
  }, [captureAndSendFrame, fpsConfig, captureIntervalMs, stopFrameTransmission, addLog]);

  /**
   * Inicia o fluxo completo Live (Abre Fonte de Vídeo + Conecta Sessão + Inicia Transmissão).
   */
  const handleStartLive = async () => {
    setCameraError(null);

    let okCam = cameraActive;
    if (!okCam) {
      okCam = await startVideoStream();
    }

    if (!okCam) return;

    if (!isOnline) {
      addLog('Conectando à Gemini Live API...', 'info');
      await iniciarSessao({
        fps: fpsConfig,
        consecutiveConfirmationsRequired: 3,
        minConfidenceRequired: 85,
      });
    }

    startFrameTransmission();
  };

  /**
   * Encerra a transmissão ao vivo e fecha a fonte de vídeo com segurança.
   */
  const handleStopLive = async () => {
    stopFrameTransmission();
    stopVideoStream();
    await encerrarSessao('Transmissão encerrada manualmente pelo usuário');
    addLog('Transmissão Live encerrada pelo usuário.', 'info');
  };

  // Efeito ao abrir/fechar interface e ouvinte de tecla ESC
  useEffect(() => {
    if (isOpen && !cameraActive && !cameraError && !isRequestingPermission) {
      if (videoSource === 'CAMERA') {
        startVideoStream('CAMERA');
      } else {
        addLog('Selecione a janela do scrcpy para compartilhar a tela do celular.', 'info');
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const ultimoObjetoConfirmado = status.ultimoObjetoConfirmado;
  const confirmedConfig = ultimoObjetoConfirmado
    ? WHEEL_ITEMS[ultimoObjetoConfirmado as WheelItem]
    : null;

  const currentCandidate = status.candidatoAtual;
  const candidateConfig = currentCandidate
    ? WHEEL_ITEMS[currentCandidate as WheelItem]
    : null;

  return (
    <div className={isOpen ? "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn" : "hidden"}>
      {/* Backdrop clicável fora do modal */}
      <div
        onClick={() => {
          onClose?.();
        }}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer"
        title="Clique fora para fechar (Manta a transmissão ativa em segundo plano)"
      />

      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col relative z-10 my-auto max-h-[90dvh] overflow-y-auto">
        
        {/* HEADER DA CÂMERA LIVE */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 sm:p-4 bg-slate-950/90 border-b border-slate-800 shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
              <Camera className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
                Câmera Live AI – Visão da Roda Gigante
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  PROMPT LIVE 009
                </span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 hidden xs:block">
                Detecção contínua e gravação automática no Supabase após estabilização anti-falsos positivos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowDevPanel((prev) => !prev)}
              className={`px-2 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition flex items-center gap-1 ${
                showDevPanel
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Alternar Painel Técnico de Monitoramento"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Painel Técnico</span>
            </button>

            <button
              onClick={() => setShowLogs((prev) => !prev)}
              className={`px-2 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition flex items-center gap-1 ${
                showLogs
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Alternar Console de Logs"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logs Live</span>
            </button>

            {onClose && (
              <button
                onClick={() => {
                  onClose();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                title="Sair do painel (A transmissão continuará ativa em segundo plano)"
              >
                <X className="w-4 h-4 shrink-0 text-slate-400" />
                <span>SAIR</span>
              </button>
            )}
          </div>
        </div>

        {/* CONTAINER DO VÍDEO / VIEWPORT DA CÂMERA */}
        <div className="relative bg-slate-950 aspect-video w-full flex items-center justify-center overflow-hidden group shrink-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              cameraActive ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* OVERLAY DE STATUS DA TRANSMISSÃO */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
            {isTransmitting && isOnline ? (
              <div className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/50 rounded-full text-emerald-400 font-extrabold text-xs flex items-center gap-2 backdrop-blur-md shadow-lg">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span>
                  {videoSource === 'SCREEN_CAPTURE' ? '✓ Tela conectada (Transmitindo)' : 'TRANSMITINDO LIVE'}
                </span>
                <span className="text-[10px] text-emerald-300/80 border-l border-emerald-500/30 pl-2">
                  {fpsRealtime} FPS
                </span>
              </div>
            ) : isRequestingPermission ? (
              <div className="px-3 py-1 bg-amber-950/80 border border-amber-500/50 rounded-full text-amber-300 font-extrabold text-xs flex items-center gap-2 backdrop-blur-md shadow-lg">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Fonte: SCREEN_CAPTURE | Status: Aguardando permissão</span>
              </div>
            ) : isConnecting || isReconnecting ? (
              <div className="px-3 py-1 bg-cyan-950/80 border border-cyan-500/50 rounded-full text-cyan-300 font-extrabold text-xs flex items-center gap-2 backdrop-blur-md shadow-lg">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>CONECTANDO...</span>
              </div>
            ) : cameraActive ? (
              <div className="px-3 py-1 bg-slate-900/80 border border-slate-700/80 rounded-full text-slate-300 font-bold text-xs flex items-center gap-2 backdrop-blur-md shadow-lg">
                {videoSource === 'SCREEN_CAPTURE' ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-extrabold">Fonte: SCREEN_CAPTURE | Status: ✓ Tela conectada</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Câmera Pronta (Aguardando Live)</span>
                  </>
                )}
              </div>
            ) : videoSource === 'SCREEN_CAPTURE' ? (
              <div className="px-3 py-1 bg-slate-900/80 border border-slate-800 rounded-full text-amber-300 font-bold text-xs flex items-center gap-2 backdrop-blur-md">
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Fonte: SCREEN_CAPTURE | Status: Tela desconectada</span>
              </div>
            ) : cameraError ? (
              <div className="px-3 py-1 bg-rose-950/80 border border-rose-500/50 rounded-full text-rose-300 font-bold text-xs flex items-center gap-2 backdrop-blur-md shadow-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Erro na fonte de vídeo</span>
              </div>
            ) : (
              <div className="px-3 py-1 bg-slate-900/80 border border-slate-800 rounded-full text-slate-500 font-bold text-xs flex items-center gap-2 backdrop-blur-md">
                <VideoOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Fonte de Vídeo Desligada</span>
              </div>
            )}

            {/* BADGE DE RODADAS REGISTRADAS NO SUPABASE */}
            {status.totalRodadasDetectadasSessao !== undefined && (
              <div className="px-3 py-1 bg-indigo-950/80 border border-indigo-500/50 rounded-full text-indigo-300 font-bold text-xs flex items-center gap-1.5 backdrop-blur-md shadow-lg">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>{status.totalRodadasDetectadasSessao} Rodadas Registradas</span>
              </div>
            )}
          </div>

          {/* OVERLAY DE ESTABILIZAÇÃO DO CANDIDATO EM TEMPO REAL */}
          {status.candidatoAtual && !status.ultimoObjetoConfirmado && (
            <div className="absolute top-3 right-3 z-10 px-3 py-1 bg-amber-950/80 border border-amber-500/50 rounded-full text-amber-300 font-bold text-xs flex items-center gap-1.5 backdrop-blur-md shadow-lg animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Analisando {candidateConfig?.emoji || ''} {status.candidatoAtual} (
                {status.confirmacoesConsecutivas || 1}/3)
              </span>
            </div>
          )}

          {/* PAINEL DE ÚLTIMO SÍMBOLO CONFIRMADO NO SUPABASE */}
          {ultimoObjetoConfirmado && (
            <div className="absolute bottom-3 left-3 right-3 z-10 p-3.5 bg-slate-900/95 border border-emerald-500/50 rounded-2xl backdrop-blur-md flex items-center justify-between shadow-2xl animate-slideUp">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{confirmedConfig?.emoji || '✨'}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Último Símbolo Confirmado
                    </span>
                    {status.confiancaUltimaConfirmacao && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {status.confiancaUltimaConfirmacao}% Confiança
                      </span>
                    )}
                  </div>
                  <span className="text-base font-black text-slate-100 capitalize">
                    {confirmedConfig?.label || ultimoObjetoConfirmado}
                  </span>
                </div>
              </div>

              <div className="text-right font-mono text-[11px] text-slate-400">
                <span className="block text-emerald-400 font-bold flex items-center gap-1 justify-end">
                  <Database className="w-3 h-3" /> Gravado no Supabase
                </span>
                {status.horarioUltimaConfirmacao && (
                  <span>{new Date(status.horarioUltimaConfirmacao).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          )}

          {/* MENSAGEM DE ERRO OU CARREGAMENTO DE CÂMERA / TELA */}
          {!cameraActive && (
            <div className="p-6 text-center space-y-4 max-w-md my-auto z-10">
              {isRequestingPermission ? (
                <div className="space-y-3">
                  <RefreshCw className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
                  <h4 className="text-sm font-extrabold text-amber-300 uppercase tracking-wide">
                    Aguardando Permissão do Navegador
                  </h4>
                  <p className="text-xs text-slate-300 bg-slate-950/90 p-3 rounded-xl border border-slate-800 shadow-inner">
                    Selecione a janela do scrcpy para compartilhar a tela do celular.
                  </p>
                </div>
              ) : videoSource === 'SCREEN_CAPTURE' ? (
                <div className="space-y-3">
                  {cameraError ? (
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                  ) : (
                    <Smartphone className="w-10 h-10 text-indigo-400 mx-auto" />
                  )}
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-slate-200 uppercase tracking-wide">
                      Fonte: SCREEN_CAPTURE — Status: Tela desconectada
                    </h4>
                    <p className="text-xs text-slate-300 bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 shadow-inner">
                      {cameraError || 'Selecione a janela do scrcpy para compartilhar a tela do celular.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startVideoStream('SCREEN_CAPTURE')}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-lg shadow-indigo-950/50 inline-flex items-center gap-2 cursor-pointer active:scale-95 border border-indigo-400/30"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>{cameraError ? 'Tentar novamente' : 'Conectar tela'}</span>
                  </button>
                </div>
              ) : cameraError ? (
                <div className="space-y-3">
                  <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
                  <h4 className="text-sm font-bold text-rose-300 uppercase">Falha na Câmera</h4>
                  <p className="text-xs text-slate-400">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startVideoStream('CAMERA')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar Novamente
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-400">
                    Solicitando permissão e ativando a fonte de vídeo...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PAINEL DE ANÁLISE LIVE (PROMPT LIVE 009 - VISÃO DA RODA GIGANTE) */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-200 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>ANÁLISE LIVE — VISÃO ESPECIALIZADA DA RODA</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">
              ≥85% Confiança | Estabilização Estrita (3x Confirmações)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Objeto Atual */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Objeto Atual:</span>
              <span className="text-xs font-black text-slate-100 capitalize mt-0.5 truncate flex items-center gap-1">
                {lastResult?.objetoDetectado ? (
                  <>
                    <span>{WHEEL_ITEMS[lastResult.objetoDetectado as WheelItem]?.emoji || '🎡'}</span>
                    <span>{lastResult.objetoDetectado}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-normal">Aguardando...</span>
                )}
              </span>
            </div>

            {/* Candidato */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Candidato:</span>
              <span className="text-xs font-black text-amber-300 capitalize mt-0.5 truncate flex items-center gap-1">
                {status.candidatoAtual ? (
                  <>
                    <span>{WHEEL_ITEMS[status.candidatoAtual as WheelItem]?.emoji || '⏳'}</span>
                    <span>{status.candidatoAtual} ({status.confirmacoesConsecutivas || 0}/3)</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-normal">Nenhum</span>
                )}
              </span>
            </div>

            {/* Confiança */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Confiança:</span>
              <span className="text-xs font-black text-cyan-300 mt-0.5 flex items-center justify-between">
                <span>{lastResult?.confianca ? `${lastResult.confianca}%` : '0%'}</span>
                <span className="text-[9px] font-mono text-emerald-400 font-bold">
                  Mín: 3 Conf.
                </span>
              </span>
            </div>

            {/* Último Resultado Confirmado */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Último Confirmado:</span>
              <span className="text-xs font-black text-emerald-400 capitalize mt-0.5 truncate flex items-center gap-1">
                {status.ultimoObjetoConfirmado ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{status.ultimoObjetoConfirmado}</span>
                    {status.horarioUltimaConfirmacao && (
                      <span className="text-[9px] font-mono text-slate-400 font-normal ml-auto">
                        [{new Date(status.horarioUltimaConfirmacao).toLocaleTimeString()}]
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500 font-normal">Nenhum</span>
                )}
              </span>
            </div>
          </div>

          {/* PAINEL DE LATÊNCIA EM TEMPO REAL */}
          {lastResult?.latencia && (
            <div className="mt-2 p-2.5 bg-slate-950/90 rounded-xl border border-indigo-500/30 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>MÉTRICAS DE LATÊNCIA</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <span>
                  Gemini: <strong className="text-cyan-400">{lastResult.latencia.latenciaCapturaParaDeteccaoMs}ms</strong>
                </span>
                <span>
                  Supabase: <strong className="text-emerald-400">{lastResult.latencia.latenciaDeteccaoParaRegistroMs || 0}ms</strong>
                </span>
                <span>
                  Total: <strong className="text-amber-400">{lastResult.latencia.latenciaTotalMs}ms</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* CONSOLE DE LOGS DA SESSÃO EM TEMPO REAL (PROMPT LIVE 004) */}
        {showLogs && (
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex-1 overflow-hidden flex flex-col min-h-[120px] max-h-[160px]">
            <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1 text-indigo-400">
                <List className="w-3.5 h-3.5" /> Log de Transmissão & Estabilização Live
              </span>
              <span className="text-[10px] text-slate-500">Filtrando 8 objetos permitidos</span>
            </div>

            <div
              ref={logsContainerRef}
              className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] p-2 bg-slate-900/80 rounded-xl border border-slate-800/80 scrollbar-thin scrollbar-thumb-slate-800"
            >
              {logs.length === 0 ? (
                <div className="text-slate-600 text-[10px] italic py-2 text-center">
                  Aguardando quadros para iniciar o fluxo de reconhecimento...
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-0.5 border-b border-slate-800/40 last:border-0 ${
                      log.tipo === 'confirm'
                        ? 'text-emerald-300 font-bold bg-emerald-950/30 px-1.5 rounded'
                        : log.tipo === 'warning'
                        ? 'text-amber-300/90'
                        : log.tipo === 'error'
                        ? 'text-rose-400'
                        : log.tipo === 'success'
                        ? 'text-cyan-300'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="text-slate-600 shrink-0 text-[10px]">[{log.timestamp}]</span>
                    <span className="break-words">{log.mensagem}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PAINEL TÉCNICO DE MONITORAMENTO */}
        {showDevPanel && (
          <LiveDevMetricsPanel
            status={status}
            captureFps={fpsConfig}
            isTransmitting={isTransmitting}
            videoSource={videoSource}
            cameraActive={cameraActive}
            totalCapturados={totalFramesCapturadosRef.current}
            totalEnviados={status.totalFramesEnviados}
            totalDescartadosBackpressure={totalFramesDescartadosPorBackpressureRef.current}
            lastResult={lastResult}
            cameraError={cameraError}
            onRunSimulatedTest={executarTesteSimulado}
            mediaStreamSettings={mediaStreamSettings}
            videoDimensions={videoDimensions}
            canvasDimensions={canvasDimensions}
            lastFrameSendMetadata={lastFrameSendMetadata}
            frameFrozenStatus={frameFrozenStatus}
            lastCapturedFrameDataUrl={lastCapturedFrameDataUrl}
            onTestSingleFrame={handleTestSingleFrame}
          />
        )}

        {/* CONTROLES DA CÂMERA E TRANSMISSÃO */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0">
          
          {/* SELEÇÃO DA FONTE DE VÍDEO (PROMPT LIVE 008) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-2.5 bg-slate-900/90 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>Fonte de vídeo:</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSelectSource('CAMERA')}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  videoSource === 'CAMERA'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-950/40'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-indigo-200" />
                <span>( ) Câmera</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectSource('SCREEN_CAPTURE')}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  videoSource === 'SCREEN_CAPTURE'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-950/40'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-200" />
                <span>( ) Tela do celular</span>
              </button>

              {videoSource === 'SCREEN_CAPTURE' && cameraActive && (
                <button
                  type="button"
                  onClick={() => {
                    stopFrameTransmission();
                    stopVideoStream();
                    addLog('Tela desconectada pelo usuário.', 'info');
                  }}
                  className="px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  title="Desconectar tela e parar compartilhamento"
                >
                  <Square className="w-3.5 h-3.5 text-rose-400" />
                  <span>Desconectar tela</span>
                </button>
              )}

              {videoSource === 'SCREEN_CAPTURE' && !cameraActive && (
                <button
                  type="button"
                  onClick={() => startVideoStream('SCREEN_CAPTURE')}
                  disabled={isRequestingPermission}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
                  title="Conectar compartilhamento de tela"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{isRequestingPermission ? 'Aguardando...' : 'Conectar tela'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* INFORMAÇÕES DE FRAMES E ESTABILIZAÇÃO */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Frames:</span>
                <span className="text-cyan-400 font-bold">{status.totalFramesEnviados}</span>
              </div>

              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 border-l border-slate-800 pl-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>3 Confirmações Consecutivas @ ≥90% Conf.</span>
              </div>
            </div>

            {/* SELETOR DE TAXA DE CAPTURA (FPS) */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Capture FPS:
              </span>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                <button
                  onClick={() => setFpsConfig(0.5)}
                  className={`px-2 py-0.5 rounded-lg transition ${
                    fpsConfig === 0.5 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  0.5 FPS (2s)
                </button>
                <button
                  onClick={() => setFpsConfig(1)}
                  className={`px-2 py-0.5 rounded-lg transition ${
                    fpsConfig === 1 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  1 FPS (1s)
                </button>
                <button
                  onClick={() => setFpsConfig(2)}
                  className={`px-2 py-0.5 rounded-lg transition ${
                    fpsConfig === 2 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  2 FPS (0.5s)
                </button>
              </div>
            </div>
          </div>

          {/* BOTÕES PRINCIPAIS DE AÇÃO */}
          <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-900">
            
            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  onClick={() => {
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 shrink-0"
                  title="Sair do painel (A transmissão continuará ativa em segundo plano)"
                >
                  <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>SAIR</span>
                </button>
              )}

              <button
                onClick={toggleFacingMode}
                disabled={!cameraActive}
                className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl transition border border-slate-800 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                title="Alternar Câmera Frontal / Traseira"
              >
                <SwitchCamera className="w-4 h-4 text-slate-400" />
                <span className="hidden sm:inline">Alternar Câmera</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isTransmitting && isOnline ? (
                <button
                  onClick={handleStopLive}
                  className="px-4 sm:px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-rose-950/50 flex items-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>⏹ Encerrar Live</span>
                </button>
              ) : (
                <button
                  onClick={handleStartLive}
                  disabled={isConnecting || isReconnecting}
                  className="px-5 sm:px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-950/50 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>▶ Iniciar Live</span>
                </button>
              )}

              {onClose && (
                <button
                  onClick={() => {
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                  title="Sair do painel (A transmissão continuará ativa em segundo plano)"
                >
                  <X className="w-4 h-4 text-slate-400" />
                  <span>Sair</span>
                </button>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

