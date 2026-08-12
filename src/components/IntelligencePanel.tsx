import React, { useEffect, useState } from 'react';
import {
  Brain,
  RefreshCw,
  Clock,
  Trophy,
  AlertTriangle,
  Flame,
  Activity,
  Layers,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem } from '../types';
import { MotorEstatisticoCards } from './MotorEstatisticoCards';

interface DashboardData {
  sucesso: boolean;
  tempoExecucaoMs: number;
  dadosInsuficientes: boolean;
  mensagemInsuficiencia?: string;
  resumo: {
    totalRodadas: number;
    sessaoAtual: string | number | null;
    ultimoResultado: {
      rodada: number | null;
      resultado: string | null;
      horario: string | null;
      criadoEm: string | null;
    } | null;
    horarioUltimoResultado: string | null;
  };
  ultimosResultados: {
    rodada: number | null;
    resultado: string;
    horario: string;
    criadoEm: string;
  }[];
  ranking: {
    posicao: number;
    objeto: string;
    quantidade: number;
    percentual: string;
    percentualNumero: number;
  }[];
  atrasos: {
    posicao: number;
    objeto: string;
    rodadasSemAparecer: number;
    ultimaOcorrenciaEm: string | null;
    descricao: string;
  }[];
  padroes: {
    padroesAtivos: {
      alternancias: {
        tipo: 'alternancia';
        objetos: [string, string];
        ocorrencias: number;
        confianca: 'BAIXA' | 'MÉDIA' | 'ALTA';
        descricao: string;
      }[];
      repeticoes: {
        tipo: 'repeticao';
        objeto: string;
        quantidadeMaiorSequencia: number;
        ocorrenciasTotais: number;
        confianca: 'BAIXA' | 'MÉDIA' | 'ALTA';
        descricao: string;
      }[];
      sequenciasFrequentes: {
        tipo: 'sequencia_frequente';
        tamanho: number;
        sequenciaTexto: string;
        quantidade: number;
        porcentagem: string;
        confianca: 'BAIXA' | 'MÉDIA' | 'ALTA';
      }[];
    };
    resumoConfiancaGeral: 'BAIXA' | 'MÉDIA' | 'ALTA';
  };
}

export const IntelligencePanel: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error(`Erro na API (${response.status})`);
      }
      const json: DashboardData = await response.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao conectar com o backend de inteligência.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // Auto refresh every 10 seconds to keep live stats updated
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const getConfiancaBadge = (confianca: 'BAIXA' | 'MÉDIA' | 'ALTA') => {
    switch (confianca) {
      case 'ALTA':
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400" /> ALTA CONFIANÇA
          </span>
        );
      case 'MÉDIA':
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
            <Activity className="w-3 h-3 text-amber-400" /> MÉDIA CONFIANÇA
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-500/20 text-slate-400 border border-slate-500/40 rounded-full flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-slate-400" /> BAIXA CONFIANÇA
          </span>
        );
    }
  };

  return (
    <div id="painel-inteligencia" className="space-y-6">
      
      {/* Header bar for Intelligence Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-500/30">
            <Brain className="w-6 h-6 text-cyan-200 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-white">
                Painel de Inteligência Estatística
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full flex items-center gap-1 uppercase">
                <Sparkles className="w-3 h-3 text-cyan-400" /> SUPABASE LIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Análise estatística e padronizações históricas processadas pelo motor do servidor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {lastUpdated && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{loading ? 'Carregando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* CARD 1: RESUMO DA SESSÃO */}
      <div id="card-resumo-sessao" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" /> Rodadas Analisadas
          </span>
          <div className="text-2xl font-black text-white mt-2">
            {data?.resumo?.totalRodadas ?? 0}{' '}
            <span className="text-xs font-semibold text-slate-500">registros</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total histórico gravado no banco</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-emerald-400" /> Último Resultado
          </span>
          <div className="flex items-center gap-2 mt-2">
            {data?.resumo?.ultimoResultado?.resultado ? (
              <>
                <span className="text-2xl">
                  {WHEEL_ITEMS[data.resumo.ultimoResultado.resultado as WheelItem]?.emoji || '❓'}
                </span>
                <span className="text-xl font-extrabold text-emerald-400 capitalize">
                  {WHEEL_ITEMS[data.resumo.ultimoResultado.resultado as WheelItem]?.label ||
                    data.resumo.ultimoResultado.resultado}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-slate-500">Nenhum</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {data?.resumo?.ultimoResultado?.rodada
              ? `Rodada #${data.resumo.ultimoResultado.rodada}`
              : 'Aguardando novas rodadas'}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Horário do Último
          </span>
          <div className="text-2xl font-black text-indigo-300 mt-2">
            {data?.resumo?.horarioUltimoResultado || '--:--:--'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Horário da última entrada gravada</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" /> Sessão Ativa
          </span>
          <div className="text-base font-extrabold text-amber-300 mt-2 truncate">
            {data?.resumo?.sessaoAtual ? `Sessão #${data.resumo.sessaoAtual}` : 'Geral'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Identificador da sessão corrente</p>
        </div>
      </div>

      {/* Aviso de Dados Insuficientes */}
      {data?.dadosInsuficientes && (
        <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-2xl text-amber-200 text-xs flex items-center gap-3 shadow-md">
          <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold block">Aviso de Poucos Registros:</span>
            <span>
              {data.mensagemInsuficiencia ||
                'O banco de dados possui menos de 5 rodadas gravadas. Adicione mais resultados para desbloquear todas as análises completas.'}
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Cards 2, 3, 4, 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CARD 2: ÚLTIMOS 20 RESULTADOS */}
        <div id="card-ultimos-resultados" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" /> Últimos 20 Resultados (Mais Recente Primeiro)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              {data?.ultimosResultados?.length || 0} registrados
            </span>
          </div>

          {(!data?.ultimosResultados || data.ultimosResultados.length === 0) ? (
            <div className="py-8 text-center text-slate-500 text-xs italic">
              Nenhum resultado registrado até o momento.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
              {data.ultimosResultados.map((item, idx) => {
                const config = WHEEL_ITEMS[item.resultado as WheelItem];
                return (
                  <div
                    key={`${item.rodada}_${idx}_${item.criadoEm}`}
                    className={`p-2.5 rounded-xl border ${
                      config?.borderColor || 'border-slate-800'
                    } ${
                      config?.bgColor || 'bg-slate-800/50'
                    } flex items-center justify-between transition-all hover:scale-[1.02]`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{config?.emoji || '❓'}</span>
                      <div className="min-w-0">
                        <span className={`text-xs font-extrabold block truncate ${config?.textColor || 'text-white'}`}>
                          {config?.label || item.resultado}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {item.horario}
                        </span>
                      </div>
                    </div>
                    {item.rodada && (
                      <span className="text-[9px] font-mono font-bold bg-slate-900/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50 shrink-0">
                        #{item.rodada}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CARD 3: RANKING DOS OBJETOS */}
        <div id="card-ranking-objetos" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> Ranking dos Objetos (Frequência Geral)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">8 Símbolos</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {data?.ranking?.map((item) => {
              const config = WHEEL_ITEMS[item.objeto as WheelItem];
              const maxQtd = data.ranking[0]?.quantidade || 1;
              const barWidth = Math.max((item.quantidade / maxQtd) * 100, 4);

              return (
                <div
                  key={item.objeto}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                          item.posicao === 1
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : item.posicao === 2
                            ? 'bg-slate-300 text-slate-950 font-black'
                            : item.posicao === 3
                            ? 'bg-amber-700 text-white font-black'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.posicao}º
                      </span>
                      <span className="text-base">{config?.emoji || '❓'}</span>
                      <span className="font-bold text-slate-200 capitalize">
                        {config?.label || item.objeto}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-mono text-[11px]">
                        {item.quantidade}x
                      </span>
                      <span className="font-bold text-cyan-400 font-mono w-14 text-right">
                        {item.percentual}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.posicao === 1
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARD 4: OBJETOS ATRASADOS */}
        <div id="card-objetos-atrasados" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" /> Objetos Atrasados (Tempo Sem Sair)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">Maior atraso atual</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {data?.atrasos?.map((item) => {
              const config = WHEEL_ITEMS[item.objeto as WheelItem];
              const isCritico = item.posicao <= 2 && item.rodadasSemAparecer > 5;

              return (
                <div
                  key={item.objeto}
                  className={`p-3 rounded-xl border ${
                    isCritico
                      ? 'bg-rose-950/20 border-rose-800/60'
                      : 'bg-slate-950/60 border-slate-800'
                  } flex items-center justify-between`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{config?.emoji || '❓'}</span>
                    <div>
                      <span className="text-xs font-extrabold text-slate-200 block capitalize">
                        {config?.label || item.objeto}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {item.descricao}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-lg font-black font-mono block ${
                        isCritico ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                      }`}
                    >
                      {item.rodadasSemAparecer}r
                    </span>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                      atraso
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARD 5: PADRÕES DETECTADOS AUTOMATICAMENTE */}
        <div id="card-padroes-detectados" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" /> Padrões Detectados Automáticos
            </h3>
            {data?.padroes?.resumoConfiancaGeral && getConfiancaBadge(data.padroes.resumoConfiancaGeral)}
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {/* Alternâncias */}
            {data?.padroes?.padroesAtivos?.alternancias && data.padroes.padroesAtivos.alternancias.length > 0 ? (
              data.padroes.padroesAtivos.alternancias.map((alt, i) => (
                <div key={`alt_${i}`} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Alternância: {alt.objetos[0]} ↔ {alt.objetos[1]}
                    </span>
                    {getConfiancaBadge(alt.confianca)}
                  </div>
                  <p className="text-[11px] text-slate-300">{alt.descricao}</p>
                </div>
              ))
            ) : null}

            {/* Repetições */}
            {data?.padroes?.padroesAtivos?.repeticoes && data.padroes.padroesAtivos.repeticoes.length > 0 ? (
              data.padroes.padroesAtivos.repeticoes.map((rep, i) => (
                <div key={`rep_${i}`} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" /> Repetição Consecutiva: {rep.objeto}
                    </span>
                    {getConfiancaBadge(rep.confianca)}
                  </div>
                  <p className="text-[11px] text-slate-300">{rep.descricao}</p>
                </div>
              ))
            ) : null}

            {/* Sequências Frequentes */}
            {data?.padroes?.padroesAtivos?.sequenciasFrequentes && data.padroes.padroesAtivos.sequenciasFrequentes.length > 0 ? (
              data.padroes.padroesAtivos.sequenciasFrequentes.slice(0, 3).map((seq, i) => (
                <div key={`seq_${i}`} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" /> Sequência de {seq.tamanho}: {seq.sequenciaTexto}
                    </span>
                    {getConfiancaBadge(seq.confianca)}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Ocorreu {seq.quantidade} vezes ({seq.porcentagem} das rodadas).
                  </p>
                </div>
              ))
            ) : null}

            {(!data?.padroes?.padroesAtivos?.alternancias?.length &&
              !data?.padroes?.padroesAtivos?.repeticoes?.length &&
              !data?.padroes?.padroesAtivos?.sequenciasFrequentes?.length) && (
              <div className="py-6 text-center text-slate-500 text-xs italic">
                Nenhum padrão marcante detectado com os dados atuais. Continue registrando mais rodadas.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* MOTOR ESTATÍSTICO AVANÇADO (PROMPT 010) */}
      <MotorEstatisticoCards />

    </div>
  );
};
