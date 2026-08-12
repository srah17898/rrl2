import React, { useState, useRef } from 'react';
import { RelatorioAuditoria, WheelItem } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import {
  ShieldCheck,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileSearch,
  CheckSquare,
  AlertCircle,
  Database,
  Camera,
} from 'lucide-react';

interface AuditoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCorrecoesAplicadas?: () => void;
}

export const AuditoriaModal: React.FC<AuditoriaModalProps> = ({
  isOpen,
  onClose,
  onCorrecoesAplicadas,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioAuditoria | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplyingCorrections, setIsApplyingCorrections] = useState(false);
  const [resultadoCorrecao, setResultadoCorrecao] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Listener para tecla Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        setRelatorio(null);
        setErrorMessage(null);
        setResultadoCorrecao(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAuditarImagem = async () => {
    if (!imagePreview) return;

    try {
      setIsAuditing(true);
      setErrorMessage(null);
      setResultadoCorrecao(null);

      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao auditar a imagem.');
      }

      setRelatorio(data);
    } catch (err: any) {
      console.error('Erro na auditoria:', err);
      setErrorMessage(err.message || 'Ocorreu um erro ao auditar a imagem do histórico.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAplicarCorrecoesConfirmadas = async () => {
    if (!relatorio || !relatorio.sugestaoCorrecoes || relatorio.sugestaoCorrecoes.length === 0) {
      return;
    }

    try {
      setIsApplyingCorrections(true);
      setErrorMessage(null);

      const res = await fetch('/api/auditoria/aplicar-correcoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correcoes: relatorio.sugestaoCorrecoes,
          usuarioConfirmou: true,
          usuarioNome: 'operador_auditoria',
          sessaoId: relatorio.sessaoId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao aplicar correções no banco de dados.');
      }

      setResultadoCorrecao(
        `✅ ${data.correcoesAplicadas} correção(ões) aplicada(s) com sucesso! Logs gravados.`
      );
      setConfirmModalOpen(false);

      if (onCorrecoesAplicadas) {
        onCorrecoesAplicadas();
      }

      // Re-executar auditoria para demonstrar que agora o histórico está idêntico
      setTimeout(() => {
        handleAuditarImagem();
      }, 800);
    } catch (err: any) {
      console.error('Erro ao aplicar correções:', err);
      setErrorMessage(err.message || 'Erro ao salvar correções de auditoria no banco.');
    } finally {
      setIsApplyingCorrections(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      {/* Backdrop clicável fora do modal */}
      <div
        onClick={() => {
          onClose();
        }}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer"
        title="Clique fora para fechar"
      />

      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl relative z-10 my-auto max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-white flex items-center gap-2">
                Auditoria Inteligente do Histórico por Imagem
              </h2>
              <p className="text-xs text-slate-400 hidden xs:block">
                Compare o histórico do Supabase com a barra visual da foto para identificar divergências
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Sair / Fechar Auditoria"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>SAIR</span>
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* File Upload Box */}
          <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-5 text-center transition-colors bg-slate-950/40">
            {imagePreview ? (
              <div className="space-y-4">
                <div className="relative max-h-52 overflow-hidden rounded-lg border border-slate-700 mx-auto max-w-lg bg-black flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Barra de histórico para auditoria"
                    className="object-contain max-h-52 w-full"
                  />
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Trocar Imagem</span>
                  </button>
                  <button
                    onClick={handleAuditarImagem}
                    disabled={isAuditing}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    {isAuditing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Auditando com Visão AI...</span>
                      </>
                    ) : (
                      <>
                        <FileSearch className="w-4 h-4" />
                        <span>Auditar Histórico Agora</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer py-6 flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    Selecione ou tire uma foto da barra de histórico da Roda
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Suporta JPG, PNG, WEBP (A IA alinhará da esquerda para a direita)
                  </p>
                </div>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {resultadoCorrecao && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{resultadoCorrecao}</span>
            </div>
          )}

          {/* Relatório de Auditoria Display */}
          {relatorio && (
            <div className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-xl p-4 sm:p-5">
              {/* Report Header summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                      relatorio.status === 'identico'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {relatorio.status === 'identico' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> 100% IDÊNTICO
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" /> DIVERGÊNCIAS ENCONTRADAS
                      </>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">
                    Confiança Visual: <strong className="text-slate-200">{relatorio.confianca}</strong>
                  </span>
                </div>

                <div className="text-xs text-slate-400">
                  Rodadas Comparadas: <strong className="text-cyan-400">{relatorio.rodadasComparadas}</strong>
                </div>
              </div>

              {/* Message */}
              <p className="text-xs text-slate-300 font-medium">{relatorio.mensagem}</p>

              {/* Itens visualizados vs Banco */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] font-bold uppercase text-slate-400 block mb-2">
                    📸 Na Imagem (Esquerda → Direita):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {relatorio.itensImagem.map((item, idx) => {
                      const itemObj = WHEEL_ITEMS[item as WheelItem];
                      return (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] font-semibold text-slate-200 flex items-center gap-1"
                        >
                          <span>{itemObj?.emoji || '❓'}</span>
                          <span>{itemObj?.label || item}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] font-bold uppercase text-slate-400 block mb-2">
                    🗄️ No Banco Supabase (Recentes):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {relatorio.itensBanco.map((rec, idx) => {
                      const itemObj = WHEEL_ITEMS[rec.item as WheelItem];
                      return (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] font-semibold text-slate-200 flex items-center gap-1"
                        >
                          <span>{itemObj?.emoji || '❓'}</span>
                          <span>{itemObj?.label || rec.item}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lista de Divergências */}
              {relatorio.divergencias.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Divergências Detectadas ({relatorio.totalDivergencias})</span>
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {relatorio.divergencias.map((div, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-900/90 border border-amber-500/20 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {div.tipo.replace('_', ' ')} (Posição {div.posicao})
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            Banco: <strong className="text-slate-200">{div.resultadoBanco || 'N/A'}</strong> | Imagem: <strong className="text-emerald-400">{div.resultadoImagem || 'N/A'}</strong>
                          </span>
                        </div>
                        <p className="text-slate-300">{div.descricao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sugestões de Correção & Botão de Confirmação */}
              {relatorio.podeCorrigir && relatorio.sugestaoCorrecoes.length > 0 && (
                <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    Sugestões de Ajuste: <strong className="text-emerald-400">{relatorio.sugestaoCorrecoes.length} ação(ões)</strong>
                  </div>
                  <button
                    onClick={() => setConfirmModalOpen(true)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Aplicar Correções no Banco de Dados</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && relatorio && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                Confirmar Correções no Banco
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Você está prestes a aplicar <strong className="text-emerald-400">{relatorio.sugestaoCorrecoes.length} correção(ões)</strong> no banco de dados Supabase para alinhar o histórico com a foto auditada.
            </p>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Atenção de Segurança:</strong> As alterações serão salvas com registro oficial nos logs de auditoria. O sistema jamais faz alterações automáticas sem esta confirmação.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAplicarCorrecoesConfirmadas}
                disabled={isApplyingCorrections}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                {isApplyingCorrections ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Aplicando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sim, Confirmar e Salvar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
