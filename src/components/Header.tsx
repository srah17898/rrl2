import React from 'react';
import { Camera, Database, HelpCircle, Sparkles, RefreshCw, BarChart3, ShieldCheck, Brain } from 'lucide-react';
import { RoundEntry, WheelItem } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import { getItemDelayStats } from '../utils/statistics';
import { LiveStatusIndicator } from './LiveStatusIndicator';

interface HeaderProps {
  history: RoundEntry[];
  onOpenVision: () => void;
  onOpenLiveCamera?: () => void;
  onOpenAiQuery: () => void;
  onOpenDataMgmt: () => void;
  onOpenAuditoria?: () => void;
  onToggleMatrix: () => void;
  showMatrix: boolean;
  onToggleIntelligence?: () => void;
  showIntelligence?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  history,
  onOpenVision,
  onOpenLiveCamera,
  onOpenAiQuery,
  onOpenDataMgmt,
  onOpenAuditoria,
  onToggleMatrix,
  showMatrix,
  onToggleIntelligence,
  showIntelligence,
}) => {
  const totalRounds = history.length;
  const delayStats = getItemDelayStats(history);
  const mostDelayed = delayStats[0]; // Most delayed item
  const mostFrequent = [...delayStats].sort((a, b) => b.totalOccurrences - a.totalOccurrences)[0];

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center">
          
          {/* Logo and App Info */}
          <div className="flex items-center justify-center space-x-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-xl ring-2 ring-cyan-400/30 shrink-0">
              🎣
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                  Farm Fishing AI
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-cyan-400" /> PRO STATS
                </span>
                <LiveStatusIndicator />
              </div>
              <p className="text-xs text-slate-400 font-medium text-center">
                Sistema Profissional de Análise Estatística da Roda Gigante
              </p>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Total Rodadas
              </span>
              <span className="text-base font-bold text-cyan-400">{totalRounds}</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Mais Frequente
              </span>
              <span className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                {mostFrequent?.totalOccurrences > 0 ? (
                  <>
                    <span>{WHEEL_ITEMS[mostFrequent.item]?.emoji}</span>
                    <span>{WHEEL_ITEMS[mostFrequent.item]?.label}</span>
                  </>
                ) : (
                  '--'
                )}
              </span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Mais Atrasado
              </span>
              <span className="text-xs font-bold text-amber-400 flex items-center justify-center gap-1 mt-0.5">
                {mostDelayed && totalRounds > 0 ? (
                  <>
                    <span>{WHEEL_ITEMS[mostDelayed.item]?.emoji}</span>
                    <span>{mostDelayed.roundsSinceLast}r</span>
                  </>
                ) : (
                  '--'
                )}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center flex-wrap gap-2 pb-1 md:pb-0">
            {onToggleIntelligence && (
              <button
                onClick={onToggleIntelligence}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border whitespace-nowrap active:scale-95 cursor-pointer ${
                  showIntelligence
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/50 shadow-md shadow-cyan-600/30 ring-2 ring-cyan-500/20'
                    : 'bg-slate-800 text-cyan-300 hover:bg-slate-700 border-slate-700'
                }`}
              >
                <Brain className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>Inteligência</span>
              </button>
            )}

            {onOpenLiveCamera && (
              <button
                onClick={onOpenLiveCamera}
                className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all border border-emerald-400/30 whitespace-nowrap active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-200 animate-pulse" />
                <span>Câmera Live</span>
              </button>
            )}

            <button
              onClick={onOpenVision}
              className="px-3 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all border border-indigo-400/30 whitespace-nowrap active:scale-95 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-indigo-200" />
              <span>Visão AI</span>
            </button>

            {onOpenAuditoria && (
              <button
                onClick={onOpenAuditoria}
                className="px-3 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all border border-emerald-400/30 whitespace-nowrap active:scale-95 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-200" />
                <span>Auditar Histórico</span>
              </button>
            )}

            <button
              onClick={onOpenAiQuery}
              className="px-3 py-2 bg-cyan-600/90 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all border border-cyan-400/30 whitespace-nowrap active:scale-95 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-cyan-200" />
              <span>Perguntar AI</span>
            </button>

            <button
              onClick={onToggleMatrix}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border whitespace-nowrap active:scale-95 cursor-pointer ${
                showMatrix
                  ? 'bg-amber-600 text-white border-amber-400/40 shadow-md shadow-amber-600/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Matriz</span>
            </button>

            <button
              onClick={onOpenDataMgmt}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center border border-slate-700 transition-all cursor-pointer"
              title="Gerenciar Dados & Amostras"
            >
              <Database className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
