import React, { useState, useMemo } from 'react';
import {
  Target,
  Sparkles,
  TrendingUp,
  BarChart2,
  Plus,
  Minus,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Flame,
  Layers,
  Activity,
  Award,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { WheelItem } from '../types';
import { WHEEL_ITEMS } from '../data/items';
import { UserStrategy, CandidateScore, WHEEL_ITEM_METAS } from '../types/wheelAnalysis';
import { runWheelFullAnalysis } from '../services/wheelAnalysisService';
import { formatStrategyLabel } from '../services/wheelStrategyService';

interface WheelAnalysisEnginePanelProps {
  history: WheelItem[];
}

export const WheelAnalysisEnginePanel: React.FC<WheelAnalysisEnginePanelProps> = ({ history }) => {
  const [strategy, setStrategy] = useState<UserStrategy>({ lowCount: 3, highCount: 1 });
  const [expandedItem, setExpandedItem] = useState<WheelItem | null>(null);
  const [activeTab, setActiveTab] = useState<'original' | 'compressed' | 'lows'>('original');
  const [showBacktestDetails, setShowBacktestDetails] = useState<boolean>(false);

  // Run analysis engine recalculation automatically whenever history or strategy changes
  const analysis = useMemo(() => {
    return runWheelFullAnalysis(history, strategy);
  }, [history, strategy]);

  const handleLowChange = (delta: number) => {
    setStrategy((prev) => ({
      ...prev,
      lowCount: Math.max(0, Math.min(4, prev.lowCount + delta)),
    }));
  };

  const handleHighChange = (delta: number) => {
    setStrategy((prev) => ({
      ...prev,
      highCount: Math.max(0, Math.min(4, prev.highCount + delta)),
    }));
  };

  const getConfidenceBadge = (confidence: CandidateScore['confidence']) => {
    switch (confidence) {
      case 'Alta':
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400" /> Confiança Alta
          </span>
        );
      case 'Média':
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
            <Activity className="w-3 h-3 text-amber-400" /> Confiança Média
          </span>
        );
      case 'Baixa':
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-slate-500/20 text-slate-400 border border-slate-500/40 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-slate-400" /> Confiança Baixa
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-rose-400" /> Dados Insuficientes
          </span>
        );
    }
  };

  const renderCandidateCard = (candidate: CandidateScore, rankIndex: number) => {
    const config = WHEEL_ITEMS[candidate.item];
    const isExpanded = expandedItem === candidate.item;
    const rankMedals = ['🥇', '🥈', '🥉', '4º'];
    const medal = rankMedals[rankIndex] || `${rankIndex + 1}º`;

    return (
      <div
        key={candidate.item}
        className={`bg-slate-950/80 border ${
          candidate.score >= 70
            ? 'border-emerald-500/40 bg-emerald-950/10'
            : 'border-slate-800'
        } rounded-2xl p-4 shadow-lg transition-all hover:border-slate-700`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black">{medal}</span>
            <span className="text-2xl">{config?.emoji || '❓'}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white capitalize">
                  {config?.label || candidate.item}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {candidate.multiplier}x
                </span>
              </div>
              <span className="text-xs text-slate-400 block font-mono">
                Prob. Estimada: {(candidate.estimatedProbability * 100).toFixed(1)}% | Retorno 10R$: R${' '}
                {candidate.multiplier * 10}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xl font-black text-cyan-400 font-mono block">
                {candidate.score}%
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Score Engine
              </span>
            </div>
            {getConfidenceBadge(candidate.confidence)}
            <button
              onClick={() => setExpandedItem(isExpanded ? null : candidate.item)}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-700 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
            >
              <span>Por que {config?.label}?</span>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Audit Explanation */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 bg-slate-900/60 p-3 rounded-xl space-y-2 text-xs">
            <span className="font-extrabold text-cyan-300 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <Info className="w-3.5 h-3.5 text-cyan-400" /> Detalhamento Auditável (Por Que {config?.label}?):
            </span>
            <ul className="space-y-1 text-slate-300 list-disc pl-4 font-medium">
              {candidate.reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* HEADER SECTION */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-500/30">
            <BarChart2 className="w-6 h-6 text-cyan-200" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              Motor de Análise Estatística e Padrões
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full flex items-center gap-1 uppercase">
                <Sparkles className="w-3 h-3 text-cyan-400" /> REAL-TIME ENGINE
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Análise em tempo real de sequências, ciclos de baixos, repetições, janelas e probabilidade estimada.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>Amostra Real: <strong>{analysis.sampleSize}</strong> rodadas</span>
        </div>
      </div>

      {/* SECTION 1: ESTRATÉGIA DA RODA */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Target className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-black uppercase tracking-wider text-white">
            🎯 ESTRATÉGIA DA RODA
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-center">
          {/* Controls for Lows */}
          <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Quantos Baixos você quer jogar?
              </span>
              <span className="text-lg font-black text-cyan-400">
                {strategy.lowCount} {strategy.lowCount === 1 ? 'BAIXO' : 'BAIXOS'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLowChange(-1)}
                disabled={strategy.lowCount <= 0}
                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg flex items-center justify-center text-white transition-all cursor-pointer font-bold"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleLowChange(1)}
                disabled={strategy.lowCount >= 4}
                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg flex items-center justify-center text-white transition-all cursor-pointer font-bold"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Controls for Highs */}
          <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Quantos Altos você quer jogar?
              </span>
              <span className="text-lg font-black text-amber-400">
                {strategy.highCount} {strategy.highCount === 1 ? 'ALTO' : 'ALTOS'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleHighChange(-1)}
                disabled={strategy.highCount <= 0}
                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg flex items-center justify-center text-white transition-all cursor-pointer font-bold"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleHighChange(1)}
                disabled={strategy.highCount >= 4}
                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg flex items-center justify-center text-white transition-all cursor-pointer font-bold"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Result Strategy Summary */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-950 to-indigo-950/40 border border-cyan-500/30 p-4 rounded-xl text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Estratégia Configurada:
            </span>
            <span className="text-xl font-black text-cyan-300 font-mono block mt-1">
              {formatStrategyLabel(strategy)}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 2: ANÁLISE DA PRÓXIMA RODADA */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              🔮 ANÁLISE DA PRÓXIMA RODADA
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Apresentando os melhores candidatos para a próxima rodada
          </span>
        </div>

        {analysis.sampleSize < 5 ? (
          <div className="p-6 bg-amber-950/30 border border-amber-800/60 rounded-xl text-amber-200 text-xs flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <span className="font-extrabold text-sm block">DADOS INSUFFICIENTES</span>
              <span>
                São necessárias pelo menos 5 rodadas registradas no histórico real para gerar recomendações auditáveis com confiança.
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LOW CANDIDATES */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>Candidatos Baixos ({analysis.recommendation.topLows.length})</span>
                <span className="text-xs text-slate-400 font-normal">5x Multiplicador</span>
              </h4>
              {analysis.recommendation.topLows.length === 0 ? (
                <div className="p-4 bg-slate-950/60 rounded-xl text-xs text-slate-500 italic">
                  Estratégia configurada para 0 Baixos.
                </div>
              ) : (
                analysis.recommendation.topLows.map((c, i) => renderCandidateCard(c, i))
              )}
            </div>

            {/* HIGH CANDIDATES */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center justify-between">
                <span>Candidatos Altos ({analysis.recommendation.topHighs.length})</span>
                <span className="text-xs text-slate-400 font-normal">10x - 45x Multiplicadores</span>
              </h4>
              {analysis.recommendation.topHighs.length === 0 ? (
                <div className="p-4 bg-slate-950/60 rounded-xl text-xs text-slate-500 italic">
                  Estratégia configurada para 0 Altos.
                </div>
              ) : (
                analysis.recommendation.topHighs.map((c, i) => renderCandidateCard(c, i))
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: PADRÕES DETECTADOS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-black uppercase tracking-wider text-white">
            📊 PADRÕES DETECTADOS
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Ciclo dos Baixos
            </span>
            <span className="text-xl font-black text-cyan-400 font-mono block mt-1">
              {analysis.lowCycles.cycleCompletionRate}%
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Taxa de conclusão dos 4 baixos
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Repetição Após Alto
            </span>
            <span className="text-xl font-black text-amber-400 font-mono block mt-1">
              {analysis.repetitionAfterHigh.repeatLastLowRate}%
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Frequência de repetir último baixo
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Frequência de Duplas
            </span>
            <span className="text-xl font-black text-purple-400 font-mono block mt-1">
              {analysis.patternAnalysis.doublePatternRatePercent}%
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {analysis.patternAnalysis.doublesCount} duplas detectadas
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Altos nos Últimos 10
            </span>
            <span className="text-xl font-black text-emerald-400 font-mono block mt-1">
              {analysis.highDensity.highsInLastTen}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Quantidade na janela 10
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Distância do Último Alto
            </span>
            <span className="text-xl font-black text-rose-400 font-mono block mt-1">
              {analysis.highDensity.lastHighDistance} r
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              rodadas sem sair ALTO
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 4: HISTÓRICO & VISUALIZAÇÕES ANALÍTICAS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              📈 HISTÓRICO E TRANSFORMADORES
            </h3>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setActiveTab('original')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'original'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Original ({analysis.originalHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('compressed')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'compressed'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Comprimido ({analysis.compressedHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('lows')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'lows'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Apenas Baixos ({analysis.filteredLowHistory.length})
            </button>
          </div>
        </div>

        {/* Display selected history format */}
        {(() => {
          const displayItems =
            activeTab === 'original'
              ? analysis.originalHistory
              : activeTab === 'compressed'
              ? analysis.compressedHistory
              : analysis.filteredLowHistory;

          if (displayItems.length === 0) {
            return (
              <div className="py-8 text-center text-slate-500 text-xs italic">
                Nenhum registro encontrado nesta visualização.
              </div>
            );
          }

          return (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {displayItems.slice(-30).map((item, idx) => {
                const config = WHEEL_ITEMS[item];
                const meta = WHEEL_ITEM_METAS[item];
                return (
                  <div
                    key={idx}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl border ${
                      meta?.category === 'ALTO'
                        ? 'border-amber-500/40 bg-amber-950/20 text-amber-300'
                        : 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300'
                    } flex items-center gap-1.5 text-xs font-extrabold`}
                  >
                    <span>{config?.emoji}</span>
                    <span className="capitalize">{config?.label || item}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* SECTION 5: BACKTEST / SIMULAÇÃO HISTÓRICA */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              🧪 BACKTESTING (SIMULAÇÃO HISTÓRICA)
            </h3>
          </div>

          <button
            onClick={() => setShowBacktestDetails(!showBacktestDetails)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>{showBacktestDetails ? 'Ocultar Detalhes' : 'Ver Detalhes do Teste'}</span>
            {showBacktestDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Rodadas Simuladas
            </span>
            <span className="text-2xl font-black text-white font-mono block mt-1">
              {analysis.backtest.totalSimulatedRounds}
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Acertos ({formatStrategyLabel(strategy)})
            </span>
            <span className="text-2xl font-black text-emerald-400 font-mono block mt-1">
              {analysis.backtest.hits} / {analysis.backtest.totalSimulatedRounds}
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Taxa de Acerto Real (Hit Rate)
            </span>
            <span className="text-2xl font-black text-cyan-400 font-mono block mt-1">
              {analysis.backtest.hitRatePercent}%
            </span>
          </div>
        </div>

        {showBacktestDetails && analysis.backtest.details.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-800/80 max-h-60 overflow-y-auto pr-1 space-y-2">
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
              Histórico Retrospectivo da Simulação (Lógica sem Vazamento de Dados Futuros):
            </span>
            {analysis.backtest.details.map((round) => (
              <div
                key={round.roundIndex}
                className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-400 font-bold">#{round.roundIndex}</span>
                  <span className="text-slate-200">
                    Real: <strong>{WHEEL_ITEMS[round.actualItem]?.label || round.actualItem}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-mono text-[11px]">
                    Recomendados: {round.recommendedItems.map((item) => WHEEL_ITEMS[item]?.label || item).join(', ')}
                  </span>
                  {round.hit ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> ACERTO
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> ERRO
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
