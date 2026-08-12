import React from 'react';
import { ITEM_KEYS, WHEEL_ITEMS } from '../data/items';
import { WheelItem } from '../types';
import { PlusCircle, Info } from 'lucide-react';

interface QuickAddBarProps {
  onAddItem: (item: WheelItem) => void;
  lastAddedItem?: WheelItem | null;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({ onAddItem, lastAddedItem }) => {
  return (
    <section className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Glow highlight */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-cyan-400" />
            <span>Registrar Rodada Individual</span>
          </h2>
          <p className="text-xs text-slate-400">
            Clique no item correspondente ao resultado sorteado na Roda Gigante.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
          <Info className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Regra Importante:</strong> Resultados iguais consecutivos (ex: Boia, Boia) representam rodadas diferentes e devem ser registrados individualmente.
          </span>
        </div>
      </div>

      {/* Grid of 8 items */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3 mt-4">
        {ITEM_KEYS.map((itemKey) => {
          const config = WHEEL_ITEMS[itemKey];
          const isJustAdded = lastAddedItem === itemKey;

          return (
            <button
              key={itemKey}
              onClick={() => onAddItem(itemKey)}
              className={`group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-150 cursor-pointer text-center ${config.bgColor} ${config.borderColor} hover:scale-105 active:scale-95 shadow-md hover:shadow-lg ${
                isJustAdded ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900' : ''
              }`}
            >
              <span className="text-3xl mb-1 filter drop-shadow group-hover:scale-110 transition-transform">
                {config.emoji}
              </span>
              <span className={`text-xs font-bold ${config.textColor}`}>
                {config.label}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5 font-medium">
                +1 Rodada
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
