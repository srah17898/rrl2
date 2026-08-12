import React, { useState, useEffect } from 'react';
import { Radio, Power, RefreshCw, AlertCircle, Sparkles, X, Clock, ShieldCheck } from 'lucide-react';
import { useLiveSession } from '../hooks/useLiveSession';

export const LiveStatusIndicator: React.FC = () => {
  const {
    estado,
    status,
    iniciarSessao,
    encerrarSessao,
    reconectar,
    isOnline,
    isConnecting,
    isReconnecting,
  } = useLiveSession();

  const [showModal, setShowModal] = useState(false);

  // Efeito para captura global da tecla ESC e controle de scroll no body
  useEffect(() => {
    if (!showModal) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showModal]);

  const handleClose = () => {
    setShowModal(false);
  };

  const renderDotAndText = () => {
    switch (estado) {
      case 'conectado':
        return (
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>● Online</span>
          </div>
        );
      case 'conectando':
        return (
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px]">
            <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
            <span>● Conectando...</span>
          </div>
        );
      case 'reconectando':
        return (
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>● Reconectando...</span>
          </div>
        );
      case 'erro':
        return (
          <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px]">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <span>● Erro Live</span>
          </div>
        );
      case 'desconectado':
      default:
        return (
          <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[11px]">
            <span className="h-2 w-2 rounded-full bg-slate-500"></span>
            <span>● Offline</span>
          </div>
        );
    }
  };

  return (
    <>
      {/* Botão Discreto de Status Live */}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition shadow-sm cursor-pointer active:scale-95"
        title="Painel de Integração Gemini Live API (Clique para abrir)"
      >
        <Radio className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
        {renderDotAndText()}
      </button>

      {/* Modal / Popover Informativo e de Gerenciamento da Conexão Gemini Live */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop clicável para fechar o modal ao clicar fora */}
          <div
            onClick={handleClose}
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer transition-opacity"
            title="Clique fora para fechar"
          />

          {/* Cartão de Conteúdo do Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl relative z-10 my-auto max-h-[90dvh] overflow-y-auto"
          >
            {/* Botão X visível para fechar */}
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer active:scale-95"
              title="Fechar painel (ESC)"
            >
              <X className="w-5 h-5 text-rose-400" />
            </button>

            <div className="flex items-center gap-2 pr-8">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-100">
                  Gemini Live API – Conexão Real
                </h3>
                <p className="text-[11px] text-slate-400">
                  PROMPT LIVE 002 – Sessão Única e Transmissão Segura
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estado Conexão:</span>
                {renderDotAndText()}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Session ID:</span>
                <span className="font-mono text-slate-300 text-[11px]">
                  {status.sessionId || 'Nenhuma sessão ativa'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Modelo Oficial:</span>
                <span className="font-mono text-indigo-400 text-[11px]">
                  {status.modelUtilizado || 'gemini-3.6-flash'}
                </span>
              </div>

              {status.duracaoSegundos !== undefined && status.duracaoSegundos > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" /> Duração Sessão:
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    {status.duracaoSegundos}s
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Frames Processados:</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {status.totalFramesEnviados}
                </span>
              </div>

              {status.tentativasReconexao > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Tentativas Reconexão:</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {status.tentativasReconexao}
                  </span>
                </div>
              )}

              {status.ultimoObjetoConfirmado && (
                <div className="flex items-center justify-between p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Último Confirmado:
                  </span>
                  <span className="font-black text-emerald-200 capitalize text-xs">
                    {status.ultimoObjetoConfirmado} ({status.confiancaUltimaConfirmacao || 95}%)
                  </span>
                </div>
              )}

              {status.totalRodadasDetectadasSessao !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Rodadas Registradas:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {status.totalRodadasDetectadasSessao}
                  </span>
                </div>
              )}

              {status.mensagemErro && (
                <div className="p-2 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-[11px] flex items-start gap-1.5 mt-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{status.mensagemErro}</span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>Segurança & Privacidade:</strong> A comunicação ocorre exclusivamente via backend. Nenhum áudio, vídeo, frame ou chave de API é armazenado no servidor ou banco de dados.
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <X className="w-3.5 h-3.5 text-rose-400" /> Fechar
              </button>

              <div className="flex items-center gap-2">
                {isOnline ? (
                  <button
                    type="button"
                    onClick={() => encerrarSessao()}
                    className="px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Power className="w-3.5 h-3.5 text-rose-400" /> Desconectar Live
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => iniciarSessao()}
                    disabled={isConnecting || isReconnecting}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    <Power className="w-3.5 h-3.5" />
                    {isConnecting ? 'Conectando...' : 'Iniciar Sessão Live'}
                  </button>
                )}

                {estado === 'erro' && (
                  <button
                    type="button"
                    onClick={() => reconectar()}
                    className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reconectar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
