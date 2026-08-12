import React, { useState, useEffect, useCallback } from 'react';
import { RoundEntry, WheelItem } from '../types';
import { ITEM_KEYS, WHEEL_ITEMS } from '../data/items';
import {
  StatisticsEngine,
  setFallbackHistory,
  NextAfterResponse,
} from '../services/StatisticsEngine';
import {
  TrendingUp,
  Brain,
  RefreshCw,
  Award,
  ShieldCheck,
  Percent,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Sparkles,
} from 'lucide-react';

interface PredictionPanelProps {
  history: RoundEntry[];
}

/**
 * Classifica a confiabilidade da análise estatística com base nas ocorrências analisadas.
 * - 0 ocorrências: "Sem dados suficientes"
 * - 1–4 ocorrências: "Baixa amostra"
 * - 5–9 ocorrências: "Amostra moderada"
 * - 10 ou mais: "Amostra significativa"
 */
function getClassificacaoConfiabilidade(ocorrencias: number): {
  texto: string;
  badgeClass: string;
} {
  if (ocorrencias <= 0) {
    return {
      texto: 'Sem dados suficientes',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
  }
  if (ocorrencias <= 4) {
    return {
      texto: 'Baixa amostra',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    };
  }
  if (ocorrencias <= 9) {
    return {
      texto: 'Amostra moderada',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
  }
  return {
    texto: 'Amostra significativa',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  };
}

export const PredictionPanel: React.FC<PredictionPanelProps> = ({ history }) => {
  const [calculando, setCalculando] = useState<boolean>(false);
  const [statusMensagem, setStatusMensagem] = useState<string>('');
  const [nextData, setNextData] = useState<NextAfterResponse | null>(null);

  // Identifica o último resultado do histórico real
  const ultimoResultado = history.length > 0 ? history[history.length - 1].item : 'soco';

  // Função para executar o cálculo do próximo resultado
  const calcularProximoResultado = useCallback(
    async (isManual: boolean = false) => {
      setCalculando(true);
      setStatusMensagem('Analisando histórico...');

      try {
        // Atualiza fallback em memória do StatisticsEngine com o histórico local
        setFallbackHistory(
          history.map((h, i) => ({
            objeto: h.item,
            criadoEm: new Date(h.timestamp).toISOString(),
            rodada: i + 1,
          }))
        );

        // Tenta consultar a API /api/engine/next-after ou diretamente o StatisticsEngine
        let data: NextAfterResponse;
        try {
          const res = await fetch(
            `/api/engine/next-after?object=${encodeURIComponent(ultimoResultado)}`
          );
          if (res.ok) {
            data = await res.json();
          } else {
            data = await StatisticsEngine.getNextAfter(ultimoResultado);
          }
        } catch {
          data = await StatisticsEngine.getNextAfter(ultimoResultado);
        }

        setNextData(data);
        setStatusMensagem('Análise concluída');
      } catch (err) {
        console.error('Erro ao calcular próximo resultado:', err);
        setStatusMensagem('Erro no cálculo');
      } finally {
        setCalculando(false);
      }
    },
    [history, ultimoResultado]
  );

  // Re-calcula automaticamente sempre que uma nova rodada for confirmada no histórico
  useEffect(() => {
    calcularProximoResultado(false);
  }, [history.length, ultimoResultado, calcularProximoResultado]);

  // Encontra o resultado mais provável (maior porcentagem)
  let itemMaisProvavel: { objeto: string; quantidade: number; porcentagem: number } | null = null;

  if (nextData && nextData.ocorrencias > 0) {
    const ordenados = (
      Object.entries(nextData.resultados) as [
        string,
        { quantidade: number; porcentagem: number }
      ][]
    )
      .map(([objeto, stat]) => ({
        objeto,
        quantidade: stat.quantidade,
        porcentagem: stat.porcentagem,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    if (ordenados.length > 0 && ordenados[0].quantidade > 0) {
      itemMaisProvavel = ordenados[0];
    }
  }

  const confiabilidade = getClassificacaoConfiabilidade(nextData?.ocorrencias ?? 0);

  // Ordena todas as probabilidades para a distribuição
  const distribuicaoLista = nextData
    ? (
        Object.entries(nextData.resultados) as [
          string,
          { quantidade: number; porcentagem: number }
        ][]
      )
        .map(([objeto, stat]) => ({
          objeto,
          quantidade: stat.quantidade,
          porcentagem: stat.porcentagem,
        }))
        .sort((a, b) => b.porcentagem - a.porcentagem)
    : [];

  return (
    <section className="bg-slate-900/95 border border-indigo-900/60 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden space-y-6">
      {/* Glow Effect Background */}
      <div className="absolute -bottom-12 -right-12 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* PAINEL HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
              <Brain className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
              MOTOR ESTATÍSTICO — PRÓXIMO RESULTADO
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Análise estritamente matemática baseada nos dados reais do Supabase (sem sorteios ou previsões inventadas).
          </p>
        </div>

        {/* STATUS & ÚLTIMO RESULTADO RECONHECIDO */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2">
            <span className="text-slate-400 font-bold">Último resultado:</span>
            <span className="text-cyan-300 font-mono font-extrabold flex items-center gap-1 capitalize">
              <span>{WHEEL_ITEMS[ultimoResultado as WheelItem]?.emoji || '❓'}</span>
              <span>{WHEEL_ITEMS[ultimoResultado as WheelItem]?.label || ultimoResultado}</span>
            </span>
          </div>

          <button
            onClick={() => calcularProximoResultado(true)}
            disabled={calculando}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/20 border border-cyan-400/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${calculando ? 'animate-spin' : ''}`} />
            <span>{calculando ? 'Analisando histórico...' : 'CALCULAR PRÓXIMO'}</span>
          </button>
        </div>
      </div>

      {statusMensagem && (
        <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-slate-950/60 rounded-lg border border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5">
            {calculando ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Status: <strong>{statusMensagem}</strong></span>
          </span>
          <span className="text-[10px] text-slate-500 italic">Atualização Automática Ativa</span>
        </div>
      )}

      {/* BLOCO PRINCIPAL: CARD DESTAQUE "PRÓXIMO MAIS PROVÁVEL" */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CARD EM DESTAQUE */}
        <div className="lg:col-span-1 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/80 border-2 border-indigo-500/50 rounded-2xl p-6 shadow-2xl relative flex flex-col items-center justify-between text-center min-h-[320px]">
          
          <div className="w-full flex items-center justify-between border-b border-indigo-900/50 pb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              PRÓXIMO MAIS PROVÁVEL
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confiabilidade.badgeClass}`}>
              {confiabilidade.texto}
            </span>
          </div>

          {/* DADOS DE PREVISÃO */}
          {nextData && nextData.ocorrencias > 0 && itemMaisProvavel ? (
            <div className="my-4 space-y-3 w-full flex flex-col items-center">
              <div className="text-7xl filter drop-shadow-xl animate-pulse">
                {WHEEL_ITEMS[itemMaisProvavel.objeto as WheelItem]?.emoji || '❓'}
              </div>
              <h3 className="text-2xl font-black uppercase tracking-wider text-cyan-300">
                {WHEEL_ITEMS[itemMaisProvavel.objeto as WheelItem]?.label || itemMaisProvavel.objeto}
              </h3>

              <div className="bg-slate-950/90 border border-cyan-500/40 px-5 py-2 rounded-xl shadow-inner my-2">
                <span className="text-3xl font-black font-mono text-emerald-400 block">
                  {itemMaisProvavel.porcentagem.toFixed(2)}%
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  Probabilidade histórica
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <p>
                  Baseado em <strong>{nextData.ocorrencias} ocorrência{nextData.ocorrencias > 1 ? 's' : ''}</strong> de "{WHEEL_ITEMS[ultimoResultado as WheelItem]?.label || ultimoResultado}"
                </p>
                <p className="text-[10px] text-indigo-300 font-medium">
                  Estimativa estatística calculada sobre sucessores reais.
                </p>
              </div>
            </div>
          ) : (
            <div className="my-auto py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 text-amber-400/80" />
              <p className="font-extrabold text-amber-200">
                Dados insuficientes para calcular o próximo resultado.
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                O último resultado ({WHEEL_ITEMS[ultimoResultado as WheelItem]?.label || ultimoResultado}) ainda não possui histórico de rodadas posteriores registradas no banco.
              </p>
            </div>
          )}

          {/* BOTÃO INTEGRADO DENTRO DO CARD */}
          <button
            onClick={() => calcularProximoResultado(true)}
            disabled={calculando}
            className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl border border-indigo-400/40 shadow-lg flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${calculando ? 'animate-spin' : ''}`} />
            <span>{calculando ? 'Analisando histórico...' : 'CALCULAR PRÓXIMO'}</span>
          </button>
        </div>

        {/* LISTAGEM COMPLETA: DISTRIBUIÇÃO DOS POSSÍVEIS PRÓXIMOS RESULTADOS */}
        <div className="lg:col-span-2 bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  Distribuição dos possíveis próximos resultados
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Probabilidade ordenada para cada um dos 8 símbolos após "{WHEEL_ITEMS[ultimoResultado as WheelItem]?.label || ultimoResultado}".
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                {nextData?.ocorrencias ?? 0} Transições
              </span>
            </div>

            {distribuicaoLista.length === 0 || !nextData || nextData.ocorrencias === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-medium border border-dashed border-slate-800 rounded-xl">
                Aguardando registros de sucessores para exibir a distribuição percentual.
              </div>
            ) : (
              <div className="space-y-3">
                {distribuicaoLista.map((item, index) => {
                  const config = WHEEL_ITEMS[item.objeto as WheelItem];
                  const isTop1 = index === 0 && item.quantidade > 0;

                  return (
                    <div key={item.objeto} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-bold text-slate-200">
                          <span className="text-lg">{config?.emoji || '❓'}</span>
                          <span className="capitalize">{config?.label || item.objeto}</span>
                          {isTop1 && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black px-1.5 py-0.5 rounded uppercase">
                              Mais Provável
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-slate-400 text-[11px]">
                            {item.quantidade}x
                          </span>
                          <span className="font-extrabold text-cyan-300 w-16 text-right">
                            {item.porcentagem.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop1
                              ? 'bg-gradient-to-r from-cyan-400 via-indigo-500 to-emerald-400'
                              : 'bg-slate-700'
                          }`}
                          style={{ width: `${Math.max(item.porcentagem, 1.5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Baseado estritamente nas ocorrências registradas no banco.</span>
            </span>
            <span className="text-[10px] text-slate-500 italic">
              Estimativa estatística • Sem garantias de resultado
            </span>
          </div>

        </div>

      </div>
    </section>
  );
};
