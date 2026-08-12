import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Clock,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
} from 'lucide-react';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem } from '../types';

interface MotorEstatisticoData {
  sucesso: boolean;
  dadosInsuficientes: boolean;
  mensagem?: string;
  frequencias: {
    janela20: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }>;
    janela50: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }>;
    janela100: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }>;
    janela500: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }>;
    historicoCompleto: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }>;
  };
  atrasos: Record<
    string,
    {
      objeto: string;
      atrasoAtual: number;
      maiorAtrasoHistorico: number;
      atrasoMedio: number;
      ultimaOcorrenciaEm: string | null;
    }
  >;
  intervalos: Record<
    string,
    {
      objeto: string;
      intervalos: number[];
      intervaloMedio: number;
      intervaloMinimo: number;
      intervaloMaximo: number;
      totalOcorrencias: number;
    }
  >;
  distribuicao: {
    objeto: string;
    frequencia: number;
    percentual: number;
    percentualFormatado: string;
    posicaoRanking: number;
  }[];
  desvios: {
    objeto: string;
    percentualHistorico: number;
    percentualRecente: number;
    diferencaPercentual: number;
    diferencaFormatada: string;
    nivelDesvio: 'normal' | 'moderado' | 'alto';
    impacto: 'acima_da_media' | 'abaixo_da_media' | 'estavel';
  }[];
  confianca: {
    totalRodadas: number;
    nivelGeral: 'baixa' | 'media' | 'alta';
    descricao: string;
  };
  tempoCalculoMs?: number;
  rodadasUtilizadas?: number;
  fromCache?: boolean;
}

export const MotorEstatisticoCards: React.FC = () => {
  const [data, setData] = useState<MotorEstatisticoData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [janelaSelecionada, setJanelaSelecionada] = useState<'janela20' | 'janela50' | 'janela100' | 'janela500' | 'historicoCompleto'>('historicoCompleto');

  const fetchEstatisticas = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/estatisticas');
      if (!res.ok) {
        throw new Error(`Erro na API de estatísticas (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar estatísticas do motor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstatisticas();
  }, []);

  const getConfiancaBadge = (nivel: 'baixa' | 'media' | 'alta' | 'BAIXA' | 'MÉDIA' | 'ALTA') => {
    const norm = String(nivel).toLowerCase();
    if (norm === 'alta') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" /> Confiança Alta
        </span>
      );
    }
    if (norm === 'media' || norm === 'média') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-amber-400" /> Confiança Média
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 text-rose-400" /> Confiança Baixa
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-400">Calculando Motor Estatístico Avançado...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
        <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
        <p className="text-xs font-bold text-rose-300">Falha ao carregar Motor Estatístico</p>
        <p className="text-[11px] text-slate-400">{error}</p>
        <button
          onClick={fetchEstatisticas}
          className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (data.dadosInsuficientes) {
    return (
      <div className="bg-slate-900/90 border border-amber-800/60 rounded-2xl p-6 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <h4 className="text-sm font-black uppercase tracking-wider text-amber-300">
          Base Histórica Insuficiente
        </h4>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          {data.mensagem || 'Base histórica insuficiente para uma análise confiável.'}
        </p>
        <p className="text-[11px] text-slate-500">
          Forneça pelo menos 5 a 20 rodadas no histórico para liberar o motor estatístico completo.
        </p>
      </div>
    );
  }

  const freqJanelaAtual: Record<string, { quantidade: number; percentual: number; percentualFormatado: string }> =
    data.frequencias[janelaSelecionada] || {};

  return (
    <div className="space-y-6">

      {/* HEADER DO MOTOR ESTATÍSTICO */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-4 border border-indigo-900/40 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-base font-black uppercase tracking-wider text-indigo-200 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Motor Estatístico Avançado (FASE 5)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Fonte oficial centralizada para cálculos probabilísticos, intervalos, desvios e índices de confiança.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data.confianca && getConfiancaBadge(data.confianca.nivelGeral)}

          <button
            onClick={fetchEstatisticas}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 flex items-center gap-1.5 text-xs font-bold"
            title="Recalcular Estatísticas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{data.fromCache ? 'Cache' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {/* GRID COM OS 4 CARTÕES SOLICITADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* CARTÃO 1: FREQUÊNCIA DOS 8 OBJETOS */}
        <div id="card-frequencia-motor" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" /> Frequência dos 8 Objetos
            </h3>

            {/* SELETOR DE JANELAS */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
              <button
                onClick={() => setJanelaSelecionada('janela20')}
                className={`px-2 py-0.5 rounded transition ${
                  janelaSelecionada === 'janela20' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                20r
              </button>
              <button
                onClick={() => setJanelaSelecionada('janela50')}
                className={`px-2 py-0.5 rounded transition ${
                  janelaSelecionada === 'janela50' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                50r
              </button>
              <button
                onClick={() => setJanelaSelecionada('janela100')}
                className={`px-2 py-0.5 rounded transition ${
                  janelaSelecionada === 'janela100' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                100r
              </button>
              <button
                onClick={() => setJanelaSelecionada('historicoCompleto')}
                className={`px-2 py-0.5 rounded transition ${
                  janelaSelecionada === 'historicoCompleto' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tudo
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(freqJanelaAtual)
              .sort(([, a], [, b]) => b.quantidade - a.quantidade)
              .map(([obj, stat]) => {
                const config = WHEEL_ITEMS[obj as WheelItem];
                const pct = stat.percentual || 0;

                return (
                  <div key={obj} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{config?.emoji || '❓'}</span>
                        <span className="font-extrabold text-slate-200 capitalize">
                          {config?.label || obj}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono font-bold text-[11px]">
                          {stat.quantidade}x
                        </span>
                        <span className="font-mono font-black text-cyan-300 w-12 text-right">
                          {stat.percentualFormatado}
                        </span>
                      </div>
                    </div>

                    {/* BARRA DE PROGRESSO ESTATÍSTICA */}
                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800/80">
                      <div
                        className="bg-gradient-to-r from-cyan-600 to-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* CARTÃO 2: INTERVALOS MÉDIOS ENTRE APARECIÇÕES */}
        <div id="card-intervalos-motor" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Intervalo Médio de Aparição
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Distância em rodadas
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {(Object.values(data.intervalos || {}) as {
              objeto: string;
              intervalos: number[];
              intervaloMedio: number;
              intervaloMinimo: number;
              intervaloMaximo: number;
              totalOcorrencias: number;
            }[]).map((item) => {
              const config = WHEEL_ITEMS[item.objeto as WheelItem];
              return (
                <div
                  key={item.objeto}
                  className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{config?.emoji || '❓'}</span>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block capitalize">
                        {config?.label || item.objeto}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Min: {item.intervaloMinimo}r | Máx: {item.intervaloMaximo}r
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-black font-mono text-amber-400 block">
                      {item.intervaloMedio}r
                    </span>
                    <span className="text-[9px] font-bold uppercase text-slate-500">
                      média
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARTÃO 3: DETECÇÃO DE DESVIOS DA MÉDIA */}
        <div id="card-desvios-motor" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-rose-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-400" /> Detecção de Desvios Especiais
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              100r vs Histórico
            </span>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {data.desvios?.map((desvio) => {
              const config = WHEEL_ITEMS[desvio.objeto as WheelItem];
              const isAcima = desvio.impacto === 'acima_da_media';
              const isAbaixo = desvio.impacto === 'abaixo_da_media';
              const isAlto = desvio.nivelDesvio === 'alto';

              return (
                <div
                  key={desvio.objeto}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    isAlto
                      ? 'bg-rose-950/30 border-rose-800/60'
                      : desvio.nivelDesvio === 'moderado'
                      ? 'bg-amber-950/20 border-amber-800/50'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{config?.emoji || '❓'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200 capitalize">
                          {config?.label || desvio.objeto}
                        </span>
                        {isAlto && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Desvio Alto
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Recente: {desvio.percentualRecente}% | Histórico: {desvio.percentualHistorico}%
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-1.5">
                    {isAcima ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    ) : isAbaixo ? (
                      <ArrowDownRight className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Minus className="w-4 h-4 text-slate-500" />
                    )}

                    <span
                      className={`text-sm font-black font-mono ${
                        isAcima ? 'text-emerald-400' : isAbaixo ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {desvio.diferencaFormatada}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARTÃO 4: ÍNDICE DE CONFIANÇA DAS ANÁLISES */}
        <div id="card-confianca-motor" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Índice de Confiança do Motor
            </h3>
            {data.confianca && getConfiancaBadge(data.confianca.nivelGeral)}
          </div>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Volume de Amostras</span>
                <span className="font-mono text-emerald-400 font-extrabold">{data.confianca.totalRodadas} rodadas</span>
              </div>

              {/* BARRA DE VOLUME DE CONFIANÇA */}
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    data.confianca.nivelGeral === 'alta'
                      ? 'bg-emerald-500'
                      : data.confianca.nivelGeral === 'media'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, (data.confianca.totalRodadas / 120) * 100)}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                {data.confianca.descricao}
              </p>
            </div>

            {/* CRITÉRIOS DE CONFIANÇA DA REGRA */}
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className={`p-2 rounded-lg border ${data.confianca.totalRodadas < 20 ? 'bg-rose-950/30 border-rose-800 text-rose-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'}`}>
                <span className="font-bold block uppercase">Baixa</span>
                <span>&lt; 20 rodadas</span>
              </div>

              <div className={`p-2 rounded-lg border ${data.confianca.totalRodadas >= 20 && data.confianca.totalRodadas <= 100 ? 'bg-amber-950/30 border-amber-800 text-amber-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'}`}>
                <span className="font-bold block uppercase">Média</span>
                <span>20 - 100 rodadas</span>
              </div>

              <div className={`p-2 rounded-lg border ${data.confianca.totalRodadas > 100 ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300' : 'bg-slate-950/60 border-slate-800 text-slate-500'}`}>
                <span className="font-bold block uppercase">Alta</span>
                <span>&gt; 100 rodadas</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
