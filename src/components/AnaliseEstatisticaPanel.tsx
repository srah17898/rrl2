import React, { useState, useEffect } from 'react';
import {
  BarChart2,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  Layers,
  Award,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { WHEEL_ITEMS, ITEM_KEYS } from '../data/items';
import { WheelItem } from '../types';

interface NextAfterResult {
  objetoPesquisado: string;
  ocorrencias: number;
  resultados: Record<string, { quantidade: number; porcentagem: number }>;
}

interface FrequencyResult {
  totalRodadas: number;
  frequencia: Record<string, { quantidade: number; porcentagem: number; porcentagemFormatada: string }>;
  ultimoResultado: string | null;
  maisFrequentes: { objeto: string; quantidade: number; porcentagem: number }[];
}

export const AnaliseEstatisticaPanel: React.FC = () => {
  const [objetoSelecionado, setObjetoSelecionado] = useState<string>('soco');
  const [nextAfterData, setNextAfterData] = useState<NextAfterResult | null>(null);
  const [frequencyData, setFrequencyData] = useState<FrequencyResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingNext, setLoadingNext] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar estatísticas gerais
  const fetchFrequency = async () => {
    try {
      const res = await fetch('/api/engine/frequency');
      if (res.ok) {
        const data = await res.json();
        setFrequencyData(data);
      }
    } catch (err: any) {
      console.error('Erro ao buscar frequências:', err);
    }
  };

  // Carregar o que vem depois do objeto selecionado
  const fetchNextAfter = async (objeto: string) => {
    setLoadingNext(true);
    try {
      const res = await fetch(`/api/engine/next-after?object=${encodeURIComponent(objeto)}`);
      if (res.ok) {
        const data = await res.json();
        setNextAfterData(data);
      }
    } catch (err: any) {
      console.error('Erro ao buscar próximo após objeto:', err);
    } finally {
      setLoadingNext(false);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchFrequency(), fetchNextAfter(objetoSelecionado)]);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados da análise estatística.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleSelectObject = (novoObjeto: string) => {
    setObjetoSelecionado(novoObjeto);
    fetchNextAfter(novoObjeto);
  };

  return (
    <section id="analise-estatistica-painel" className="bg-slate-900/95 border border-indigo-900/50 rounded-2xl p-5 shadow-2xl space-y-6">
      
      {/* HEADER DO PAINEL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <BarChart2 className="w-6 h-6 text-cyan-200" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
              ANÁLISE ESTATÍSTICA
            </h2>
            <p className="text-xs text-slate-400">
              Motor oficial de probabilidade e dados reais do Supabase (sem previsões aleatórias).
            </p>
          </div>
        </div>

        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* BLOCO 1: RESUMO (Total de rodadas, Último resultado, Mais frequentes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* TOTAL DE RODADAS */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" /> Total de Rodadas
          </span>
          <div className="mt-3">
            <div className="text-3xl font-black font-mono text-cyan-300">
              {frequencyData?.totalRodadas ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Registros acumulados no banco</p>
          </div>
        </div>

        {/* ÚLTIMO RESULTADO */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-400" /> Último Resultado
          </span>
          <div className="mt-3 flex items-center gap-3">
            {frequencyData?.ultimoResultado ? (
              <>
                <span className="text-3xl">
                  {WHEEL_ITEMS[frequencyData.ultimoResultado as WheelItem]?.emoji || '❓'}
                </span>
                <div>
                  <span className="text-lg font-black text-emerald-400 capitalize block">
                    {WHEEL_ITEMS[frequencyData.ultimoResultado as WheelItem]?.label || frequencyData.ultimoResultado}
                  </span>
                  <span className="text-[10px] text-slate-500">Mais recente registrado</span>
                </div>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-500">Nenhum registro</span>
            )}
          </div>
        </div>

        {/* MAIS FREQUENTES */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-400" /> Mais Frequentes
          </span>
          <div className="mt-2 space-y-1">
            {frequencyData?.maisFrequentes?.slice(0, 2).map((item, idx) => (
              <div key={item.objeto} className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 capitalize flex items-center gap-1.5">
                  <span>{WHEEL_ITEMS[item.objeto as WheelItem]?.emoji || '❓'}</span>
                  <span>{WHEEL_ITEMS[item.objeto as WheelItem]?.label || item.objeto}</span>
                </span>
                <span className="font-mono font-black text-amber-300">
                  {item.quantidade}x ({item.porcentagem}%)
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* BLOCO 2: PERGUNTAR "O QUE VEM DEPOIS DE?" */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/50 border border-indigo-900/60 rounded-xl p-5 space-y-5">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-indigo-200 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-cyan-400" />
              O que vem depois de?
            </h3>
            <p className="text-xs text-slate-400">
              Selecione um objeto para consultar a transição e a probabilidade exata no banco.
            </p>
          </div>

          {/* CAMPO DE SELEÇÃO */}
          <div className="flex items-center gap-2">
            <label htmlFor="select-objeto-pesquisa" className="text-xs font-bold text-slate-300 whitespace-nowrap">
              Objeto:
            </label>
            <select
              id="select-objeto-pesquisa"
              value={objetoSelecionado}
              onChange={(e) => handleSelectObject(e.target.value)}
              className="bg-slate-900 text-cyan-300 font-extrabold text-xs sm:text-sm border border-cyan-500/40 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-lg"
            >
              {ITEM_KEYS.map((itemKey) => (
                <option key={itemKey} value={itemKey}>
                  {WHEEL_ITEMS[itemKey].emoji} {WHEEL_ITEMS[itemKey].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* EXIBIÇÃO DE RESULTADO E PROBABILIDADE */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Probabilidade após "{WHEEL_ITEMS[objetoSelecionado as WheelItem]?.label || objetoSelecionado}"
            </h4>
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              Total de Ocorrências: <strong>{nextAfterData?.ocorrencias ?? 0}x</strong>
            </span>
          </div>

          {loadingNext ? (
            <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse">
              Calculando transições no banco de dados...
            </div>
          ) : !nextAfterData || nextAfterData.ocorrencias === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
              Nenhuma ocorrência registrada de "{WHEEL_ITEMS[objetoSelecionado as WheelItem]?.label || objetoSelecionado}" com sucessor no histórico.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {(Object.entries(nextAfterData.resultados) as [string, { quantidade: number; porcentagem: number }][])
                .sort(([, a], [, b]) => b.quantidade - a.quantidade)
                .map(([itemKey, stat], index) => {
                  const config = WHEEL_ITEMS[itemKey as WheelItem];
                  const isTop1 = index === 0 && stat.quantidade > 0;

                  return (
                    <div
                      key={itemKey}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isTop1
                          ? 'bg-gradient-to-br from-indigo-950/90 to-slate-900 border-cyan-500/60 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30'
                          : 'bg-slate-950/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{config?.emoji || '❓'}</span>
                          <span className="text-xs font-extrabold text-slate-200 capitalize">
                            {config?.label || itemKey}
                          </span>
                        </div>
                        {isTop1 && (
                          <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                            Mais Provável
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between mt-2 font-mono">
                        <span className="text-2xl font-black text-cyan-300">
                          {stat.porcentagem}%
                        </span>
                        <span className="text-xs text-slate-400">
                          {stat.quantidade} / {nextAfterData.ocorrencias}x
                        </span>
                      </div>

                      {/* Progresso visual */}
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mt-2 border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop1 ? 'bg-gradient-to-r from-cyan-500 to-indigo-500' : 'bg-slate-700'
                          }`}
                          style={{ width: `${Math.max(2, stat.porcentagem)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Garantia de Fidelidade:</strong> Os cálculos acima são gerados diretamente pelo <code>StatisticsEngine</code> consultando unicamente o Supabase.
          </span>
        </div>

      </div>

    </section>
  );
};
