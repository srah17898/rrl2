import React from 'react';
import { RoundEntry } from '../types';
import { ITEM_KEYS, WHEEL_ITEMS } from '../data/items';
import {
  calculateFullTransitionMatrix,
  getItemDelayStats,
} from '../utils/statistics';
import { Grid, Clock, Percent, AlertCircle } from 'lucide-react';

interface MatrixViewProps {
  history: RoundEntry[];
}

export const MatrixView: React.FC<MatrixViewProps> = ({ history }) => {
  const matrix = calculateFullTransitionMatrix(history);
  const delayStats = getItemDelayStats(history);
  const totalRounds = history.length;

  return (
    <section className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <Grid className="w-5 h-5 text-cyan-400" />
            <span>Matriz Completa de Transição (8x8) & Atrasômetro</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mapeamento direto de probabilidade entre o resultado anterior (Linha) e o próximo resultado (Coluna).
          </p>
        </div>
      </div>

      {/* Transition Matrix Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-center border-collapse">
          <thead>
            <tr>
              <th className="p-2 border border-slate-700 bg-slate-900 text-slate-400 font-bold text-left min-w-[90px]">
                Item De ➔ Para
              </th>
              {ITEM_KEYS.map((colKey) => (
                <th
                  key={colKey}
                  className="p-2 border border-slate-700 bg-slate-900 text-slate-300 font-bold min-w-[60px]"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-lg">{WHEEL_ITEMS[colKey].emoji}</span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      {WHEEL_ITEMS[colKey].shortLabel}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ITEM_KEYS.map((rowKey) => {
              // Calculate total transitions from rowKey
              let rowTotal = 0;
              ITEM_KEYS.forEach((c) => {
                rowTotal += matrix[rowKey][c];
              });

              return (
                <tr key={rowKey} className="hover:bg-slate-700/30 transition-colors">
                  <td className="p-2 border border-slate-700 bg-slate-900/80 font-bold text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{WHEEL_ITEMS[rowKey].emoji}</span>
                      <span className={WHEEL_ITEMS[rowKey].textColor}>
                        {WHEEL_ITEMS[rowKey].label}
                      </span>
                    </div>
                  </td>

                  {ITEM_KEYS.map((colKey) => {
                    const count = matrix[rowKey][colKey];
                    const pct = rowTotal > 0 ? ((count / rowTotal) * 100).toFixed(0) : '0';
                    const isHigh = Number(pct) >= 30 && count > 0;

                    return (
                      <td
                        key={colKey}
                        className={`p-2 border border-slate-700 font-mono transition-colors ${
                          isHigh
                            ? 'bg-cyan-500/20 text-cyan-300 font-black'
                            : count > 0
                            ? 'bg-slate-800 text-slate-200 font-semibold'
                            : 'bg-slate-900/50 text-slate-600'
                        }`}
                        title={`De ${WHEEL_ITEMS[rowKey].label} para ${WHEEL_ITEMS[colKey].label}: ${count} vezes (${pct}%)`}
                      >
                        <div>{count}x</div>
                        <div className="text-[9px] text-slate-400">{pct}%</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delay Tracker ("Atrasômetro") */}
      <div>
        <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Atrasômetro de Objetos (Rodadas Sem Sair)</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {delayStats.map((stat) => {
            const config = WHEEL_ITEMS[stat.item];
            const isCriticalDelay = stat.roundsSinceLast >= 10 && totalRounds >= 10;

            return (
              <div
                key={stat.item}
                className={`p-3 rounded-xl border flex flex-col items-center text-center relative ${
                  config.bgColor
                } ${config.borderColor}`}
              >
                {isCriticalDelay && (
                  <span className="absolute -top-2 bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 rounded uppercase">
                    ATRASADO
                  </span>
                )}

                <span className="text-2xl my-1">{config.emoji}</span>
                <span className={`text-xs font-bold ${config.textColor}`}>
                  {config.label}
                </span>

                <div className="mt-1 text-center font-mono">
                  <span className="text-sm font-extrabold text-slate-100">
                    {stat.roundsSinceLast}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    rodadas sem sair
                  </span>
                </div>

                <div className="mt-1 text-[10px] text-slate-400 font-mono border-t border-slate-700/50 pt-1 w-full">
                  Total: {stat.totalOccurrences}x ({stat.overallPercentage}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
};
