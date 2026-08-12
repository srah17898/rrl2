import React, { useState } from 'react';
import { RoundEntry } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import { getRecentResults } from '../utils/statistics';
import { ListOrdered, Copy, Check, Sparkles } from 'lucide-react';

interface RecentTenPanelProps {
  history: RoundEntry[];
}

export const RecentTenPanel: React.FC<RecentTenPanelProps> = ({ history }) => {
  const [copied, setCopied] = useState(false);
  const recentTen = getRecentResults(history, 10);

  const handleCopy = () => {
    if (recentTen.length === 0) return;
    const text = recentTen
      .map((entry, i) => `${i + 1}º: ${WHEEL_ITEMS[entry.item]?.label || entry.item}`)
      .join(', ');
    navigator.clipboard.writeText(`Últimos 10 resultados da Roda: ${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-slate-100">
            Últimos 10 Resultados
          </h2>
          <span className="text-xs bg-cyan-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded-full border border-cyan-500/30">
            Ordem Cronológica Decrescente
          </span>
        </div>

        {recentTen.length > 0 && (
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Lista</span>
              </>
            )}
          </button>
        )}
      </div>

      {recentTen.length === 0 ? (
        <div className="py-6 text-center text-slate-500 text-sm">
          Nenhuma rodada registrada para exibir os 10 últimos resultados.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {recentTen.map((entry, index) => {
            const config = WHEEL_ITEMS[entry.item];
            const isMostRecent = index === 0;

            return (
              <div
                key={entry.id}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  config.bgColor
                } ${config.borderColor} ${
                  isMostRecent ? 'ring-2 ring-cyan-400 shadow-md shadow-cyan-500/20' : ''
                }`}
              >
                <div className="flex items-center justify-between w-full text-[10px] font-mono text-slate-400 mb-1">
                  <span className="font-bold text-cyan-300">{index + 1}º</span>
                  {isMostRecent && (
                    <span className="text-[8px] uppercase bg-cyan-500 text-slate-950 font-black px-1 rounded">
                      NOVO
                    </span>
                  )}
                </div>

                <span className="text-2xl filter drop-shadow my-0.5">
                  {config.emoji}
                </span>

                <span className={`text-xs font-bold ${config.textColor}`}>
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
