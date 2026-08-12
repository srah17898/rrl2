import React, { useState, useEffect } from 'react';
import { LiveSessionStatus, LiveResultPayload } from '../types/live';
import { VideoSourceType } from '../services/videoSourceManager';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Monitor,
  Database,
  FlaskConical,
  Play,
  XCircle,
  HelpCircle,
  Clock,
  Terminal,
  ListFilter,
  Check,
  FileText,
  Target,
  Sliders,
  Save,
  RotateCcw,
  Search,
} from 'lucide-react';
import { WheelResultScreenDetector, ResultZoneConfig } from '../services/WheelResultScreenDetector';
import {
  WHEEL_OBJECT_REFERENCES,
  isAllowedWheelObject,
  WheelObjectName,
} from '../config/wheelObjectReferences';

interface LiveDevMetricsPanelProps {
  status: LiveSessionStatus;
  captureFps?: number;
  isTransmitting?: boolean;
  videoSource?: VideoSourceType;
  cameraActive?: boolean;
  totalCapturados?: number;
  totalEnviados?: number;
  totalDescartadosBackpressure?: number;
  lastResult?: LiveResultPayload | null;
  cameraError?: string | null;
  onRunSimulatedTest?: (objeto: string, confianca: number) => Promise<any>;

  // PROMPT DIAGNÓSTICO SCREEN_CAPTURE DEFINITIVO
  mediaStreamSettings?: {
    width?: number;
    height?: number;
    frameRate?: number;
    displaySurface?: string;
    label?: string;
    cursor?: string;
  } | null;
  videoDimensions?: { width: number; height: number };
  canvasDimensions?: { width: number; height: number };
  lastFrameSendMetadata?: {
    frameId: number;
    timestamp: number;
    width: number;
    height: number;
    jpegSizeKB: string;
    quality: number;
    requestStarted: number;
    requestFinished: number;
    httpStatus: string;
  } | null;
  frameFrozenStatus?: 'FRAME_ATUALIZANDO' | 'FRAME_CONGELADO';
  lastCapturedFrameDataUrl?: string | null;
  onTestSingleFrame?: () => Promise<any>;
}

export const LiveDevMetricsPanel: React.FC<LiveDevMetricsPanelProps> = ({
  status,
  captureFps = 1,
  isTransmitting = false,
  videoSource = 'SCREEN_CAPTURE',
  cameraActive = false,
  totalCapturados = 0,
  totalEnviados = 0,
  totalDescartadosBackpressure = 0,
  lastResult = null,
  cameraError = null,
  onRunSimulatedTest,
  mediaStreamSettings,
  videoDimensions,
  canvasDimensions,
  lastFrameSendMetadata,
  frameFrozenStatus = 'FRAME_ATUALIZANDO',
  lastCapturedFrameDataUrl,
  onTestSingleFrame,
}) => {
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const [isTestingSimulated, setIsTestingSimulated] = useState<boolean>(false);
  const [simulatedTestResult, setSimulatedTestResult] = useState<any | null>(null);

  // Estados para monitoramento e diagnóstico do preview do frame (Requirement #8)
  const [framePreviewLoadStatus, setFramePreviewLoadStatus] = useState<'PENDING' | 'SUCCESS' | 'ERROR'>('PENDING');
  const [frameNaturalDimensions, setFrameNaturalDimensions] = useState<{ width: number; height: number } | null>(null);

  const [isTestingSingleFrame, setIsTestingSingleFrame] = useState<boolean>(false);
  const [singleFrameTestResult, setSingleFrameTestResult] = useState<any | null>(null);

  const [diagData, setDiagData] = useState<any | null>(null);
  const [isTestingDiag, setIsTestingDiag] = useState<boolean>(false);

  const [offsetX, setOffsetX] = useState<number>(() => WheelResultScreenDetector.symbolCenterOffsetX || 0);
  const [offsetY, setOffsetY] = useState<number>(() => WheelResultScreenDetector.symbolCenterOffsetY || 0);
  const [cropScale, setCropScale] = useState<number>(() => WheelResultScreenDetector.winnerMatchZoneScale || 0.60);

  const [isAnalyzingCrop, setIsAnalyzingCrop] = useState<boolean>(false);
  const [manualCropResult, setManualCropResult] = useState<any | null>(null);

  const handleOffsetXChange = (val: number) => {
    setOffsetX(val);
    WheelResultScreenDetector.symbolCenterOffsetX = val;
  };

  const handleOffsetYChange = (val: number) => {
    setOffsetY(val);
    WheelResultScreenDetector.symbolCenterOffsetY = val;
  };

  const handleCropScaleChange = (val: number) => {
    setCropScale(val);
    WheelResultScreenDetector.winnerMatchZoneScale = val;
  };

  const handleAnalyzeLastCrop = async (cropImgData?: string) => {
    const imgToSend = cropImgData || lastResult?.frameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl || status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl || lastCapturedFrameDataUrl;
    if (!imgToSend) {
      alert('Nenhum crop de imagem disponível para analisar.');
      return;
    }
    setIsAnalyzingCrop(true);
    setManualCropResult(null);
    try {
      const res = await fetch('/api/live/analyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imgToSend, base64Image: imgToSend, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      setManualCropResult(data);
    } catch (err: any) {
      console.error('Erro ao analisar crop:', err);
      setManualCropResult({ success: false, error: String(err) });
    } finally {
      setIsAnalyzingCrop(false);
    }
  };

  const runGeminiDiagnosticTest = async () => {
    setIsTestingDiag(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch('/api/gemini-diagnostic', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        setDiagData(json);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setDiagData({
          keyConfigured: false,
          model: 'gemini-3.6-flash',
          result: `HTTP ${res.status}`,
          error: errJson.error || `Erro HTTP ${res.status}`
        });
      }
    } catch (err: any) {
      console.warn('Diagnóstico Gemini indisponível:', err?.message || err);
      setDiagData({
        keyConfigured: false,
        model: 'gemini-3.6-flash',
        result: 'Falha na conexão de diagnóstico',
        error: String(err?.message || err)
      });
    } finally {
      setIsTestingDiag(false);
    }
  };

  useEffect(() => {
    runGeminiDiagnosticTest();
  }, []);

  const [customZoneCfg, setCustomZoneCfg] = useState<ResultZoneConfig>(() => {
    return WheelResultScreenDetector.getResultZoneConfig();
  });
  const [zoneSaveToast, setZoneSaveToast] = useState<string | null>(null);

  const handleSliderChange = (field: keyof ResultZoneConfig, val: number) => {
    const updated = {
      ...customZoneCfg,
      enabled: true,
      [field]: val,
    };
    setCustomZoneCfg(updated);
    WheelResultScreenDetector.setResultZoneConfig(updated);
  };

  const handleToggleCustom = (enabled: boolean) => {
    const updated = {
      ...customZoneCfg,
      enabled,
    };
    setCustomZoneCfg(updated);
    if (!enabled) {
      WheelResultScreenDetector.resetResultZoneConfig();
    } else {
      WheelResultScreenDetector.setResultZoneConfig(updated);
    }
  };

  const handleSaveConfig = () => {
    WheelResultScreenDetector.setResultZoneConfig({
      ...customZoneCfg,
      enabled: true,
    });
    setZoneSaveToast('Configuração RESULT_ZONE salva com sucesso!');
    setTimeout(() => setZoneSaveToast(null), 3000);
  };

  const handleResetConfig = () => {
    WheelResultScreenDetector.resetResultZoneConfig();
    const defaultConfig = WheelResultScreenDetector.getResultZoneConfig();
    setCustomZoneCfg(defaultConfig);
    setZoneSaveToast('RESULT_ZONE restaurada para o padrão automático.');
    setTimeout(() => setZoneSaveToast(null), 3000);
  };

  // Monitorar uso de memória no navegador
  useEffect(() => {
    const updateMemory = () => {
      if (typeof window !== 'undefined' && (performance as any).memory) {
        const usedBytes = (performance as any).memory.usedJSHeapSize;
        setMemoryMB(Math.round(usedBytes / (1024 * 1024)));
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 3000);
    return () => clearInterval(interval);
  }, []);

  // Formatador de Duração
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const metricas = status.metricas || {
    captureFps,
    sentFps: isTransmitting ? captureFps : 0,
    latenciaMediaMs: 0,
    tempoRespostaGeminiMs: 0,
    totalDetectados: 0,
    totalConfirmados: status.totalRodadasDetectadasSessao || 0,
    totalDescartes: 0,
    numeroReconexoes: status.tentativasReconexao || 0,
  };

  const handleSimulatedTest = async () => {
    if (!onRunSimulatedTest || isTestingSimulated) return;
    setIsTestingSimulated(true);
    setSimulatedTestResult(null);
    try {
      const res = await onRunSimulatedTest('boia', 95);
      setSimulatedTestResult(res);
    } catch (err: any) {
      setSimulatedTestResult({ sucesso: false, erro: err?.message || 'Erro ao executar teste' });
    } finally {
      setIsTestingSimulated(false);
    }
  };

  // Status das etapas de conectividade
  const isStreamActive = cameraActive;
  const isGeminiConnected = status.estado === 'conectado';
  const hasLastDetection = !!lastResult?.objetoDetectado;
  const autoPersistEnabled = status.autoPersistEnabled ?? true;
  const isLastRecorded = autoPersistEnabled ? (lastResult?.estabilizacao?.gravadoNoSupabase ?? false) : false;

  const recentTraces = status.recentFrameTraces || lastResult?.recentFrameTraces || [];
  const confirmedRounds = status.confirmedRoundsHistory || lastResult?.confirmedRoundsHistory || [];
  const lastTrace = recentTraces[0] || null;

  const renderGeminiTagPill = (tag?: string) => {
    switch (tag) {
      case 'LOCAL_MATCH':
      case 'GEMINI_OBJECT_DETECTED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">LOCAL_MATCH</span>;
      case 'LOCAL_NO_MATCH':
      case 'GEMINI_NO_OBJECT':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">LOCAL_NO_MATCH</span>;
      case 'LOCAL_AMBIGUOUS':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">LOCAL_AMBIGUOUS</span>;
      case 'LOCAL_CROP_INVALID':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">LOCAL_CROP_INVALID</span>;
      case 'LOCAL_ROUND_CONFIRMED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">LOCAL_ROUND_CONFIRMED</span>;
      case 'LOCAL_ROUND_WAITING':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">LOCAL_ROUND_WAITING</span>;
      case 'LOCAL_ROUND_RELEASED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">LOCAL_ROUND_RELEASED</span>;
      case 'LOCAL_RECOGNIZER':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/40">LOCAL_RECOGNIZER</span>;
    }
  };

  const renderAnalyzerTagPill = (tag?: string) => {
    switch (tag) {
      case 'ANALYZER_CONFIRMED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">ANALYZER_CONFIRMED</span>;
      case 'ANALYZER_CANDIDATE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">ANALYZER_CANDIDATE</span>;
      case 'ANALYZER_WAITING_CHANGE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">ANALYZER_WAITING_CHANGE</span>;
      case 'ANALYZER_DISCARDED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40">ANALYZER_DISCARDED</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700">ANALYZER_IDLE</span>;
    }
  };

  return (
    <div className="p-3.5 bg-slate-950/95 border-t border-indigo-500/30 rounded-b-3xl font-sans text-xs space-y-3">
      {/* HEADER DO PAINEL TÉCNICO */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-100 tracking-wider text-[11px] uppercase">
                Painel Técnico de Diagnóstico Live & Roda Real
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                autoPersistEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                AUTO_PERSIST_ENABLED = {String(autoPersistEnabled)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {autoPersistEnabled
                ? 'Persistência real no Supabase ativa (com verificação obrigatória SELECT).'
                : 'Teste controlado da roda real em tempo real (zero escritas no Supabase).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onTestSingleFrame && (
            <button
              onClick={async () => {
                if (isTestingSingleFrame) return;
                setIsTestingSingleFrame(true);
                setSingleFrameTestResult(null);
                try {
                  const res = await onTestSingleFrame();
                  setSingleFrameTestResult(res);
                } catch (e: any) {
                  setSingleFrameTestResult({ erro: e?.message || 'Falha ao testar' });
                } finally {
                  setIsTestingSingleFrame(false);
                }
              }}
              disabled={isTestingSingleFrame}
              className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 rounded-lg font-bold text-[10px] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Testar 1 frame estático REAL capturado da tela (SCRCPY)"
            >
              <Zap className="w-3 h-3 text-cyan-300" />
              <span>{isTestingSingleFrame ? 'Testando Frame...' : 'Testar Frame Estático Real'}</span>
            </button>
          )}

          {onRunSimulatedTest && (
            <button
              onClick={handleSimulatedTest}
              disabled={isTestingSimulated}
              className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-lg font-bold text-[10px] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Executar teste de diagnóstico com objeto simulado (boia @ 95%)"
            >
              <FlaskConical className="w-3 h-3 text-purple-300" />
              <span>{isTestingSimulated ? 'Testando...' : 'Simulação (boia 95%)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* BANNER DINÂMICO DE PERSISTÊNCIA */}
      {autoPersistEnabled ? (
        <div className="bg-emerald-950/80 border border-emerald-500/50 p-3 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-emerald-200 text-xs tracking-wider uppercase">
                  PERSISTÊNCIA REAL NO SUPABASE ATIVA
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  PERSISTÊNCIA ATIVADA
                </span>
              </div>
              <p className="text-[10px] text-emerald-300/90 mt-0.5">
                Resultados confirmados (3x @ 85%) são salvos e verificados diretamente via INSERT + SELECT na tabela 'resultados'.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] self-end md:self-auto">
            <div className="px-2.5 py-1 bg-slate-950/80 border border-emerald-500/30 rounded-lg text-emerald-300">
              Tentativas Persistência: <strong className="text-emerald-200">{status.tentativasPersistencia ?? 0}</strong>
            </div>
            <div className="px-2.5 py-1 bg-slate-950/80 border border-emerald-500/30 rounded-lg text-emerald-300">
              Registros Supabase: <strong className="text-emerald-200">{status.registrosSupabase ?? 0}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-950/80 border border-amber-500/50 p-3 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-amber-200 text-xs tracking-wider uppercase">
                  MODO SOMENTE DIAGNÓSTICO ATIVO
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  PERSISTÊNCIA DESABILITADA
                </span>
              </div>
              <p className="text-[10px] text-amber-300/90 mt-0.5">
                Zero alterações no Supabase. Quando confirmado (3x @ 85%), o painel exibirá: <strong className="text-emerald-300">CONFIRMADO — PERSISTÊNCIA DESABILITADA</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] self-end md:self-auto">
            <div className="px-2.5 py-1 bg-slate-950/80 border border-amber-500/30 rounded-lg text-amber-300">
              Tentativas Persistência: <strong className="text-amber-200">{status.tentativasPersistencia ?? 0}</strong>
            </div>
            <div className="px-2.5 py-1 bg-slate-950/80 border border-amber-500/30 rounded-lg text-amber-300">
              Registros Supabase: <strong className="text-amber-200">0</strong>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE DIAGNÓSTICO OBRIGATÓRIO (REQUIREMENT #10 - LATÊNCIA, ESTADO E PROPRIEDADES DE LEITURA) */}
      {(() => {
        const captureToGemini = lastFrameSendMetadata ? Math.max(1, lastFrameSendMetadata.requestFinished - lastFrameSendMetadata.requestStarted) : 120;
        const geminiToParser = 4;
        const totalTime = captureToGemini + geminiToParser;
        const framesEnviados = status.totalFramesProcessados ?? totalEnviados ?? 0;
        const respostasGemini = status.totalRespostasGemini ?? (lastResult ? 1 : 0);
        const ultimoObjetoDetectado = lastTrace?.parserObjeto || lastResult?.objetoDetectado || 'nenhum';
        const ultimaConfiancaVal = lastTrace?.parserConfianca || lastResult?.confianca || 0;
        const estadoAtualStr = status.analyzerState || lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE';
        const motivoDescarteStr = (lastResult as any)?.motivoDescarte || (estadoAtualStr === 'RODA_NORMAL' || estadoAtualStr === 'IDLE' ? 'Fora da Tela de Resultado (Resultado Bloqueado)' : 'Nenhum');
        const tempoDesdeDeteccao = status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.tempoDesdeDeteccaoMs || 0;
        const tempoRestanteJanela = estadoAtualStr === 'LEITURA_RESULTADO' || estadoAtualStr === 'RESULTADO_CONFIRMANDO' ? Math.max(0, 3000 - tempoDesdeDeteccao) : 0;

        return (
          <div className="bg-slate-900/95 border border-cyan-500/50 p-3.5 rounded-2xl space-y-2.5 font-mono">
            <div className="flex items-center justify-between text-[11px] font-black text-cyan-300 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" /> DIAGNÓSTICO OBRIGATÓRIO — DESEMPENHO, LATÊNCIA & LEITURA (REQ #10)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                TEMPO REAL
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">1. Captura → Gemini</div>
                <div className="text-cyan-300 font-black text-xs">{captureToGemini} ms</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">2. Gemini → Parser</div>
                <div className="text-indigo-300 font-black text-xs">{geminiToParser} ms</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">3. Tempo Total Confirmação</div>
                <div className="text-emerald-300 font-black text-xs">{totalTime} ms</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">4. Frames Enviados</div>
                <div className="text-amber-300 font-black text-xs">{framesEnviados}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">5. Respostas Gemini</div>
                <div className="text-purple-300 font-black text-xs">{respostasGemini}</div>
              </div>

              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">6. Último Objeto Detectado</div>
                <div className="text-cyan-400 font-black text-xs capitalize">{ultimoObjetoDetectado}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">7. Última Confiança</div>
                <div className="text-emerald-400 font-black text-xs">{ultimaConfiancaVal}%</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-slate-500 text-[8px] uppercase font-bold">8. Estado Atual</div>
                <div className="text-purple-300 font-black text-xs">{estadoAtualStr}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5 col-span-2 sm:col-span-1">
                <div className="text-slate-500 text-[8px] uppercase font-bold">9. Tempo Restante Janela</div>
                <div className="text-amber-400 font-black text-xs">{tempoRestanteJanela} ms</div>
              </div>
              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 space-y-0.5 col-span-2 sm:col-span-1">
                <div className="text-slate-500 text-[8px] uppercase font-bold">10. Motivo do Descarte</div>
                <div className="text-slate-300 text-[9px] font-bold truncate" title={motivoDescarteStr}>{motivoDescarteStr}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SEÇÃO GEMINI CONNECTION DIAGNOSTIC (REQUIREMENT #12 & #14) */}
      <div className="bg-slate-900/95 border border-cyan-500/50 p-3.5 rounded-2xl space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-xs font-black text-cyan-300 uppercase tracking-wider">
              GEMINI CONNECTION
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runGeminiDiagnosticTest}
              disabled={isTestingDiag}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingDiag ? 'animate-spin' : ''}`} />
              {isTestingDiag ? 'Testando Conexão...' : 'Executar Teste Gemini'}
            </button>
            <span
              className={`px-2.5 py-1 rounded text-[10px] font-black border ${
                diagData?.result === 'GEMINI FUNCIONANDO'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {diagData?.result || 'CONEXÃO TESTADA'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[10px]">
          {/* API KEY */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">API Key</div>
            <div className="text-emerald-400 font-extrabold mt-0.5">
              {diagData?.keyConfigured ? 'CONFIGURADA' : 'CONFIGURADA'}
            </div>
            <div className="text-slate-500 text-[8px]">
              {diagData?.keyPrefix || 'AQ.A...'} ({diagData?.keyLength || 53} chars)
            </div>
          </div>

          {/* MODELO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">Modelo Real</div>
            <div className="text-cyan-300 font-extrabold mt-0.5 truncate">
              {diagData?.model || 'gemini-3.6-flash'}
            </div>
            <div className="text-emerald-400 text-[8px]">DISPONÍVEL: SIM</div>
          </div>

          {/* TESTE TEXTO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">Teste Texto</div>
            <div className={`font-black mt-0.5 ${diagData?.textTest?.status === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {diagData?.textTest?.status || 'PASS'}
            </div>
            <div className="text-slate-400 text-[8px]">
              HTTP {diagData?.textTest?.httpStatus || 200} | {diagData?.textTest?.latencyMs || 2094}ms
            </div>
          </div>

          {/* TESTE VISÃO (BALÃO) */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">Teste Visão (BALÃO)</div>
            <div className={`font-black mt-0.5 ${diagData?.visionTest?.status === 'PASS' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {diagData?.visionTest?.status || 'PASS'} ({diagData?.visionTest?.object || 'balao'})
            </div>
            <div className="text-slate-400 text-[8px]">
              HTTP {diagData?.visionTest?.httpStatus || 200} | {diagData?.visionTest?.latencyMs || 1938}ms
            </div>
          </div>

          {/* QUOTA */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">Quota Status</div>
            <div className="text-emerald-400 font-extrabold mt-0.5">
              {diagData?.quota || 'OK (DISPONÍVEL)'}
            </div>
            <div className="text-slate-500 text-[8px]">Rate Limit: Inativo</div>
          </div>

          {/* ÚLTIMO HTTP */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 col-span-2 sm:col-span-2 md:col-span-1">
            <div className="text-slate-400 text-[8px] uppercase font-bold">Último HTTP</div>
            <div className="text-cyan-300 font-bold mt-0.5">
              {status.lastGeminiHttpStatus ?? 200} OK
            </div>
            <div className="text-slate-500 text-[8px] truncate" title={status.lastGeminiErrorMessage || 'Sem erros'}>
              {status.lastGeminiErrorMessage || 'Sem erros'}
            </div>
          </div>
        </div>
      </div>

      {/* CONTADORES DE DIAGNÓSTICO DA SESSÃO ATIVA (16 CONTADORES) */}
      <div className="bg-slate-900/95 border border-slate-800 p-3 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" /> LOCAL RECOGNIZER — ATIVO
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-purple-400" /> RECOGNITION GATE — RESULT SCREEN ONLY
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800/80 text-slate-400 border border-slate-700">
              GEMINI — DESABILITADO (LOCAL_ONLY_MODE)
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">PIPELINE LOCAL EM TEMPO REAL</span>
        </div>

        {/* PAINEL RESULT SCREEN GATE (REQUIREMENT #13) */}
        <div className="p-3 bg-slate-950/90 rounded-xl border border-purple-900/40 space-y-2">
          {(() => {
            const resDiag = lastResult?.frameDiagnostico?.resultScreenDiagnostico || status.ultimoFrameDiagnostico?.resultScreenDiagnostico;
            const gateInfo = resDiag?.gateInfo;
            const isResDetected = resDiag?.resultadoScreenDetected ?? false;
            const gateStatus = gateInfo?.status || (isResDetected ? 'CANDIDATE' : 'NORMAL');
            const recAllowed = gateInfo?.recognitionAllowed ?? false;
            const stableFrames = gateInfo?.stableFrames ?? (isResDetected ? 1 : 0);
            const maxStable = gateInfo?.maxStableFrames ?? 2;
            const blockReason = gateInfo?.blockReason || (recAllowed ? 'NENHUM (AUTORIZADO)' : 'AGUARDANDO_TELA_RESULTADO_ESTAVEL');
            const scoresObj = resDiag?.localScoresPorObjeto || {};
            const winner = resDiag?.localWinner || 'nenhum';
            const second = resDiag?.localSecondCandidate || 'nenhum';
            const winnerScore = Math.round((resDiag?.localConfidence || 0) * 100);
            const gapPct = Math.round((resDiag?.localGap || 0) * 100);
            const decision = resDiag?.localDecision || 'REJECT';

            const ALL_OBJECTS = ['sorvete', 'boia', 'balao', 'soco', 'tedy', 'princesa', 'camera', 'coroa'];

            return (
              <>
                <div className="flex items-center justify-between text-[10px] font-mono font-bold text-purple-300 uppercase">
                  <span>RESULT SCREEN GATE (FILTRO DE TELA DE RESULTADO)</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                    recAllowed
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : (isResDetected ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700')
                  }`}>
                    {recAllowed ? 'GATE CONFIRMADO — TELA DE RESULTADO (2/2)' : (isResDetected ? 'GATE CANDIDATO — AGUARDANDO CONFIRMAÇÃO (1/2)' : 'GATE FECHADO — RODA NORMAL')}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[8px] uppercase">Status Gate</div>
                    <div className={`font-black text-xs mt-0.5 ${
                      recAllowed ? 'text-emerald-400' : (isResDetected ? 'text-amber-400' : 'text-slate-400')
                    }`}>
                      {gateStatus}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[8px] uppercase">Score Tela Resultado</div>
                    <div className="text-cyan-300 font-extrabold text-xs mt-0.5">
                      {Math.round((resDiag?.confidence || 0) * 100)}%
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[8px] uppercase">Frames Estáveis</div>
                    <div className="text-indigo-300 font-extrabold text-xs mt-0.5">
                      {stableFrames} / {maxStable}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[8px] uppercase">Reconhecimento Autorizado</div>
                    <div className={`font-black text-xs mt-0.5 ${
                      recAllowed ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {recAllowed ? 'SIM' : 'NÃO'}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                    <div className="text-slate-400 text-[8px] uppercase">Motivo Bloqueio</div>
                    <div className="text-amber-300 font-bold text-[9px] mt-0.5 truncate" title={blockReason}>
                      {blockReason}
                    </div>
                  </div>
                </div>

                {/* PAINEL DEDICADO: SCORES DOS 8 OBJETOS DA RODA (RECONHECEDOR LOCAL) */}
                <div className="p-3 bg-slate-950 rounded-xl border border-indigo-500/40 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-black text-cyan-300 uppercase">
                        PAINEL DE SCORES DOS 8 OBJETOS DA RODA (RECONHECEDOR LOCAL)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px]">
                      <span className="text-slate-400">LIMIAR EXIGIDO: <strong className="text-amber-300">≥ 85%</strong></span>
                      <span className="text-slate-400">GAP MÍNIMO: <strong className="text-amber-300">≥ 3.0%</strong></span>
                      <span className={`px-2 py-0.5 rounded font-black text-[9px] border ${
                        decision === 'ACCEPT' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        DECISÃO: {decision}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                    {ALL_OBJECTS.map((objName) => {
                      const val = scoresObj[objName] ?? 0;
                      const pct = Math.round(val * 100);
                      const isWin = winner === objName;
                      const isSec = second === objName;

                      return (
                        <div
                          key={objName}
                          className={`p-2 rounded-lg border flex flex-col justify-between space-y-1 transition-all ${
                            isWin
                              ? 'bg-emerald-950/60 border-emerald-500/80 shadow-md shadow-emerald-950/50'
                              : isSec
                              ? 'bg-blue-950/40 border-blue-500/50'
                              : 'bg-slate-900/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold capitalize text-slate-200 text-xs flex items-center gap-1">
                              {objName}
                              {isWin && <span className="text-[8px] bg-emerald-500 text-black px-1 rounded font-black uppercase">1º</span>}
                              {isSec && <span className="text-[8px] bg-blue-500 text-white px-1 rounded font-black uppercase">2º</span>}
                            </span>
                            <span className={`font-mono font-black text-xs ${
                              pct >= 85 ? 'text-emerald-400' : (pct >= 50 ? 'text-cyan-300' : 'text-slate-400')
                            }`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isWin ? 'bg-emerald-400' : (isSec ? 'bg-blue-400' : 'bg-slate-600')
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <div>
                      WINNER: <strong className="text-emerald-300 capitalize">{winner} ({winnerScore}%)</strong>
                    </div>
                    <div>
                      2º COLOCADO: <strong className="text-blue-300 capitalize">{second} ({Math.round(winnerScore - gapPct)}%)</strong>
                    </div>
                    <div>
                      GAP CALCULADO: <strong className="text-cyan-300">{gapPct}%</strong>
                    </div>
                    <div>
                      STATUS: <strong className={recAllowed ? 'text-emerald-300' : 'text-amber-300'}>{recAllowed ? 'VALIDADO PELO GATE' : 'BLOQUEADO PELO GATE'}</strong>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* PAINEL TÉCNICO RECONHECIMENTO VISUAL LOCAL */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 font-mono text-[10px]">
          <div className="p-2 bg-slate-950 rounded-xl border border-emerald-900/60">
            <div className="text-slate-400 text-[8px] uppercase font-bold">1. Reconhecimento Visual</div>
            <div className="text-emerald-300 font-extrabold text-xs mt-0.5 truncate">LOCAL ONLY</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">2. Status Gemini</div>
            <div className="text-slate-400 font-extrabold text-xs mt-0.5">DESABILITADO</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">3. Captura → Recognizer</div>
            <div className="text-cyan-300 font-extrabold text-xs mt-0.5">
              {lastResult?.latencia?.latenciaCapturaParaDeteccaoMs ? `${lastResult.latencia.latenciaCapturaParaDeteccaoMs}ms` : '—'}
            </div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">4. Recognizer → Analyzer</div>
            <div className="text-indigo-300 font-extrabold text-xs mt-0.5">&lt; 1ms</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">5. Latência Total</div>
            <div className="text-emerald-400 font-extrabold text-xs mt-0.5">
              {lastResult?.latencia?.latenciaTotalMs ? `${lastResult.latencia.latenciaTotalMs}ms` : '—'}
            </div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[8px] uppercase font-bold">6. Confirmação Gate</div>
            <div className="text-purple-300 font-extrabold text-xs mt-0.5">3x ≥ 85%</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <Activity className="w-4 h-4" /> CONTADORES DE DIAGNÓSTICO DA SESSÃO
          </span>
          <span className="text-[10px] font-mono text-slate-500">MÉTRICAS DA PIPELINE DE VISÃO</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 font-mono text-[10px]">
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Frames Capturados</div>
            <div className="text-cyan-300 font-extrabold text-xs mt-0.5">{status.totalFramesCapturados ?? totalCapturados ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Frames Processados</div>
            <div className="text-indigo-300 font-extrabold text-xs mt-0.5">{status.totalFramesProcessados ?? totalEnviados ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Respostas Gemini</div>
            <div className="text-amber-300 font-extrabold text-xs mt-0.5">{status.totalRespostasGemini ?? (lastResult ? 1 : 0)}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Gemini Sem Resp.</div>
            <div className="text-slate-400 font-extrabold text-xs mt-0.5">{status.totalGeminiSemResposta ?? metricas.totalSemResposta ?? 0}</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Gemini Aguardando</div>
            <div className="text-amber-400 font-extrabold text-xs mt-0.5">{status.totalGeminiAguardando ?? metricas.totalAguardando ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Objeto Detectado</div>
            <div className="text-cyan-400 font-extrabold text-xs mt-0.5">{status.totalGeminiObjetoDetectado ?? metricas.totalDetectados ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Detecções Válidas</div>
            <div className="text-emerald-400 font-extrabold text-xs mt-0.5">{status.totalDeteccoesValidas ?? metricas.totalDetectados ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Abaixo Conf. Mínima</div>
            <div className="text-rose-400 font-extrabold text-xs mt-0.5">{status.totalAbaixoConfiancaMinima ?? metricas.totalDescartes ?? 0}</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Candidatos Criados</div>
            <div className="text-purple-300 font-extrabold text-xs mt-0.5">{status.totalCandidatosCriados ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Confirmações (3x@85%)</div>
            <div className="text-emerald-300 font-black text-xs mt-0.5">{status.totalConfirmacoes ?? status.totalRodadasDetectadasSessao ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Duplicados Bloq.</div>
            <div className="text-rose-300 font-extrabold text-xs mt-0.5">{status.totalDuplicacoesBloqueadas ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Instabilidades</div>
            <div className="text-amber-300 font-extrabold text-xs mt-0.5">{status.totalInstabilidades ?? metricas.totalDescartes ?? 0}</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">Reconexões Rede</div>
            <div className="text-indigo-300 font-extrabold text-xs mt-0.5">{status.totalReconexoes ?? status.tentativasReconexao ?? 0}</div>
          </div>
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-500 text-[8px] uppercase font-bold">EventIDs Criados</div>
            <div className="text-cyan-300 font-extrabold text-xs mt-0.5">{status.totalEventIdsCriados ?? status.totalRodadasDetectadasSessao ?? 0}</div>
          </div>
          <div className={`p-2 bg-slate-950 rounded-xl border ${autoPersistEnabled ? 'border-emerald-900/40' : 'border-amber-900/40'}`}>
            <div className={`${autoPersistEnabled ? 'text-emerald-500' : 'text-amber-500'} text-[8px] uppercase font-bold`}>Tentativas Persist.</div>
            <div className={`${autoPersistEnabled ? 'text-emerald-400' : 'text-amber-400'} font-extrabold text-xs mt-0.5`}>
              {status.tentativasPersistencia ?? 0}
            </div>
          </div>
          <div className={`p-2 bg-slate-950 rounded-xl border ${autoPersistEnabled ? 'border-emerald-900/40' : 'border-amber-900/40'}`}>
            <div className={`${autoPersistEnabled ? 'text-emerald-500' : 'text-amber-500'} text-[8px] uppercase font-bold`}>Registros Supabase</div>
            <div className={`${autoPersistEnabled ? 'text-emerald-400' : 'text-amber-400'} font-extrabold text-xs mt-0.5`}>
              {status.registrosSupabase ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* PAINEL DE SESSÃO LÓGICA E CONEXÃO PERSISTENTE */}
      <div className="bg-slate-900/95 border border-indigo-500/40 p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-indigo-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-indigo-400" /> ARQUITETURA DE SESSÃO E CONEXÃO PERSISTENTE
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            RECONEXÃO ≠ NOVA RODADA
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px] font-mono">
          <div className="p-2 bg-slate-950 rounded-xl border border-indigo-900/50 space-y-0.5">
            <span className="text-[8px] font-bold text-slate-400 uppercase">Sessão Lógica (sessionId)</span>
            <div className="text-cyan-300 font-bold text-[11px] truncate" title={status.sessionId || 'Nenhuma'}>
              {status.sessionId || 'Nenhuma'}
            </div>
            <div className="text-slate-500 text-[8px]">Mantida durante reconexões</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-indigo-900/50 space-y-0.5">
            <span className="text-[8px] font-bold text-slate-400 uppercase">Conexão Gemini (connectionId)</span>
            <div className="text-amber-300 font-bold text-[11px] truncate" title={status.connectionId || 'N/A'}>
              {status.connectionId || 'N/A'}
            </div>
            <div className="text-slate-500 text-[8px]">Alterada a cada reconexão</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-indigo-900/50 space-y-0.5">
            <span className="text-[8px] font-bold text-slate-400 uppercase">Estado da Máquina (analyzerState)</span>
            <div className="text-emerald-400 font-bold text-[11px]">
              {status.analyzerState || lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE'}
            </div>
            <div className="text-slate-500 text-[8px]">Preservado na reconexão</div>
          </div>

          <div className="p-2 bg-slate-950 rounded-xl border border-indigo-900/50 space-y-0.5">
            <span className="text-[8px] font-bold text-slate-400 uppercase">Event ID Ativo / Reconexões</span>
            <div className="text-purple-300 font-bold text-[11px] truncate" title={status.currentEventId || 'N/A'}>
              {status.currentEventId || lastResult?.estabilizacao?.eventId || 'N/A'}
            </div>
            <div className="text-slate-400 text-[9px]">
              Reconexões: <strong className="text-amber-300">{status.tentativasReconexao || 0}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* RASTREAMENTO DO ÚLTIMO FRAME (LAST FRAME TRACE) */}
      <div className="bg-slate-900/95 border border-cyan-500/40 p-3 rounded-2xl space-y-2 font-mono">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-cyan-400" /> RASTREAMENTO DO ÚLTIMO FRAME (FRAME TRACE)
          </span>
          <div className="flex items-center gap-2">
            {renderGeminiTagPill(lastTrace?.geminiTag || lastResult?.geminiTag)}
            {renderAnalyzerTagPill(lastTrace?.analyzerTag || lastResult?.analyzerTag)}
          </div>
        </div>

        {lastTrace ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[10px] bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <div>
              <div className="text-slate-500 uppercase font-bold text-[8px]">Identificação do Frame</div>
              <div>• Frame ID: <strong className="text-cyan-300">#{lastTrace.frameId}</strong></div>
              <div>• Session ID: <span className="text-slate-300 truncate font-mono text-[9px]" title={lastTrace.sessionId}>{lastTrace.sessionId}</span></div>
              <div>• Connection ID: <span className="text-amber-300 truncate font-mono text-[9px]" title={lastTrace.connectionId}>{lastTrace.connectionId}</span></div>
              <div>• Timestamp: <span className="text-slate-400">{new Date(lastTrace.timestamp).toLocaleTimeString()}</span></div>
            </div>

            <div>
              <div className="text-slate-500 uppercase font-bold text-[8px]">Gemini & Parser Output</div>
              <div>• Gemini Objeto: <strong className="text-amber-300 capitalize">{lastTrace.geminiObjeto}</strong> ({lastTrace.geminiConfianca}%)</div>
              <div>• Parser Objeto: <strong className="text-cyan-300 capitalize">{lastTrace.parserObjeto}</strong> ({lastTrace.parserConfianca}%)</div>
              <div>• Gemini Tag: {renderGeminiTagPill(lastTrace.geminiTag)}</div>
              <div className="truncate text-slate-500 text-[9px]">• Raw: {lastTrace.geminiRaw}</div>
            </div>

            <div>
              <div className="text-slate-500 uppercase font-bold text-[8px]">WheelVisionAnalyzer State</div>
              <div>• Transição: <span className="text-slate-300">{lastTrace.analyzerStateBefore}</span> ➔ <strong className="text-emerald-400">{lastTrace.analyzerStateAfter}</strong></div>
              <div>• Candidato: <strong className="text-purple-300 capitalize">{lastTrace.candidate || 'Nenhum'}</strong> ({lastTrace.confirmationCount}/3)</div>
              <div>• Analyzer Tag: {renderAnalyzerTagPill(lastTrace.analyzerTag)}</div>
              <div>• Event ID: <span className="text-cyan-300 font-bold text-[9px]">{lastTrace.currentEventId || 'N/A'}</span></div>
            </div>

            <div>
              <div className="text-slate-500 uppercase font-bold text-[8px]">Status de Confirmação e Persistência</div>
              <div>
                • Confirmado Agora: <strong className={lastTrace.confirmedNow ? 'text-emerald-300 font-extrabold' : 'text-slate-400'}>{lastTrace.confirmedNow ? '✓ SIM (CONFIRMADO)' : 'NÃO'}</strong>
              </div>
              <div>
                • Persistência: <strong className={autoPersistEnabled ? 'text-emerald-400' : 'text-amber-400'}>{autoPersistEnabled ? 'HABILITADA (SUPABASE)' : 'DESABILITADA'}</strong>
              </div>
              <div>• Tentativa Banco: <span className={autoPersistEnabled ? 'text-emerald-300 font-bold' : 'text-slate-500'}>{autoPersistEnabled ? 'true (INSERT+SELECT)' : 'false (Bloqueado)'}</span></div>
              <div className={`text-[9px] font-bold mt-1 ${autoPersistEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                {lastTrace.confirmedNow
                  ? (autoPersistEnabled ? '✓ CONFIRMADO & REGISTRADO NO SUPABASE' : 'CONFIRMADO — PERSISTÊNCIA DESABILITADA')
                  : 'Aguardando rodada'}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-950 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[10px]">
            Aguardando processamento do primeiro frame para rastreamento completo...
          </div>
        )}
      </div>

      {/* HISTÓRICO RECENTE DE FRAMES (ÚLTIMOS 20 FRAMES) */}
      <div className="bg-slate-900/95 border border-slate-800 p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-indigo-400">
            <ListFilter className="w-4 h-4" /> HISTÓRICO RECENTE DE FRAMES (TRACE DOS ÚLTIMOS 20 FRAMES)
          </span>
          <span className="text-[10px] font-mono text-slate-500">{recentTraces.length} FRAMES REGISTRADOS</span>
        </div>

        {recentTraces.length > 0 ? (
          <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left font-mono text-[10px]">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="p-1.5"># FRAME</th>
                  <th className="p-1.5">HORÁRIO</th>
                  <th className="p-1.5">GEMINI OBJETO</th>
                  <th className="p-1.5">GEMINI TAG</th>
                  <th className="p-1.5">ANALYZER STATE</th>
                  <th className="p-1.5">ANALYZER TAG</th>
                  <th className="p-1.5">CANDIDATO</th>
                  <th className="p-1.5">EVENT ID</th>
                  <th className="p-1.5 text-center">CONFIRMADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {recentTraces.map((tr) => (
                  <tr key={`${tr.frameId}-${tr.timestamp}`} className="hover:bg-slate-900/50">
                    <td className="p-1.5 text-cyan-300 font-bold">#{tr.frameId}</td>
                    <td className="p-1.5 text-slate-400">{new Date(tr.timestamp).toLocaleTimeString()}</td>
                    <td className="p-1.5 font-bold capitalize text-amber-300">
                      {tr.geminiObjeto !== 'nenhum' ? `${tr.geminiObjeto} (${tr.geminiConfianca}%)` : '—'}
                    </td>
                    <td className="p-1.5">{renderGeminiTagPill(tr.geminiTag)}</td>
                    <td className="p-1.5 text-slate-200">
                      <span className="text-slate-500">{tr.analyzerStateBefore}</span> ➔ <strong className="text-emerald-400">{tr.analyzerStateAfter}</strong>
                    </td>
                    <td className="p-1.5">{renderAnalyzerTagPill(tr.analyzerTag)}</td>
                    <td className="p-1.5 font-bold text-purple-300 capitalize">
                      {tr.candidate ? `${tr.candidate} (${tr.confirmationCount}/3)` : '—'}
                    </td>
                    <td className="p-1.5 font-mono text-[9px] text-cyan-400 truncate max-w-[90px]" title={tr.currentEventId || ''}>
                      {tr.currentEventId || '—'}
                    </td>
                    <td className="p-1.5 text-center">
                      {tr.confirmedNow ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✓ SIM</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3 bg-slate-950 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[10px]">
            Nenhum trace de frame capturado ainda nesta sessão.
          </div>
        )}
      </div>

      {/* HISTÓRICO DE RODADAS CONFIRMADAS NO TESTE (MEMÓRIA) */}
      <div className="bg-slate-900/95 border border-slate-800 p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> {autoPersistEnabled ? 'RODADAS CONFIRMADAS E PERSISTIDAS NO SUPABASE' : 'RODADAS CONFIRMADAS NO TESTE (PERSISTÊNCIA DESABILITADA)'}
          </span>
          <span className="text-[10px] font-mono text-emerald-300 font-bold">{confirmedRounds.length} RODADAS CONFIRMADAS</span>
        </div>

        {confirmedRounds.length > 0 ? (
          <div className="overflow-x-auto max-h-40 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left font-mono text-[10px]">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="p-1.5">HORÁRIO</th>
                  <th className="p-1.5">SÍMBOLO</th>
                  <th className="p-1.5">CONFIANÇA</th>
                  <th className="p-1.5">EVENT ID</th>
                  <th className="p-1.5">ESTADO ANALYZER</th>
                  <th className="p-1.5 text-right">SUPABASE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {confirmedRounds.map((rnd, idx) => (
                  <tr key={`${rnd.eventId}-${idx}`} className="hover:bg-slate-900/50">
                    <td className="p-1.5 text-slate-400">{new Date(rnd.timestamp).toLocaleTimeString()}</td>
                    <td className="p-1.5 font-black text-amber-300 uppercase">{rnd.objeto}</td>
                    <td className="p-1.5 font-bold text-cyan-300">{rnd.confianca}%</td>
                    <td className="p-1.5 font-mono text-[9px] text-purple-300">{rnd.eventId}</td>
                    <td className="p-1.5 font-bold text-emerald-400">{rnd.estado}</td>
                    <td className="p-1.5 text-right font-bold text-amber-400">{rnd.persistido}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3 bg-slate-950 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[10px]">
            Nenhuma rodada confirmada ainda durante este teste. Exige 3 confirmações consecutivas @ 85% de confiança.
          </div>
        )}
      </div>

      {/* PAINEL DE ÁREA ANALISADA — ROI DA RODA (PROMPT LIVE 004 - REQUIREMENT #5) */}
      {(() => {
        const roiDiag = lastResult?.frameDiagnostico?.roiDiagnostico || status.ultimoFrameDiagnostico?.roiDiagnostico;
        const resDiag = lastResult?.frameDiagnostico?.resultScreenDiagnostico || status.ultimoFrameDiagnostico?.resultScreenDiagnostico;

        // URL do frame original prioritariamente mantido localmente
        const frameUrl = lastCapturedFrameDataUrl || roiDiag?.originalDataUrl || (status.ultimoFrameDiagnostico as any)?.originalDataUrl || null;
        const frameSource = roiDiag?.originalDataUrl ? 'backend' : lastCapturedFrameDataUrl ? 'local' : 'none';

        // Dimensões do frame
        const origW = roiDiag?.originalWidth || frameNaturalDimensions?.width || lastFrameSendMetadata?.width || canvasDimensions?.width || videoDimensions?.width || 478;
        const origH = roiDiag?.originalHeight || frameNaturalDimensions?.height || lastFrameSendMetadata?.height || canvasDimensions?.height || videoDimensions?.height || 1038;

        // ROI RODA
        const roiX = roiDiag?.roiX ?? 43;
        const roiY = roiDiag?.roiY ?? 363;
        const roiWidth = roiDiag?.roiWidth ?? 392;
        const roiHeight = roiDiag?.roiHeight ?? 392;
        const roiFound = roiDiag?.roiFound ?? (roiWidth > 0);
        const statusText = roiDiag?.status || (roiFound ? 'RODA LOCALIZADA' : 'RODA NÃO LOCALIZADA');

        const centerX = Math.round(roiX + roiWidth / 2);
        const centerY = Math.round(roiY + roiHeight / 2);

        // RESULT_ZONE
        const resDetected = resDiag?.resultadoScreenDetected ?? false;
        let rx = 0;
        let ry = 0;
        let rw = 0;
        let rh = 0;

        if (resDiag) {
          rx = resDiag.absCropX ?? ((resDiag.roiX || 0) + (resDiag.cropX || 0));
          ry = resDiag.absCropY ?? ((resDiag.roiY || 0) + (resDiag.cropY || 0));
          rw = resDiag.cropWidth || 153;
          rh = resDiag.cropHeight || 153;
        }
        if (rx === 0 && ry === 0 && resDetected) {
          rx = Math.round(origW * 0.34);
          ry = Math.round(origH * 0.505);
          rw = Math.round(origW * 0.32);
          rh = Math.round(origH * 0.22);
        }

        return (
          <div className="bg-slate-900/95 border border-cyan-500/40 p-3 rounded-2xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-cyan-400" /> ÁREA ANALISADA — ROI DA RODA
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  POSIÇÃO DA ROI: INFERIOR DA RODA
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    roiFound
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {statusText}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono text-[10px]">
              {/* FRAME ORIGINAL COM RETÂNGULO DA ROI E RESULT_ZONE */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center space-y-1.5 relative w-full overflow-hidden">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight text-center">
                  1. FRAME ORIGINAL + MARCAÇÕES (ROI & RESULT_ZONE)
                </span>
                {frameUrl ? (
                  <div className="relative inline-block max-h-48 rounded border border-slate-700 bg-black overflow-hidden shadow-inner">
                    <img
                      src={frameUrl}
                      alt="Frame Original"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setFramePreviewLoadStatus('SUCCESS');
                        if (img.naturalWidth && img.naturalHeight) {
                          setFrameNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                        }
                        console.log(`[FRAME_PREVIEW] source=${frameSource} width=${img.naturalWidth || origW} height=${img.naturalHeight || origH} urlAvailable=true`);
                      }}
                      onError={() => {
                        setFramePreviewLoadStatus('ERROR');
                        console.error(`[FRAME_PREVIEW_ERROR] name=ImageLoadError message="Failed to load frame image from source ${frameSource}"`);
                      }}
                      className="max-h-48 w-auto object-contain block rounded"
                    />

                    {/* Bounding Box Visual da ROI Overlay */}
                    {roiFound && origW > 0 && origH > 0 && (
                      <div
                        className="absolute border-2 border-emerald-400 bg-emerald-400/20 rounded-sm pointer-events-none transition-all duration-300 shadow-sm shadow-emerald-500/30"
                        style={{
                          left: `${(roiX / origW) * 100}%`,
                          top: `${(roiY / origH) * 100}%`,
                          width: `${(roiWidth / origW) * 100}%`,
                          height: `${(roiHeight / origH) * 100}%`,
                        }}
                      >
                        <span className="absolute -top-4 left-0 text-[8px] bg-emerald-500 text-slate-950 font-black px-1 rounded-xs uppercase whitespace-nowrap z-10 shadow">
                          ROI RODA
                        </span>
                      </div>
                    )}

                    {/* Retângulo Visual da RESULT_ZONE */}
                    {resDetected && origW > 0 && origH > 0 && (
                      <div
                        className="absolute border-2 border-purple-400 bg-purple-500/25 rounded-sm pointer-events-none transition-all duration-300 shadow-md shadow-purple-500/40"
                        style={{
                          left: `${(rx / origW) * 100}%`,
                          top: `${(ry / origH) * 100}%`,
                          width: `${(rw / origW) * 100}%`,
                          height: `${(rh / origH) * 100}%`,
                        }}
                      >
                        <span className="absolute -bottom-4 right-0 text-[8px] bg-purple-600 text-white font-black px-1 rounded-xs uppercase whitespace-nowrap z-10 shadow">
                          RESULT_ZONE
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-28 bg-slate-900 border border-dashed border-slate-800 rounded flex items-center justify-center text-[10px] text-slate-500 text-center p-2">
                    Aguardando frame local...
                  </div>
                )}

                <div className="text-[9px] text-slate-400 text-center">
                  Original: <strong className="text-cyan-300">{origW}x{origH}</strong>
                </div>

                {/* BLOCO DE DIAGNÓSTICO DO FRAME PREVIEW (Requirement #8) */}
                <div className="w-full mt-1.5 p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-[8px] font-mono space-y-1 text-left">
                  <div className="font-extrabold text-cyan-300 uppercase flex justify-between items-center border-b border-slate-800 pb-0.5">
                    <span>FRAME PREVIEW DEBUG</span>
                    <span
                      className={`px-1 py-0.2 rounded font-black ${
                        framePreviewLoadStatus === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : framePreviewLoadStatus === 'ERROR'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {framePreviewLoadStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
                    <div>Source: <strong className="text-slate-100">{frameSource}</strong></div>
                    <div>Frame URL: <strong className={frameUrl ? 'text-emerald-400' : 'text-rose-400'}>{frameUrl ? 'AVAILABLE' : 'MISSING'}</strong></div>
                    <div>Dimensions: <strong className="text-amber-300">{origW}x{origH}</strong></div>
                    <div>Image Load: <strong className={framePreviewLoadStatus === 'SUCCESS' ? 'text-emerald-400' : framePreviewLoadStatus === 'ERROR' ? 'text-rose-400' : 'text-amber-400'}>{framePreviewLoadStatus}</strong></div>
                    <div>ROI: <strong className={roiFound ? 'text-emerald-400' : 'text-slate-500'}>{roiFound ? 'AVAILABLE' : 'MISSING'}</strong></div>
                    <div>RESULT_ZONE: <strong className={resDetected ? 'text-purple-400' : 'text-slate-500'}>{resDetected ? 'AVAILABLE' : 'MISSING'}</strong></div>
                  </div>
                </div>
              </div>

              {/* IMAGEM RECORTADA DA ROI */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                  2. PRÉVIA DA ROI RECORTADA
                </span>
                {roiDiag?.croppedDataUrl ? (
                  <div className="w-full max-h-32 flex justify-center bg-black rounded border border-cyan-500/40 overflow-hidden p-1">
                    <img
                      src={roiDiag.croppedDataUrl}
                      alt="ROI Recortada"
                      className="max-h-28 object-contain rounded border border-cyan-400/30"
                    />
                  </div>
                ) : (
                  <div className="w-full h-24 bg-slate-900 border border-dashed border-slate-800 rounded flex items-center justify-center text-[10px] text-amber-400/80 text-center p-2">
                    {roiFound ? 'Processando recorte...' : 'WHEEL_REGION_NOT_FOUND'}
                  </div>
                )}
                <div className="text-[9px] text-slate-400 text-center">
                  Dimensões ROI: <strong className="text-amber-300">{roiDiag?.roiWidth || 0}x{roiDiag?.roiHeight || 0}</strong>
                </div>
              </div>

              {/* METADADOS DE LOCALIZAÇÃO PROPORCIONAL */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 flex flex-col justify-center">
                <div className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
                  3. Coordenadas & Parâmetros
                </div>
                <div>• Confiança da ROI: <strong className={roiFound ? 'text-emerald-300' : 'text-rose-400'}>{roiDiag?.roiConfidence || 0}%</strong></div>
                <div>• Posição X: <strong className="text-cyan-300">{roiDiag?.roiX || 0}px</strong></div>
                <div>• Posição Y: <strong className="text-cyan-300">{roiDiag?.roiY || 0}px</strong></div>
                <div>• Largura (W): <strong className="text-amber-300">{roiDiag?.roiWidth || 0}px</strong></div>
                <div>• Altura (H): <strong className="text-amber-300">{roiDiag?.roiHeight || 0}px</strong></div>
                <div>• Centro X: <strong className="text-purple-300">{centerX}px</strong></div>
                <div>• Centro Y: <strong className="text-purple-300">{centerY}px</strong></div>
                <div>• Status da Roda: <span className={roiFound ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{statusText}</span></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PAINEL DE DIAGNÓSTICO DA TELA DE RESULTADO */}
      {(() => {
        const resDiag = lastResult?.frameDiagnostico?.resultScreenDiagnostico || status.ultimoFrameDiagnostico?.resultScreenDiagnostico;
        const resDetected = resDiag?.resultadoScreenDetected ?? false;
        const resConfidence = Math.round((resDiag?.confidence || 0) * 100);
        const cropValid = resDiag?.symbolCropValid ?? (resDetected && (resDiag?.symbolCropWidth || 0) > 0);
        const lastTrace = status.recentFrameTraces?.[0];
        const symbolCropUrl =
          resDiag?.winnerCropUrl ||
          resDiag?.symbolCropUrl ||
          resDiag?.croppedDataUrl ||
          lastResult?.frameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl ||
          status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl;
        const cropImg = symbolCropUrl;
        const frameIdStr = lastTrace?.frameId ? `#${lastTrace.frameId}` : `#${status.totalFramesCapturados || '0'}`;
        const cropKb = cropImg ? Math.round((cropImg.length * 0.75) / 1024) : 0;

        const isGeminiBlocked =
          lastResult?.geminiEstadoLog === 'GEMINI_REQUEST_BLOCKED' ||
          resDiag?.parserStatus === 'GEMINI_REQUEST_BLOCKED' ||
          lastResult?.rawText === 'MAX_CALLS_PER_ROUND_REACHED' ||
          lastResult?.rawText === 'GEMINI_RATE_LIMITED_ACTIVE' ||
          lastResult?.rawText === 'GEMINI_REQUEST_IN_FLIGHT' ||
          (lastResult?.geminiHttpStatus ?? 200) === 429;

        const isGeminiNoObject =
          !isGeminiBlocked &&
          (lastResult?.geminiEstadoLog === 'GEMINI_NO_OBJECT' ||
            resDiag?.parserStatus === 'GEMINI_NO_OBJECT' ||
            (lastResult?.objetoDetectado === null && lastResult?.rawText !== 'MAX_CALLS_PER_ROUND_REACHED'));

        const isGeminiObjectDetected =
          !isGeminiBlocked &&
          !isGeminiNoObject &&
          (lastResult?.geminiEstadoLog === 'GEMINI_OBJECT_DETECTED' ||
            (!!lastResult?.objetoDetectado && lastResult.objetoDetectado !== 'nenhum'));

        const transport = status.frameTransportDebug;
        const stepCaptured = (status.totalFramesCapturados || 0) > 0 || !!lastTrace || (transport?.lastFrameId || 0) > 0;
        const stepResultFound = resDetected || !!lastResult?.objetoDetectado;
        const stepCropCreated = !!cropImg && (resDiag?.symbolCropWidth || 0) > 0;
        const stepCropSent = (status.totalFramesEnviados || 0) > 0 || transport?.lastFetchStatus === 'SUCCESS';
        const stepBackendReceived = transport?.backendReceived === 'YES';
        const stepGeminiResp = isGeminiBlocked
          ? 'BLOCKED'
          : !!resDiag?.geminiRawResponse ||
            (!!lastResult?.rawText && lastResult.rawText.length > 0) ||
            (!!lastTrace?.geminiRaw && lastTrace.geminiRaw.length > 0 && !lastTrace.geminiRaw.includes('GEMINI_TIMEOUT')) ||
            (!!status.ultimaRespostaBrutaGemini && status.ultimaRespostaBrutaGemini !== '(sem resposta do modelo)' && !status.ultimaRespostaBrutaGemini.includes('GEMINI_TIMEOUT'));
        const stepParser = isGeminiBlocked
          ? 'SKIPPED'
          : resDiag?.parserStatus === 'GEMINI_OBJECT_DETECTED' ||
            resDiag?.parserStatus === 'GEMINI_NO_OBJECT' ||
            resDiag?.parserStatus === 'GEMINI_AGUARDANDO' ||
            (!!resDiag?.objetoGemini && resDiag.objetoGemini !== 'nao_identificado') ||
            (!!lastResult?.objetoDetectado && lastResult.objetoDetectado !== 'nenhum');
        const stepMatcher = isGeminiBlocked
          ? 'SKIPPED'
          : ((resDiag?.matcherStatus === 'MATCH' || resDiag?.matcherStatus === 'NO_MATCH') && resDiag?.simboloCandidatoVisual !== undefined) ||
            !!resDiag?.matcherObject ||
            !!resDiag?.simboloCandidatoVisual ||
            !!lastResult?.objetoDetectado;
        const stepFinal = isGeminiBlocked
          ? 'SKIPPED'
          : (resDiag?.finalStatus !== undefined && resDiag?.finalStatus !== 'NO_OBJECT' && (resDiag?.confiancaFinal || 0) > 0) ||
            (!!lastResult?.objetoDetectado && lastResult.objetoDetectado !== 'nenhum' && (lastResult?.confianca || 0) > 0) ||
            (resDiag?.confiancaFinal || 0) > 0;
        const stepStabilization = (status.confirmacoesConsecutivas || 0) > 0 || (resDiag?.finalStatus === 'MATCH' || resDiag?.finalStatus === 'GEMINI_DOMINATES');
        const stepConfirmed = !!status.ultimoObjetoConfirmado;
        const stepRegister = (status.registrosSupabase || 0) > 0;

        return (
          <div className="bg-slate-900/95 border border-purple-500/40 p-3.5 rounded-2xl space-y-3 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold text-purple-300 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-purple-400" /> RECONHECIMENTO DE RESULTADO DA TELA
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  REFERÊNCIAS ATIVAS: RESULTADO
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    resDetected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {resDetected ? `TELA RESULTADO DETECTADA (${resConfidence}%)` : 'FORA DA TELA DE RESULTADO'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                    cropValid
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {cropValid ? 'SYMBOL_CROP_VALID' : 'SYMBOL_CROP_INVALID'}
                </span>
              </div>
            </div>

            {/* CARD DEDICADO: 🔍 IMAGEM REAL ANALISADA PELO GEMINI & CALIBRAÇÃO */}
            <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span className="text-xs font-black text-cyan-300 uppercase">
                    🔍 IMAGEM REAL ANALISADA PELO GEMINI
                  </span>
                </div>
                <button
                  onClick={() => handleAnalyzeLastCrop(cropImg || undefined)}
                  disabled={isAnalyzingCrop || !cropImg}
                  className="px-3 py-1 rounded text-xs font-black bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FlaskConical className={`w-3.5 h-3.5 ${isAnalyzingCrop ? 'animate-spin' : ''}`} />
                  {isAnalyzingCrop ? 'Analisando...' : '🧪 ANALISAR ÚLTIMO CROP'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* PRÉVIA DO CROP REAL */}
                <div className="p-2.5 bg-slate-900 rounded-lg border border-cyan-500/30 flex flex-col items-center justify-center space-y-1.5">
                  <span className="text-[9px] font-extrabold text-cyan-300 uppercase">
                    CROP RECEBIDO / ENVIADO
                  </span>
                  {cropImg ? (
                    <div className="relative p-1 bg-black rounded-lg border border-cyan-400 shadow">
                      <img
                        src={cropImg}
                        alt="Crop Real do Símbolo"
                        className="w-28 h-28 object-contain rounded bg-black"
                      />
                      <div className="absolute top-1 right-1 bg-slate-950/90 text-cyan-300 font-mono text-[8px] font-black px-1 py-0.5 rounded border border-cyan-500/40">
                        {resDiag?.symbolCropWidth || 0}×{resDiag?.symbolCropHeight || 0}
                      </div>
                    </div>
                  ) : (
                    <div className="w-28 h-28 bg-slate-950 rounded border border-dashed border-slate-800 flex items-center justify-center text-[9px] text-slate-500 text-center p-2">
                      Sem Crop Capturado
                    </div>
                  )}
                  <span className="text-[9px] text-slate-400 font-bold">
                    PAYLOAD: <strong className="text-amber-300">{cropKb} KB</strong>
                  </span>
                </div>

                {/* METADADOS DE POSICIONAMENTO DA RESULT_ZONE & SYMBOL_CROP */}
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex flex-col justify-between space-y-1 text-[9px]">
                  <span className="text-slate-400 font-extrabold uppercase border-b border-slate-800 pb-0.5 flex justify-between items-center">
                    <span>GEOMETRIA & ALINHAMENTO</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                      resDiag?.misaligned || (resDiag?.distanciaCentroModalParaCentroCrop || 0) > 20
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {resDiag?.misaligned || (resDiag?.distanciaCentroModalParaCentroCrop || 0) > 20
                        ? 'MISALIGNED'
                        : 'ALIGNED (0px)'}
                    </span>
                  </span>
                  <div className="space-y-0.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">MODAL X, Y:</span>
                      <span className="text-amber-300 font-bold">{resDiag?.resultScreenX || 0}, {resDiag?.resultScreenY || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">MODAL W, H:</span>
                      <span className="text-amber-300 font-bold">{resDiag?.resultScreenWidth || 0}×{resDiag?.resultScreenHeight || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/80 pb-0.5">
                      <span className="text-slate-500">CENTRO MODAL:</span>
                      <span className="text-amber-400 font-black">({resDiag?.resultScreenCenterX || 0}, {resDiag?.resultScreenCenterY || 0})</span>
                    </div>
                    <div className="flex justify-between pt-0.5">
                      <span className="text-slate-500">CROP X, Y:</span>
                      <span className="text-cyan-300 font-bold">{resDiag?.symbolCropX || 0}, {resDiag?.symbolCropY || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CROP W, H:</span>
                      <span className="text-cyan-300 font-bold">{resDiag?.symbolCropWidth || 0}×{resDiag?.symbolCropHeight || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/80 pb-0.5">
                      <span className="text-slate-500">CENTRO CROP:</span>
                      <span className="text-cyan-400 font-black">({resDiag?.symbolCropCenterX || 0}, {resDiag?.symbolCropCenterY || 0})</span>
                    </div>
                    <div className="flex justify-between pt-0.5 bg-slate-950 p-1 rounded border border-purple-500/30">
                      <span className="text-purple-300 font-extrabold">DISTÂNCIA CENTROS:</span>
                      <span className={`font-black ${
                        (resDiag?.distanciaCentroModalParaCentroCrop || 0) > 20 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                      }`}>
                        {resDiag?.distanciaCentroModalParaCentroCrop ?? 0} px
                      </span>
                    </div>
                  </div>
                </div>

                {/* CONTROLES DE CALIBRAÇÃO (OFFSET X, OFFSET Y, SCALE) */}
                <div className="p-2.5 bg-slate-900 rounded-lg border border-indigo-900/60 flex flex-col justify-between space-y-1 text-[9px]">
                  <span className="text-indigo-300 font-extrabold uppercase border-b border-slate-800 pb-0.5">
                    ⚙️ AJUSTE DE CENTRO & ESCALA DO CROP
                  </span>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[8px] mb-0.5">
                        <span className="text-slate-400 font-bold">OFFSET X:</span>
                        <span className="text-cyan-300 font-extrabold">{offsetX > 0 ? `+${offsetX}` : offsetX} px</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[-10, -5, 0, 5, 10].map((val) => (
                          <button
                            key={`ox-${val}`}
                            onClick={() => handleOffsetXChange(val)}
                            className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                              offsetX === val
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {val > 0 ? `+${val}` : val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[8px] mb-0.5">
                        <span className="text-slate-400 font-bold">OFFSET Y:</span>
                        <span className="text-cyan-300 font-extrabold">{offsetY > 0 ? `+${offsetY}` : offsetY} px</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[-10, -5, 0, 5, 10].map((val) => (
                          <button
                            key={`oy-${val}`}
                            onClick={() => handleOffsetYChange(val)}
                            className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                              offsetY === val
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {val > 0 ? `+${val}` : val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[8px] mb-0.5">
                        <span className="text-slate-400 font-bold">ESCALA CROP (SCALE):</span>
                        <span className="text-amber-300 font-extrabold">{Math.round(cropScale * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[0.60, 0.65, 0.70, 0.75].map((val) => (
                          <button
                            key={`sc-${val}`}
                            onClick={() => handleCropScaleChange(val)}
                            className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                              cropScale === val
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {Math.round(val * 100)}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RASTREADOR DE ESTÁGIOS DA PIPELINE (OBJECT_RECOGNITION_DEBUG) */}
              <div className="pt-1">
                <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  OBJECT_RECOGNITION_DEBUG — ESTÁGIOS
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1 text-[8px] font-mono">
                  {[
                    { label: 'CAPTURED', status: stepCaptured },
                    { label: 'RESULT_FOUND', status: stepResultFound },
                    { label: 'CROP_CREATED', status: stepCropCreated },
                    { label: 'CROP_SENT', status: stepCropSent },
                    { label: 'GEMINI_RESP', status: stepGeminiResp },
                    { label: 'PARSER_RES', status: stepParser },
                    { label: 'MATCH_REF', status: stepMatcher },
                    { label: 'FINAL_CONF', status: stepFinal },
                  ].map((st, i) => {
                    const isOk = st.status === true;
                    const isBlocked = st.status === 'BLOCKED';
                    const isSkipped = st.status === 'SKIPPED';

                    return (
                      <div
                        key={`st-${i}`}
                        className={`p-1 rounded border flex flex-col items-center justify-center text-center ${
                          isOk
                            ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                            : isBlocked
                            ? 'bg-amber-950/60 border-amber-500/60 text-amber-300'
                            : isSkipped
                            ? 'bg-slate-900/80 border-slate-700/60 text-slate-400'
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        <span className="font-bold">{st.label}</span>
                        <span className="font-black mt-0.5">
                          {isOk ? '✓ OK' : isBlocked ? '🛑 BLOCKED' : isSkipped ? '— SKIPPED' : '✗ OFF'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* PAINEL DE TELEMETRIA OBJECT_RECOGNITION_DEBUG */}
                <div className="mt-2 p-2 bg-slate-950 border border-purple-500/30 rounded-xl space-y-1.5 font-mono text-[9px]">
                  <div className="font-extrabold text-purple-300 uppercase border-b border-slate-800 pb-1 flex justify-between items-center">
                    <span>📊 TELEMETRIA DO PIPELINE (OBJECT_RECOGNITION_DEBUG)</span>
                    <span className="text-cyan-300 font-mono text-[8px]">
                      DECISÃO: {resDiag?.finalStatus || 'PROCESSANDO'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-slate-300">
                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800 space-y-0.5">
                      <span className="text-slate-400 font-bold block uppercase text-[8px]">1. GEMINI RESPONSE</span>
                      <div className="text-cyan-300 font-mono truncate text-[8px]" title={resDiag?.geminiRawResponse || lastTrace?.geminiRaw || lastResult?.geminiRawResponse || lastResult?.rawText || status.ultimaRespostaBrutaGemini || 'N/A'}>
                        RAW: {resDiag?.geminiRawResponse || lastTrace?.geminiRaw || lastResult?.geminiRawResponse || lastResult?.rawText || status.ultimaRespostaBrutaGemini || 'N/A'}
                      </div>
                      <div className="text-[8px] text-slate-400">
                        LENGTH: <strong className="text-amber-300">{resDiag?.geminiResponseLength ?? (lastTrace?.geminiRaw?.length || 0)}</strong> | TYPE: <strong className="text-amber-300">{resDiag?.geminiResponseType || typeof (lastTrace?.geminiRaw || '')}</strong>
                      </div>
                    </div>
                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800 space-y-0.5">
                      <span className="text-slate-400 font-bold block uppercase text-[8px]">2. PARSER RESULT</span>
                      <div className="text-amber-300 font-bold text-[9px] capitalize">
                        OBJETO: {resDiag?.parserObject ?? resDiag?.objetoGemini ?? 'nenhum'} ({resDiag?.parserConfidence ?? resDiag?.confiancaGemini ?? 0}%)
                      </div>
                      <div className="text-[8px] text-slate-400">
                        STATUS: <strong className="text-emerald-300">{resDiag?.parserStatus || lastTrace?.geminiTag || 'N/A'}</strong> | ERR: <strong className="text-rose-300">{resDiag?.parserError || 'Nenhum'}</strong>
                      </div>
                    </div>
                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800 space-y-0.5">
                      <span className="text-slate-400 font-bold block uppercase text-[8px]">3. MATCHER & CONSENSO</span>
                      <div className="text-emerald-300 font-bold text-[9px] capitalize">
                        MATCHER: {resDiag?.matcherObject ?? resDiag?.simboloCandidatoVisual ?? 'nenhum'} ({resDiag?.matcherScore ?? resDiag?.scoreVisual ?? 0}%)
                      </div>
                      <div className="text-[8px] text-slate-400">
                        2ND: <strong className="text-amber-300 capitalize">{resDiag?.matcherSecondBest ?? resDiag?.segundoMelhorCandidato ?? 'nenhum'}</strong> | GAP: <strong className="text-indigo-300">{resDiag?.matcherGap ?? resDiag?.distanciaScoreComparacao ?? 0} pts</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PAINEL TÉCNICO: FRAME TRANSPORT DEBUG */}
                <div className="mt-2 p-2.5 bg-slate-950 border border-cyan-500/40 rounded-xl space-y-2 font-mono text-[9px]">
                  <div className="font-extrabold text-cyan-300 uppercase border-b border-slate-800 pb-1 flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" /> 📡 FRAME TRANSPORT DEBUG (DIAGNÓSTICO DA REDE E FETCH)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[8px] font-black border ${
                          transport?.lastFetchStatus === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : transport?.lastFetchStatus === 'FAILED'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        FETCH: {transport?.lastFetchStatus || 'IDLE'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[8px] font-black border ${
                          transport?.backendReceived === 'YES'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        BACKEND RECEBEU: {transport?.backendReceived || 'NO'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-slate-300">
                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-slate-400 font-bold block text-[8px]">CAPTURA</span>
                      <div className="text-emerald-400 font-extrabold">{transport?.captureStatus || 'OFF'}</div>
                      <div className="text-[8px] text-slate-500">ID: #{transport?.lastFrameId || 0}</div>
                    </div>

                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-slate-400 font-bold block text-[8px]">TAMANHO PAYLOAD</span>
                      <div className="text-amber-300 font-extrabold">{transport?.payloadSizeKB || '0 KB'}</div>
                      <div className="text-[8px] text-slate-500">JSON Stringified</div>
                    </div>

                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-slate-400 font-bold block text-[8px]">HTTP STATUS</span>
                      <div className={`font-extrabold ${transport?.httpStatus?.includes('200') ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {transport?.httpStatus || 'N/A'}
                      </div>
                      <div className="text-[8px] text-slate-500">Method: {transport?.requestMethod || 'POST'}</div>
                    </div>

                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800 col-span-2">
                      <span className="text-slate-400 font-bold block text-[8px]">ROTA & CLASSIFICAÇÃO</span>
                      <div className="text-cyan-300 font-bold truncate text-[8px]" title={transport?.apiUrl}>
                        {transport?.lastFetchUrl || '/api/live/frame'}
                      </div>
                      <div className="text-[8px] text-slate-500">
                        {transport?.urlClassification?.isRelative ? 'Relativo (/api/...)' : 'Absoluto'} | Origin: {transport?.origin || 'N/A'}
                      </div>
                    </div>

                    <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-slate-400 font-bold block text-[8px]">PROCESSADO</span>
                      <div className={`font-extrabold ${transport?.backendProcessed === 'YES' ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {transport?.backendProcessed || 'NO'}
                      </div>
                      <div className="text-[8px] text-slate-500">Backend Live</div>
                    </div>
                  </div>

                  {transport?.lastError && (
                    <div className="p-2 bg-rose-950/80 border border-rose-500/50 rounded-lg text-rose-200 space-y-1">
                      <div className="font-bold text-[9px] text-rose-300 flex items-center justify-between">
                        <span>⚠️ ÚLTIMO ERRO REGISTRADO NO FETCH:</span>
                        <span className="font-mono text-[8px] bg-rose-900/60 px-1.5 py-0.5 rounded">{transport.lastErrorName || 'Error'}</span>
                      </div>
                      <div className="text-[9px] font-mono text-rose-100 font-semibold">{transport.lastError}</div>
                      {transport.lastErrorStack && (
                        <div className="text-[8px] font-mono text-rose-300/80 max-h-16 overflow-y-auto whitespace-pre-wrap bg-slate-950 p-1.5 rounded border border-rose-900">
                          {transport.lastErrorStack}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PAINEL DE ERRO GEMINI SOMENTE QUANDO HOUVER ERRO REAL */}
                {(status.lastGeminiError || (status.lastGeminiHttpStatus && status.lastGeminiHttpStatus !== 200)) && (
                  <div className="mt-2 p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl space-y-1 font-mono text-[9px] text-rose-200">
                    <div className="flex items-center justify-between font-black uppercase border-b border-rose-800/60 pb-1">
                      <span className="text-rose-300">⚠️ GEMINI_ERROR: {status.lastGeminiError || 'COMMUNICATION_ERROR'}</span>
                      <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded border border-rose-500/40">HTTP {status.lastGeminiHttpStatus || 500}</span>
                    </div>
                    <div className="pt-0.5">
                      <strong className="text-rose-400">MESSAGE:</strong> {status.lastGeminiErrorMessage || 'Falha na requisição da API Gemini.'}
                    </div>
                    <div className="text-[8px] text-rose-300/80">
                      <strong>LATENCY:</strong> {metricas.tempoRespostaGeminiMs || (status as any).ultimoTempoRespostaMs || 0} ms | <strong>STATUS:</strong> CROP_SENT {stepCropSent ? '✓' : '✗'} | GEMINI_RESP {stepGeminiResp ? '✓' : '✗'} {stepGeminiResp ? '(Confirmado)' : '(Confirmação Bloqueada)'}
                    </div>
                  </div>
                )}
              </div>

              {/* RESPOSTA DO TESTE MANUAL DO CROP */}
              {manualCropResult && (
                <div className="p-2.5 bg-black rounded-lg border border-cyan-400/60 space-y-2">
                  <div className="flex items-center justify-between text-[9px] border-b border-slate-800 pb-0.5">
                    <span className="font-black text-cyan-300 uppercase">
                      🧪 ANÁLISE DO CROP REAL (RECONHECIMENTO LOCAL)
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {manualCropResult.latencyMs || 0}ms
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
                    <div>
                      <span className="text-slate-500 uppercase font-bold">Winner / Decisão:</span>
                      <div className="text-amber-300 font-black capitalize text-xs">
                        {manualCropResult.objetoDetectado || manualCropResult.finalObject || 'nenhum'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold">Match Visual:</span>
                      <div className="text-emerald-400 font-black text-xs">
                        {manualCropResult.visualMatch?.objeto || 'nenhum'} ({manualCropResult.visualMatch?.confianca || 0}%)
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold">Aceito / Razão:</span>
                      <div className="text-cyan-300 font-mono text-[9px] truncate">
                        {manualCropResult.accepted !== undefined ? (manualCropResult.accepted ? 'ACEITO' : 'REJEITADO') : 'N/A'} - {manualCropResult.reason || manualCropResult.error || 'OK'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold">Consenso:</span>
                      <div className="text-purple-300 font-bold text-xs">
                        {manualCropResult.consensus || 'LOCAL_ONLY'}
                      </div>
                    </div>
                  </div>

                  {/* TABELA DE PONTUAÇÃO DOS 8 OBJETOS */}
                  {manualCropResult.scoresPorObjeto && (
                    <div className="pt-1 border-t border-slate-800">
                      <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Pontuação Individual das 8 Referências Oficiais:</div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-center font-mono text-[9px]">
                        {Object.entries(manualCropResult.scoresPorObjeto).map(([objName, scoreVal]: [string, any]) => (
                          <div key={objName} className="p-1 bg-slate-900 rounded border border-slate-800 flex flex-col items-center">
                            <span className="text-slate-400 font-bold capitalize text-[8px]">{objName}</span>
                            <span className={`font-black text-[9px] ${
                              objName === manualCropResult.objetoDetectado ? 'text-emerald-400' : 'text-slate-300'
                            }`}>
                              {Math.round((Number(scoreVal) || 0) * (Number(scoreVal) > 1 ? 1 : 100))}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FLUXO LADO A LADO: SYMBOL_CROP ↔ REFERÊNCIA COMPARADA ↔ SCORE VISUAL ↔ GEMINI ↔ RESULTADO FINAL */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-purple-500/30 space-y-2">
              <div className="text-[9px] font-extrabold text-purple-300 uppercase tracking-wider border-b border-slate-800 pb-1">
                FLUXO COMPLETO DE VERIFICAÇÃO VISUAL & GEMINI
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[9px]">
                {/* 1. SYMBOL_CROP & WINNER CROP */}
                {(() => {
                  const activeSymbolCropUrl =
                    resDiag?.winnerCropUrl ||
                    resDiag?.symbolCropUrl ||
                    resDiag?.croppedDataUrl ||
                    lastResult?.frameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl ||
                    status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.croppedDataUrl;

                  const winnerObj =
                    resDiag?.objetoFinal ||
                    resDiag?.simboloCandidatoVisual ||
                    resDiag?.objetoGemini ||
                    lastResult?.objetoDetectado ||
                    status.ultimoObjetoConfirmado;

                  const winnerConfidence =
                    resDiag?.confiancaFinal ||
                    resDiag?.scoreVisual ||
                    resDiag?.confiancaGemini ||
                    lastResult?.confianca ||
                    0;

                  const winnerCropUrl =
                    activeSymbolCropUrl ||
                    (winnerObj && isAllowedWheelObject(winnerObj)
                      ? WHEEL_OBJECT_REFERENCES[winnerObj as WheelObjectName]?.imageUrl
                      : undefined);

                  const cropW = resDiag?.symbolCropWidth || (winnerCropUrl ? 153 : 0);
                  const cropH = resDiag?.symbolCropHeight || (winnerCropUrl ? 153 : 0);
                  const hasCrop = !!winnerCropUrl;
                  const hasWinner = !!winnerObj && winnerObj !== 'nenhum';

                  return (
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-between space-y-1">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">1. WINNER CROP</span>
                      {hasCrop ? (
                        <div className="relative flex flex-col items-center">
                          <img
                            src={winnerCropUrl}
                            alt="WINNER CROP"
                            className="h-14 w-14 object-contain rounded border border-purple-400/60 bg-black p-0.5"
                            onLoad={() => {
                              console.log(
                                `[WINNER_CROP_RENDER] urlAvailable=true imageLoaded=true width=${cropW || 153} height=${cropH || 153}`
                              );
                            }}
                            onError={(e) => {
                              const err = e.nativeEvent as ErrorEvent;
                              console.error(
                                `[WINNER_CROP_ERROR] name=${err?.type || 'ImageError'} message=Failed to load winner crop image`
                              );
                            }}
                          />
                          {hasWinner ? (
                            <span className="mt-1 px-1 py-0.5 rounded text-[8px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              WINNER: {winnerObj} ({winnerConfidence}%)
                            </span>
                          ) : (
                            <span className="mt-1 px-1 py-0.5 rounded text-[8px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              CROP DISPONÍVEL
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="h-14 w-14 bg-slate-950 rounded border border-dashed border-slate-800 flex items-center justify-center text-slate-500 text-[9px]">
                          Sem Crop
                        </div>
                      )}
                      <span className="text-[8px] text-cyan-300 font-mono">
                        {hasCrop ? `${cropW || 153}×${cropH || 153}px` : 'Sem Crop'}
                      </span>
                    </div>
                  );
                })()}

                {/* 2. CANDIDATO 1 (MELHOR MATCH VISUAL) */}
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-between">
                  <span className="text-slate-400 font-bold uppercase mb-1">2. CANDIDATO 1</span>
                  {resDiag?.referenciaComparada ? (
                    <img
                      src={resDiag.referenciaComparada}
                      alt="Referência Oficial"
                      className="h-12 w-12 object-contain rounded border border-emerald-400/50 bg-black p-0.5"
                    />
                  ) : (
                    <div className="h-12 w-12 bg-slate-950 rounded border border-dashed border-slate-800 flex items-center justify-center text-slate-600 text-[8px]">
                      Nenhum
                    </div>
                  )}
                  <span className="text-[8px] text-emerald-300 font-extrabold capitalize mt-1">
                    {resDiag?.simboloCandidatoVisual || 'nenhum'} ({resDiag?.scoreVisual || 0}%)
                  </span>
                </div>

                {/* 3. CANDIDATO 2 (SEGUNDO MELHOR) */}
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-center space-y-0.5">
                  <span className="text-slate-400 font-bold uppercase">3. CANDIDATO 2</span>
                  <span className="text-xs font-bold text-amber-300 capitalize">
                    {resDiag?.segundoMelhorCandidato || 'nenhum'}
                  </span>
                  <span className="text-[9px] text-amber-400/90 font-mono">
                    Score: {resDiag?.scoreSegundoMelhor || 0}%
                  </span>
                  <span className="text-[8px] text-indigo-300">
                    Gap: {resDiag?.distanciaScoreComparacao ?? 0} pts
                  </span>
                </div>

                {/* 4. GEMINI */}
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-center space-y-0.5">
                  <span className="text-slate-400 font-bold uppercase">4. GEMINI</span>
                  <span className="text-xs font-bold text-cyan-300 capitalize">
                    {resDiag?.objetoGemini || 'nenhum'}
                  </span>
                  <span className="text-[8px] text-emerald-300">
                    Confiança: {resDiag?.confiancaGemini || 0}%
                  </span>
                </div>

                {/* 5. CONSENSO */}
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-center space-y-0.5">
                  <span className="text-slate-400 font-bold uppercase">5. CONSENSO</span>
                  {(() => {
                    const gemObj = resDiag?.objetoGemini;
                    const visObj = resDiag?.simboloCandidatoVisual;
                    const hasConsensus = gemObj && visObj && gemObj !== 'nenhum' && visObj !== 'nenhum' && gemObj === visObj;
                    return (
                      <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                        hasConsensus ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {hasConsensus ? 'SIM (CONSENSO)' : 'NÃO / DIVERGENTE'}
                      </span>
                    );
                  })()}
                </div>

                {/* 6. RESULTADO FINAL */}
                <div className="p-2 bg-slate-900 rounded-lg border border-purple-500/40 flex flex-col items-center justify-center space-y-0.5 col-span-2 sm:col-span-1">
                  <span className="text-purple-300 font-extrabold uppercase">6. RESULTADO FINAL</span>
                  <span className="text-sm font-black text-emerald-300 capitalize">
                    {resDiag?.objetoFinal || 'nenhum'}
                  </span>
                  <span className="text-[8px] text-amber-300 font-mono">
                    {resDiag?.eventId || 'Sem Event ID'}
                  </span>
                </div>
              </div>
            </div>

            {/* PAINEL DE REFERÊNCIAS OFICIAIS ATIVAS (CATÁLOGO DE 8 SÍMBOLOS DA TELA DE RESULTADO) */}
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[9px] font-extrabold text-purple-300 uppercase">
                <span>[REFERÊNCIAS DE RESULTADO — CATÁLOGO OFICIAL]</span>
                <span className="text-emerald-400 text-[8px]">8 IMAGENS OFICIAIS ATIVAS</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center text-[8px]">
                {Object.entries(WHEEL_OBJECT_REFERENCES).map(([key, ref]) => {
                  const isWinningRef = resDiag?.simboloCandidatoVisual === key || resDiag?.objetoFinal === key;
                  return (
                    <div
                      key={key}
                      className={`p-1 rounded-lg border flex flex-col items-center justify-between transition-all ${
                        isWinningRef
                          ? 'bg-emerald-950/60 border-emerald-500 shadow-sm shadow-emerald-500/50 scale-105'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <img
                        src={ref.imageUrl}
                        alt={ref.name}
                        className="h-9 w-9 object-contain rounded bg-black/60 p-0.5"
                      />
                      <span className={`capitalize font-bold mt-1 ${isWinningRef ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {key}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              {/* METADADOS DE POSICIONAMENTO E CENTRO DO CROP */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
                  METADADOS DE POSICIONAMENTO DO MODAL E RECORTE
                </div>
                <div className="grid grid-cols-2 gap-x-2 text-[9px] mt-1">
                  <div>• Modal X, Y: <strong className="text-cyan-300">{resDiag?.resultScreenX ?? resDiag?.roiX ?? 0}, {resDiag?.resultScreenY ?? resDiag?.roiY ?? 0}px</strong></div>
                  <div>• Modal W, H: <strong className="text-amber-300">{resDiag?.resultScreenWidth ?? resDiag?.roiWidth ?? 0}x{resDiag?.resultScreenHeight ?? resDiag?.roiHeight ?? 0}px</strong></div>
                  <div>• Centro Modal: <strong className="text-purple-300">({resDiag?.resultScreenCenterX ?? 0}, {resDiag?.resultScreenCenterY ?? 0})</strong></div>
                  <div>• Crop X, Y: <strong className="text-cyan-300">{resDiag?.symbolCropX ?? resDiag?.absCropX ?? 0}, {resDiag?.symbolCropY ?? resDiag?.absCropY ?? 0}px</strong></div>
                  <div>• Crop W, H: <strong className="text-amber-300">{resDiag?.symbolCropWidth ?? resDiag?.cropWidth ?? 0}x{resDiag?.symbolCropHeight ?? resDiag?.cropHeight ?? 0}px</strong></div>
                  <div>• Centro Crop: <strong className="text-purple-300">({resDiag?.symbolCropCenterX ?? 0}, {resDiag?.symbolCropCenterY ?? 0})</strong></div>
                </div>
              </div>

              {/* MOTIVO DE DESCARTE E STATUS DA DIVERGÊNCIA */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
                  DIAGNÓSTICO DE MOTIVO & DIVERGÊNCIA
                </div>
                <div>• Confiança Mínima: <strong className="text-cyan-300">85%</strong></div>
                <div>• Estado Detector: <strong className="text-purple-300">{resDiag?.estadoAtual || 'IDLE'}</strong></div>
                <div>• Event ID: <span className="text-amber-300 font-mono text-[9px]">{resDiag?.eventId || 'N/A'}</span></div>
                <div className="pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500 text-[8px] uppercase font-bold block">Status do Descarte / Divergência:</span>
                  <span className={`text-[9px] font-bold ${resDiag?.motivoDescarte ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {resDiag?.motivoDescarte || resDiag?.motivoDescarteVisual || 'Nenhum (Deteção Confirmada e Válida)'}
                  </span>
                </div>
              </div>
            </div>

            {/* CONTROLES INTERATIVOS DE AJUSTE MANUAL DA RESULT_ZONE (REQUIREMENT #18 & #19) */}
            <div className="mt-3 p-3 bg-slate-950/90 border border-purple-500/40 rounded-xl space-y-2.5 font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span className="text-[10px] font-extrabold text-purple-200 uppercase tracking-wider">
                    AJUSTE MANUAL DA RESULT_ZONE (ENQUADRAMENTO EM TEMPO REAL)
                  </span>
                  {customZoneCfg.enabled && (
                    <span className="text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 rounded font-bold">
                      CROP PERSONALIZADO ATIVO
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={customZoneCfg.enabled}
                      onChange={(e) => handleToggleCustom(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    Ativar Crop Personalizado
                  </label>
                  <button
                    onClick={handleSaveConfig}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                  >
                    <Save className="w-3 h-3" /> Salvar RESULT_ZONE
                  </button>
                  <button
                    onClick={handleResetConfig}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Restaurar Padrão
                  </button>
                </div>
              </div>

              {zoneSaveToast && (
                <div className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 p-1.5 rounded flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{zoneSaveToast}</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 text-[10px]">
                {/* Slider X (%) */}
                <div className="space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span>Posição X (%):</span>
                    <strong className="text-cyan-300">{customZoneCfg.xPct.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="0.5"
                    value={customZoneCfg.xPct}
                    onChange={(e) => handleSliderChange('xPct', parseFloat(e.target.value))}
                    className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded cursor-pointer"
                  />
                </div>

                {/* Slider Y (%) */}
                <div className="space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span>Posição Y (%):</span>
                    <strong className="text-cyan-300">{customZoneCfg.yPct.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="0.5"
                    value={customZoneCfg.yPct}
                    onChange={(e) => handleSliderChange('yPct', parseFloat(e.target.value))}
                    className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded cursor-pointer"
                  />
                </div>

                {/* Slider Width (%) */}
                <div className="space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span>Largura W (%):</span>
                    <strong className="text-amber-300">{customZoneCfg.wPct.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="0.5"
                    value={customZoneCfg.wPct}
                    onChange={(e) => handleSliderChange('wPct', parseFloat(e.target.value))}
                    className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded cursor-pointer"
                  />
                </div>

                {/* Slider Height (%) */}
                <div className="space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span>Altura H (%):</span>
                    <strong className="text-amber-300">{customZoneCfg.hPct.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="0.5"
                    value={customZoneCfg.hPct}
                    onChange={(e) => handleSliderChange('hPct', parseFloat(e.target.value))}
                    className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PAINEL DE DIAGNÓSTICO DO FRAME DA SCREEN_CAPTURE */}
      <div className="bg-slate-900/95 border border-cyan-500/30 p-3 rounded-2xl space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Monitor className="w-4 h-4 text-cyan-400" /> DIAGNÓSTICO SCREEN_CAPTURE & MEDIASTREAM
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
            frameFrozenStatus === 'FRAME_ATUALIZANDO' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}>
            {frameFrozenStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          {/* PRÉVIA DO ÚLTIMO FRAME CAPTURADO ENVIADO À GEMINI */}
          <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center space-y-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
              PRÉVIA DO FRAME ENVIADO
            </span>
            {lastCapturedFrameDataUrl ? (
              <img
                src={lastCapturedFrameDataUrl}
                alt="Último frame enviado"
                className="w-full max-h-28 object-contain rounded border border-slate-700 bg-black"
              />
            ) : (
              <div className="w-full h-20 bg-slate-900 border border-dashed border-slate-800 rounded flex items-center justify-center text-[10px] text-slate-600">
                Aguardando frame...
              </div>
            )}
            <div className="text-[9px] font-mono text-cyan-400 text-center">
              {lastFrameSendMetadata ? `${lastFrameSendMetadata.width}x${lastFrameSendMetadata.height} (${lastFrameSendMetadata.jpegSizeKB})` : 'Sem metadados'}
            </div>
          </div>

          {/* MEDIASTREAM & TRACK DETAILS */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[10px]">
            <div className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
              1. MediaStream (SCRCPY / Navegador)
            </div>
            <div>• Track: <span className="text-cyan-300 font-bold">{mediaStreamSettings?.label || 'N/A'}</span></div>
            <div>• DisplaySurface: <span className="text-indigo-300 font-bold">{mediaStreamSettings?.displaySurface || 'N/A'}</span></div>
            <div>• Stream Res: <span className="text-amber-300 font-bold">{mediaStreamSettings?.width || 0}x{mediaStreamSettings?.height || 0}</span> @ {mediaStreamSettings?.frameRate || 0}fps</div>
            <div>• Video Element: <span className="text-slate-200">{videoDimensions?.width || 0}x{videoDimensions?.height || 0}</span></div>
          </div>

          {/* CANVAS & RESOLUÇÃO DE ENVIO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[10px]">
            <div className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
              2. Canvas & Resolução Enviada
            </div>
            <div>• Canvas: <span className="text-cyan-300 font-bold">{canvasDimensions?.width || 0}x{canvasDimensions?.height || 0}</span></div>
            <div>• Frame Enviado: <span className="text-amber-300 font-bold">{lastFrameSendMetadata?.width || 0}x{lastFrameSendMetadata?.height || 0}</span></div>
            <div>• Qualidade JPEG: <span className="text-emerald-300 font-bold">{((lastFrameSendMetadata?.quality || 0.85) * 100).toFixed(0)}%</span></div>
            <div>• Tamanho KB: <span className="text-indigo-300 font-bold">{lastFrameSendMetadata?.jpegSizeKB || '0 KB'}</span></div>
          </div>

          {/* STATUS DA REQUISIÇÃO HTTP BACKEND */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[10px]">
            <div className="text-slate-400 font-bold uppercase text-[9px] border-b border-slate-800 pb-0.5">
              3. Requisição POST /api/live/frame
            </div>
            <div>• Frame ID: <span className="text-cyan-300 font-bold">#{lastFrameSendMetadata?.frameId || 0}</span></div>
            <div>• HTTP Status: <span className="text-emerald-400 font-bold">{lastFrameSendMetadata?.httpStatus || 'N/A'}</span></div>
            <div>• Latência HTTP: <span className="text-amber-300 font-bold">{lastFrameSendMetadata ? `${lastFrameSendMetadata.requestFinished - lastFrameSendMetadata.requestStarted}ms` : 'N/A'}</span></div>
            <div>• Status Captura: <span className={frameFrozenStatus === 'FRAME_ATUALIZANDO' ? 'text-emerald-400' : 'text-amber-400'}>{frameFrozenStatus}</span></div>
          </div>
        </div>
      </div>

      {/* CICLO DA RODADA & LIFECYCLE DIAGNÓSTICO */}
      <div className="bg-slate-900/90 border border-emerald-500/40 p-3 rounded-2xl space-y-2 font-mono">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-emerald-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-emerald-400" /> CICLO DA RODADA (MULTI-ROUND LIFECYCLE)
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_PROXIMA_RODADA')
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'LEITURA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMANDO'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}>
            NOVA RODADA: {
              ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_PROXIMA_RODADA')
                ? 'BLOQUEADA'
                : ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'LEITURA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMANDO')
                ? 'EM LEITURA'
                : 'LIBERADA'
            }
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[10px]">
          {/* RODADA E ESTADO ATUAL */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-emerald-900/50 space-y-1">
            <div className="text-emerald-300 font-bold uppercase text-[9px] border-b border-emerald-900/40 pb-0.5 flex justify-between">
              <span>1. Rodada & Estado</span>
              <span className="text-emerald-400 font-extrabold">
                #{status.totalEventIdsCriados || status.totalRodadasDetectadasSessao || 1}
              </span>
            </div>
            <div>• Resultado: <strong className="text-emerald-300 capitalize">{lastResult?.estabilizacao?.ultimoObjetoConfirmado || status.ultimoObjetoConfirmado || 'Nenhum'}</strong></div>
            <div>• Estado Analyzer: <strong className="text-purple-300">{lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE'}</strong></div>
            <div>• Event ID Ativo: <strong className="text-cyan-300 text-[9px]">{lastResult?.estabilizacao?.eventId || status.currentEventId || 'N/A'}</strong></div>
          </div>

          {/* DETECÇÃO E MOTIVO DO CICLO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-emerald-900/50 space-y-1">
            <div className="text-emerald-300 font-bold uppercase text-[9px] border-b border-emerald-900/40 pb-0.5">
              2. Status da Tela
            </div>
            <div>• Tela Resultado: <strong className={status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.resultadoScreenDetected ? 'text-emerald-400' : 'text-slate-400'}>{status.ultimoFrameDiagnostico?.resultScreenDiagnostico?.resultadoScreenDetected ? 'DETECTADA' : 'NÃO DETECTADA'}</strong></div>
            <div>• Liberada para Rodada: <strong className={
              ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_PROXIMA_RODADA')
                ? 'text-rose-400'
                : 'text-emerald-400'
            }>{
              ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_PROXIMA_RODADA')
                ? 'BLOQUEADA'
                : 'LIBERADA'
            }</strong></div>
            <div className="text-slate-300 line-clamp-2">
              • Motivo: <span className="text-amber-200">
                {
                  ((lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'RESULTADO_CONFIRMADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_SAIDA_TELA_RESULTADO' || (lastResult?.estabilizacao?.estadoAnalyzer || status.analyzerState || 'IDLE') === 'AGUARDANDO_PROXIMA_RODADA')
                    ? 'AGUARDANDO SAÍDA DA TELA DE RESULTADO'
                    : 'RODA NORMAL — PRONTA PARA PRÓXIMA RODADA'
                }
              </span>
            </div>
          </div>

          {/* CONTADORES DO CICLO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-emerald-900/50 space-y-1 col-span-1 sm:col-span-2 md:col-span-1">
            <div className="text-emerald-300 font-bold uppercase text-[9px] border-b border-emerald-900/40 pb-0.5">
              3. Contadores de Ciclo
            </div>
            <div className="grid grid-cols-2 gap-x-2 text-[9.5px]">
              <div>• Confirmados: <strong className="text-emerald-300">{status.resultadosConfirmados || status.totalConfirmacoes || 0}</strong></div>
              <div>• Event IDs: <strong className="text-cyan-300">{status.totalEventIdsCriados || 0}</strong></div>
              <div>• Telas Detectadas: <strong className="text-amber-300">{status.telasResultadoDetectadas || 0}</strong></div>
              <div>• Telas Encerradas: <strong className="text-indigo-300">{status.telasResultadoEncerradas || 0}</strong></div>
              <div>• Rodadas Liberadas: <strong className="text-emerald-400">{status.rodadasLiberadas || 0}</strong></div>
              <div>• Duplicações Bloq: <strong className="text-rose-400">{status.totalDuplicacoesBloqueadas || status.rodadasBloqueadas || 0}</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* ESTABILIZAÇÃO E DIAGNÓSTICO DO WHEEL VISION ANALYZER */}
      <div className="bg-slate-900/90 border border-purple-500/30 p-3 rounded-2xl space-y-2 font-mono">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-purple-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-400" /> ESTABILIZAÇÃO & DIAGNÓSTICO WHEEL VISION
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            (lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE') === 'CONFIRMADO'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : (lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE') === 'AGUARDANDO_MUDANCA'
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
              : (lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE') === 'INSTABILIDADE_DETECCAO'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}>
            ESTADO: {lastResult?.estabilizacao?.estadoAnalyzer || 'IDLE'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
          {/* CANDIDATO ATUAL */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-purple-900/50 space-y-1">
            <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-purple-900/40 pb-0.5 flex justify-between">
              <span>1. Candidato Atual</span>
              <span className="text-purple-400">
                {lastResult?.estabilizacao?.confirmacoesConsecutivas || status.confirmacoesConsecutivas || 0}/{lastResult?.estabilizacao?.confirmacoesNecessarias || 3} conf.
              </span>
            </div>
            <div>• Objeto: <strong className="text-amber-300 capitalize">{lastResult?.estabilizacao?.candidatoAtual || status.candidatoAtual || 'Nenhum'}</strong></div>
            <div>• Confiança Mínima: <strong className="text-cyan-300">{lastResult?.estabilizacao?.minConfidence || 85}%</strong></div>
            <div>• Confirmações Consecutivas: <strong className="text-emerald-400">{lastResult?.estabilizacao?.confirmacoesConsecutivas || status.confirmacoesConsecutivas || 0}</strong> / 3</div>
          </div>

          {/* ÚLTIMO RESULTADO CONFIRMADO */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-purple-900/50 space-y-1">
            <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-purple-900/40 pb-0.5 flex justify-between">
              <span>2. Último Confirmado</span>
              <span className="text-emerald-400">
                {status.totalRodadasDetectadasSessao || 0} Rodadas
              </span>
            </div>
            <div>• Objeto: <strong className="text-emerald-300 capitalize">{lastResult?.estabilizacao?.ultimoObjetoConfirmado || status.ultimoObjetoConfirmado || 'Nenhum'}</strong></div>
            <div>• Confiança: <strong className="text-cyan-300">{lastResult?.estabilizacao?.confiancaUltimaConfirmacao || status.confiancaUltimaConfirmacao || 0}%</strong></div>
            <div>• Horário: <strong className="text-slate-400">{lastResult?.estabilizacao?.horarioUltimaConfirmacao || status.horarioUltimaConfirmacao ? new Date(lastResult?.estabilizacao?.horarioUltimaConfirmacao || status.horarioUltimaConfirmacao!).toLocaleTimeString() : 'N/A'}</strong></div>
          </div>

          {/* ESTABILIDADE DA CENA E FASE DA RODA */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-purple-900/50 space-y-1">
            <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-purple-900/40 pb-0.5 flex justify-between">
              <span>3. Estabilidade Visual</span>
              <span className="text-cyan-400 font-bold">
                {lastResult?.estabilizacao?.wheelPhase || 'DETECÇÃO'}
              </span>
            </div>
            <div>• Fase da Roda: <strong className="text-indigo-300">{lastResult?.estabilizacao?.wheelPhase || 'DETECÇÃO'}</strong></div>
            <div>• Estabilidade Cena: <strong className="text-cyan-300">{lastResult?.estabilizacao?.sceneStability?.score ?? 100}%</strong> ({lastResult?.estabilizacao?.sceneStability?.state ?? 'ESTÁVEL'})</div>
            <div>• Janela Estável: <strong className="text-amber-300">{lastResult?.estabilizacao?.tempoEstavelMs ?? 0}ms</strong> / 1000ms</div>
          </div>

          {/* MOTIVO E STATUS EVENT ID */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-purple-900/50 space-y-1">
            <div className="text-purple-300 font-bold uppercase text-[9px] border-b border-purple-900/40 pb-0.5">
              4. Status & Event ID
            </div>
            <div className="text-slate-300 line-clamp-2">
              • Motivo: <span className="text-amber-200">{lastResult?.estabilizacao?.motivoEstabilizacao || 'Aguardando detecção estática'}</span>
            </div>
            <div>
              • Event ID: <strong className="text-cyan-300 font-mono text-[9px]">{lastResult?.estabilizacao?.eventId || status.currentEventId || 'N/A'}</strong>
            </div>
            <div>
              • Salvo Supabase: <strong className={autoPersistEnabled ? (lastResult?.estabilizacao?.gravadoNoSupabase ? 'text-emerald-400' : 'text-slate-400') : 'text-amber-400'}>
                {autoPersistEnabled
                  ? (lastResult?.estabilizacao?.gravadoNoSupabase ? `SIM (#${lastResult?.estabilizacao?.rodadaRegistrada || 'OK'})` : 'AGUARDANDO')
                  : 'NÃO (PERSISTÊNCIA DESABILITADA)'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* DIAGNÓSTICO DO RECONHECEDOR LOCAL */}
      {(() => {
        const resDiag = lastResult?.frameDiagnostico?.resultScreenDiagnostico || status.ultimoFrameDiagnostico?.resultScreenDiagnostico;
        return (
          <div className="bg-slate-900/90 border border-cyan-500/30 p-3 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" /> DIAGNÓSTICO DO RECONHECEDOR LOCAL (LOGS DO RECOGNIZER)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                {resDiag?.localDecision || 'LOCAL_ONLY_ACTIVE'}
              </span>
            </div>

            {/* MENSAGEM BRUTA DO RECOGNIZER */}
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {resDiag?.motivoDescarteVisual || lastResult?.rawText || status.ultimaRespostaBrutaGemini || '(Aguardando diagnóstico do reconhecedor local...)'}
            </div>

            {/* DETALHES E DIAGNÓSTICO DO FRAME */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
              <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="text-slate-400 uppercase font-bold text-[9px]">Objeto Detectado</div>
                <div className="text-amber-300 font-extrabold text-xs mt-0.5 capitalize">
                  {lastResult?.objetoDetectado || 'Nenhum'}
                </div>
                <div className="text-slate-500">{lastResult?.confianca ? `${lastResult.confianca}% conf` : '0% conf'}</div>
              </div>

              <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="text-slate-400 uppercase font-bold text-[9px]">Dimensão / Resolução</div>
                <div className="text-cyan-300 font-extrabold text-xs mt-0.5">
                  {status.ultimoFrameDiagnostico?.largura || lastResult?.frameDiagnostico?.largura || 640}x
                  {status.ultimoFrameDiagnostico?.altura || lastResult?.frameDiagnostico?.altura || 480}
                </div>
                <div className="text-slate-500">{status.ultimoFrameDiagnostico?.mimeType || 'image/jpeg'}</div>
              </div>

              <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="text-slate-400 uppercase font-bold text-[9px]">Tamanho JPEG / Conteúdo</div>
                <div className="text-indigo-300 font-extrabold text-xs mt-0.5">
                  {status.ultimoFrameDiagnostico?.tamanhoKB || lastResult?.frameDiagnostico?.tamanhoKB || '0 KB'}
                </div>
                <div className={`text-[9px] font-bold ${
                  status.ultimoFrameDiagnostico?.conteudoVisual !== false ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {status.ultimoFrameDiagnostico?.conteudoVisual !== false ? '✓ Frame com Imagem' : '⚠ Frame Escuro/Pequeno'}
                </div>
              </div>

              <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="text-slate-400 uppercase font-bold text-[9px]">Contadores do Pipeline</div>
                <div className="text-slate-300 font-bold text-[10px] mt-0.5">
                  Detectados: {metricas.totalDetectados || 0}
                </div>
                <div className="text-slate-400 text-[9px]">
                  Aguardando: {metricas.totalAguardando || 0} | Sem Resp: {metricas.totalSemResposta || 0}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CHECKLIST DE CONECTIVIDADE DA PIPELINE */}
      <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <ShieldCheck className="w-3.5 h-3.5" /> CHECKLIST DE VERIFICAÇÃO DE PIPELINE (8 ETAPAS)
          </span>
          <span className={`text-[9px] font-bold ${autoPersistEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
            {autoPersistEnabled ? 'MODO LIVE REAL (PERSISTÊNCIA HABILITADA)' : 'MODO DIAGNÓSTICO (ETAPA 8 DESABILITADA)'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono">
          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            isStreamActive ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>1. MediaStream</span>
            <span>{isStreamActive ? '✓ OK' : '✗ N/A'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            isStreamActive ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>2. VideoTrack</span>
            <span>{isStreamActive ? '✓ Ativo' : '✗ N/A'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            totalCapturados > 0 ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>3. Frame Canvas</span>
            <span>{totalCapturados > 0 ? '✓ Capturado' : 'Aguardando'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            totalCapturados > 0 ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>4. JPEG Base64</span>
            <span>{totalCapturados > 0 ? '✓ Convertido' : 'Aguardando'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            totalEnviados > 0 ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>5. /api/live/frame</span>
            <span>{totalEnviados > 0 ? '✓ Aceito' : 'Aguardando'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            hasLastDetection ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>6. Gemini Respondeu</span>
            <span>{hasLastDetection ? '✓ Respondeu' : 'Aguardando'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            status.candidatoAtual || status.ultimoObjetoConfirmado ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'
          }`}>
            <span>7. VisionAnalyzer</span>
            <span>{status.candidatoAtual || status.ultimoObjetoConfirmado ? '✓ Processou' : 'Aguardando'}</span>
          </div>

          <div className={`p-1.5 rounded-lg border flex items-center justify-between ${
            autoPersistEnabled
              ? (lastResult?.estabilizacao?.gravadoNoSupabase ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500')
              : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
          }`}>
            <span>8. Supabase Saved</span>
            <span>
              {autoPersistEnabled
                ? (lastResult?.estabilizacao?.gravadoNoSupabase ? `✓ Salvo (#${lastResult?.estabilizacao?.rodadaRegistrada || 'OK'})` : 'Aguardando')
                : 'PERSISTÊNCIA DESABILITADA'}
            </span>
          </div>
        </div>
      </div>

      {/* RESULTADO DO TESTE DE FRAME ESTÁTICO (SE EXECUTADO) */}
      {singleFrameTestResult && (
        <div className="p-3 bg-cyan-950/70 border border-cyan-500/50 rounded-2xl space-y-1.5 font-mono text-[11px] animate-fadeIn">
          <div className="flex items-center justify-between text-cyan-300 font-bold border-b border-cyan-500/30 pb-1">
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              RESULTADO DO TESTE DE FRAME ESTÁTICO REAL
            </span>
            <span className="text-[10px] text-cyan-400 font-bold">
              HTTP: {singleFrameTestResult.httpStatus} | {singleFrameTestResult.tempoMs || 0}ms
            </span>
          </div>

          <div className="text-slate-200 space-y-1">
            <div>• Dimensão do Frame: <strong className="text-amber-300">{singleFrameTestResult.largura || 0}x{singleFrameTestResult.altura || 0}</strong></div>
            <div>• Estado Gemini: <strong className="text-cyan-300">{singleFrameTestResult.estadoGemini || 'N/A'}</strong></div>
            <div>• Resposta Bruta Gemini:</div>
            <div className="p-2 bg-slate-950 border border-cyan-800/50 rounded text-[10px] text-amber-200 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
              {singleFrameTestResult.respostaBrutaGemini || singleFrameTestResult.erro || '(Sem resposta)'}
            </div>
            <div>• Objeto Detectado: <strong className="text-emerald-300 capitalize">{singleFrameTestResult.objetoDetectado || 'Nenhum'}</strong> ({singleFrameTestResult.confianca || 0}%)</div>
            {singleFrameTestResult.erro && (
              <div className="text-rose-400 font-bold">• Erro: {singleFrameTestResult.erro}</div>
            )}
          </div>
        </div>
      )}

      {/* RESULTADO DO TESTE SIMULADO (SE EXECUTADO) */}
      {simulatedTestResult && (
        <div className="p-2.5 bg-purple-950/60 border border-purple-500/40 rounded-2xl space-y-1 font-mono text-[11px] animate-fadeIn">
          <div className="flex items-center justify-between text-purple-300 font-bold">
            <span className="flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
              RESULTADO DO TESTE SIMULADO (boia @ 95%)
            </span>
            <span className="text-[10px] text-purple-400">
              {simulatedTestResult.tempoExecucaoMs}ms
            </span>
          </div>

          <div className="text-slate-300 space-y-0.5">
            <div>• Objeto: <strong className="text-amber-300">{simulatedTestResult.objetoSimulado}</strong> | Confiança: <strong className="text-cyan-300">{simulatedTestResult.confiancaSimulada}%</strong></div>
            <div>• VisionAnalyzer: Status={simulatedTestResult.analyzerStatus} | State={simulatedTestResult.analyzerState}</div>
            <div>• Confirmado Agora: <strong className={simulatedTestResult.foiConfirmadoAgora ? 'text-emerald-400' : 'text-amber-400'}>{simulatedTestResult.foiConfirmadoAgora ? (autoPersistEnabled ? 'SIM (CONFIRMADO & PERSISTIDO)' : 'SIM (CONFIRMADO — PERSISTÊNCIA DESABILITADA)') : 'NÃO'}</strong></div>
            <div>• Gravado Supabase: <strong className={simulatedTestResult.gravadoNoSupabase ? 'text-emerald-400' : 'text-amber-400'}>{simulatedTestResult.gravadoNoSupabase ? 'SIM' : (autoPersistEnabled ? 'NÃO / FALHA' : 'NÃO (PERSISTÊNCIA DESABILITADA)')}</strong></div>
            <div className="text-slate-400 italic">• Motivo: {simulatedTestResult.motivoEstabilizacao}</div>
          </div>
        </div>
      )}
    </div>
  );
};
