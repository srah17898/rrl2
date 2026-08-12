import React from 'react';
import { RoundEntry } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import { ArrowLeft, ArrowRight, History, Trash2, RotateCcw } from 'lucide-react';

interface VisualHistoryBarProps {
  history: RoundEntry[];
  onRemoveEntry: (id: string) => void;
  onUndoLast: () => void;
}

export const VisualHistoryBar: React.FC<VisualHistoryBarProps> = ({
  history,
  onRemoveEntry,
  onUndoLast,
}) => {
  // Ordered from newest (left) to oldest (right)
  const newestToOldest = [...history].reverse();

  return (
    <section className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Header with directional rules */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-slate-100">Histórico Visual da Roda</h2>
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
            {history.length} rodadas
          </span>
        </div>

        {/* Direction Indicator Banner as strictly requested by user rules */}
        <div className="flex items-center gap-2 text-xs font-bold bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-200">
          <span className="flex items-center gap-1 text-cyan-400">
            <ArrowLeft className="w-4 h-4 animate-pulse" />
            <span>LADO ESQUERDO (Mais Recentes)</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span>(Mais Antigos) LADO DIREITO</span>
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>

        {/* Undo button */}
        {history.length > 0 && (
          <button
            onClick={onUndoLast}
            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors self-start sm:self-auto cursor-pointer"
            title="Desfazer último registro"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Desfazer</span>
          </button>
        )}
      </div>

      {/* History Items Strip */}
      {newestToOldest.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm italic border-2 border-dashed border-slate-700/50 rounded-xl">
          Nenhum resultado registrado ainda. Registre uma rodada acima ou use a Visão AI.
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-slate-700">
            {newestToOldest.map((entry, index) => {
              const config = WHEEL_ITEMS[entry.item];
              const isLatest = index === 0;

              return (
                <div
                  key={entry.id}
                  className={`group relative shrink-0 flex flex-col items-center justify-center p-2.5 min-w-[72px] sm:min-w-[80px] rounded-xl border transition-all ${
                    config.bgColor
                  } ${config.borderColor} ${
                    isLatest
                      ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20 scale-105 z-10'
                      : 'hover:scale-105'
                  }`}
                >
                  {isLatest && (
                    <span className="absolute -top-2 bg-cyan-500 text-slate-950 font-black text-[9px] px-1.5 py-0.2 rounded-full uppercase tracking-tight shadow">
                      ÚLTIMO
                    </span>
                  )}

                  <span className="text-2xl sm:text-3xl filter drop-shadow my-0.5">
                    {config.emoji}
                  </span>

                  <span className={`text-[11px] font-bold ${config.textColor}`}>
                    {config.label}
                  </span>

                  <span className="text-[9px] text-slate-400 mt-0.5 font-mono">
                    #{history.length - index}
                  </span>

                  {/* Hover Delete Button */}
                  <button
                    onClick={() => onRemoveEntry(entry.id)}
                    className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md cursor-pointer"
                    title="Excluir esta rodada"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
