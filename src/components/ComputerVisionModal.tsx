import React, { useState, useRef } from 'react';
import { AIVisionResult, WheelItem } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import {
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Info,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface ComputerVisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterDetectedItems: (items: WheelItem[]) => void;
}

export const ComputerVisionModal: React.FC<ComputerVisionModalProps> = ({
  isOpen,
  onClose,
  onRegisterDetectedItems,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIVisionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        setAnalysisResult(null);
        setErrorMessage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Start webcam feed
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Erro ao acessar a câmera:', err);
      setErrorMessage('Não foi possível acessar a câmera. Verifique as permissões.');
      setIsCameraActive(false);
    }
  };

  // Stop camera feed
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Capture frame from webcam
  const captureFromCamera = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImagePreview(dataUrl);
        stopCamera();
      }
    }
  };

  // Send image to backend Gemini vision API
  const handleAnalyzeImage = async () => {
    if (!imagePreview) return;

    try {
      setIsAnalyzing(true);
      setErrorMessage(null);

      const res = await fetch('/api/analyze-wheel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Falha ao analisar a imagem.');
      }

      setAnalysisResult(data);
    } catch (err: any) {
      console.error('Erro ao chamar Visão AI:', err);
      setErrorMessage(err.message || 'Ocorreu um erro ao identificar a imagem.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Confirm registration into local history
  const handleConfirmRegistration = () => {
    if (analysisResult && analysisResult.detectedItems.length > 0) {
      // Remember: Detected items come from left (newest) to right (oldest).
      // Since our history array holds oldest at index 0 and newest at last index,
      // when inserting items detected from left-to-right (newest to oldest),
      // we reverse them before pushing to preserve chronological sequence!
      const chronologicalBatch = [...analysisResult.detectedItems].reverse();
      onRegisterDetectedItems(chronologicalBatch);
      onClose();
    }
  };

  // Listener para tecla Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      {/* Backdrop clicável fora do modal */}
      <div
        onClick={() => {
          stopCamera();
          onClose();
        }}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer"
        title="Clique fora para fechar"
      />

      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative z-10 my-auto max-h-[90dvh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-100">
                Visão Computacional AI - Roda Gigante
              </h2>
              <p className="text-xs text-slate-400 hidden xs:block">
                Identificação automática do histórico visual da roda por Inteligência Artificial
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Sair da Visão AI"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>SAIR</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="my-5 space-y-4">
          
          {/* Rules Banner */}
          <div className="text-xs bg-slate-800/80 border border-slate-700 p-3 rounded-xl flex items-start gap-2 text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong>Regras de Visão AI:</strong> O lado esquerdo da imagem é interpretado como o resultado mais RECENTE e o lado direito como o mais ANTIGO. Se a imagem não for clara, o sistema reportará baixa confiança sem inventar resultados.
            </div>
          </div>

          {/* Camera View or Image Preview */}
          {isCameraActive ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-4 flex items-center gap-3">
                <button
                  onClick={captureFromCamera}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Capturar Foto
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : imagePreview ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 max-h-64 flex items-center justify-center">
              <img src={imagePreview} alt="Captura da Roda" className="max-h-64 object-contain" />
              <button
                onClick={() => {
                  setImagePreview(null);
                  setAnalysisResult(null);
                }}
                className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-1.5 rounded-lg border border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Trocar Imagem
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* File Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/50 hover:bg-slate-900 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-2 transition-all cursor-pointer group"
              >
                <Upload className="w-8 h-8 text-slate-500 group-hover:text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-slate-300">Carregar Foto / Print Screen</span>
                <span className="text-[10px] text-slate-500">Selecione uma imagem da galeria</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {/* Live Camera Button */}
              <button
                onClick={startCamera}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-950/50 hover:bg-slate-900 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-2 transition-all cursor-pointer group"
              >
                <Camera className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-slate-300">Usar Câmera em Tempo Real</span>
                <span className="text-[10px] text-slate-500">Tirar foto direta da tela ou roda</span>
              </button>
            </div>
          )}

          {/* Trigger Analysis Button */}
          {imagePreview && !analysisResult && (
            <button
              onClick={handleAnalyzeImage}
              disabled={isAnalyzing}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Analisando com Visão Computacional...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Identificar Objetos na Imagem</span>
                </>
              )}
            </button>
          )}

          {/* Error Display */}
          {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Analysis Result Section */}
          {analysisResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Confiança do Reconhecimento:</span>
                  <span
                    className={`text-xs font-extrabold uppercase px-2 py-0.5 rounded-md ${
                      analysisResult.confidence === 'alta'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : analysisResult.confidence === 'media'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {analysisResult.confidence} ({analysisResult.confidenceScore}%)
                  </span>
                </div>
              </div>

              {/* Low confidence Warning */}
              {analysisResult.confidence === 'baixa' && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção (Baixa Confiança):</strong> A imagem fornecida não está perfeitamente nítida ou apresenta ambiguidades. Verifique os itens detectados antes de salvar.
                  </div>
                </div>
              )}

              {/* Detected Items Strip */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2">
                  <span className="text-cyan-400 flex items-center gap-1">
                    <ArrowLeft className="w-3.5 h-3.5" /> Mais Recente (Esquerda)
                  </span>
                  <span>Objetos Identificados ({analysisResult.detectedItems.length})</span>
                  <span className="text-slate-500 flex items-center gap-1">
                    Mais Antigo (Direita) <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>

                {(!analysisResult.detectedItems || analysisResult.detectedItems.length === 0) ? (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    Nenhum objeto foi identificado na imagem. Tente carregar uma imagem mais nítida da roda ou barra de histórico.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {analysisResult.detectedItems.map((item, i) => {
                      const config = WHEEL_ITEMS[item];
                      return (
                        <div
                          key={i}
                          className={`shrink-0 p-2 rounded-xl border flex flex-col items-center min-w-[64px] ${config?.bgColor || 'bg-slate-800'} ${config?.borderColor || 'border-slate-700'}`}
                        >
                          <span className="text-2xl">{config?.emoji || '❓'}</span>
                          <span className={`text-[10px] font-bold ${config?.textColor || 'text-slate-300'}`}>
                            {config?.label || item}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                {analysisResult.description}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setAnalysisResult(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Refazer
                </button>
                <button
                  onClick={handleConfirmRegistration}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Salvar no Banco</span>
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
