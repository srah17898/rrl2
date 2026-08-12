import React, { useState, useEffect } from 'react';
import { RoundEntry, WheelItem } from './types';
import { LiveResultPayload } from './types/live';
import { INITIAL_SAMPLE_HISTORY, WHEEL_ITEMS } from './data/items';
import { canSyncResultToDashboard } from './services/dashboardSync';
import { Header } from './components/Header';
import { QuickAddBar } from './components/QuickAddBar';
import { VisualHistoryBar } from './components/VisualHistoryBar';
import { RecentTenPanel } from './components/RecentTenPanel';
import { PredictionPanel } from './components/PredictionPanel';
import { ComputerVisionModal } from './components/ComputerVisionModal';
import { AIChatQueryModal } from './components/AIChatQueryModal';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { MatrixView } from './components/MatrixView';
import { DataManagementModal } from './components/DataManagementModal';
import { IntelligencePanel } from './components/IntelligencePanel';
import { AuditoriaModal } from './components/AuditoriaModal';
import { LiveCamera } from './components/LiveCamera';
import { AnaliseEstatisticaPanel } from './components/AnaliseEstatisticaPanel';
import { WheelAnalysisEnginePanel } from './components/WheelAnalysisEnginePanel';

const LOCAL_STORAGE_KEY = 'farm_fishing_ai_history_v1';

export default function App() {
  const [history, setHistory] = useState<RoundEntry[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Erro ao carregar histórico do localStorage:', e);
    }
    // Default initial seed sample so user sees predictions right away
    return INITIAL_SAMPLE_HISTORY.map((item, index) => ({
      id: `sample_${index}_${Date.now()}`,
      item,
      timestamp: Date.now() - (INITIAL_SAMPLE_HISTORY.length - index) * 60000,
      source: 'sample' as const,
    }));
  });

  const [lastAddedItem, setLastAddedItem] = useState<WheelItem | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(true);

  // Modal states
  const [isVisionOpen, setIsVisionOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [isAiQueryOpen, setIsAiQueryOpen] = useState(false);
  const [isDataMgmtOpen, setIsDataMgmtOpen] = useState(false);
  const [isAuditoriaOpen, setIsAuditoriaOpen] = useState(false);

  // Sync state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('Erro ao salvar histórico no localStorage:', e);
    }
  }, [history]);

  // Reidratação inicial e sincronização contínua com Supabase (A fonte da verdade)
  useEffect(() => {
    const rehydrateFromSupabase = async () => {
      try {
        const response = await fetch('/api/dashboard');
        if (response.ok) {
          const data = await response.json();
          if (data.sucesso) {
            if (data.ultimosResultados && Array.isArray(data.ultimosResultados)) {
              if (data.ultimosResultados.length === 0) {
                // Se o Supabase estiver vazio, o aplicativo reidrata VAZIO
                setHistory([]);
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
              } else {
                // Converte resultados do Supabase para formato RoundEntry (cronológico: antigo -> recente)
                const formatted: RoundEntry[] = [...data.ultimosResultados]
                  .reverse()
                  .map((row: any, idx: number) => ({
                    id: `db_${row.rodada || idx}_${new Date(row.criadoEm || Date.now()).getTime()}_${row.resultado}`,
                    item: row.resultado as WheelItem,
                    timestamp: new Date(row.criadoEm || Date.now()).getTime(),
                    source: 'ai_vision' as const,
                  }));

                setHistory((prev) => {
                  // Se o Supabase tiver mais ou igual registros que o histórico local, sincronizar
                  if (formatted.length >= prev.length) {
                    return formatted;
                  }
                  return prev;
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[REHYDRATE] Sincronização do Supabase temporariamente indisponível:', err instanceof Error ? err.message : err);
      }
    };

    rehydrateFromSupabase();
    const interval = setInterval(rehydrateFromSupabase, 5000);
    return () => clearInterval(interval);
  }, []);

  // Add individual round entry (Rule 1 & 3)
  const handleAddItem = (item: WheelItem) => {
    const newEntry: RoundEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      item,
      timestamp: Date.now(),
      source: 'manual',
    };

    setHistory((prev) => [...prev, newEntry]);
    setLastAddedItem(item);

    // Reset last added animation after 1s
    setTimeout(() => {
      setLastAddedItem(null);
    }, 1000);
  };

  // Remove single entry
  const handleRemoveEntry = (id: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
  };

  // Undo last entry
  const handleUndoLast = () => {
    setHistory((prev) => prev.slice(0, -1));
  };

  // Register batch from AI Vision
  const handleRegisterDetectedItems = (items: WheelItem[]) => {
    const newEntries: RoundEntry[] = items.map((item, idx) => ({
      id: `${Date.now()}_vision_${idx}_${Math.random().toString(36).substring(2, 5)}`,
      item,
      timestamp: Date.now() + idx * 1000,
      source: 'ai_vision',
    }));

    setHistory((prev) => [...prev, ...newEntries]);
  };

  // Load sample dataset
  const handleLoadSampleData = () => {
    const sampleEntries: RoundEntry[] = INITIAL_SAMPLE_HISTORY.map((item, index) => ({
      id: `sample_${index}_${Date.now()}`,
      item,
      timestamp: Date.now() - (INITIAL_SAMPLE_HISTORY.length - index) * 60000,
      source: 'sample' as const,
    }));
    setHistory(sampleEntries);
  };

  // Clear dataset
  const handleClearData = async () => {
    try {
      const response = await fetch('/api/dashboard/results', {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.sucesso) {
        setHistory([]);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
        console.log('[CLEAR_HISTORY_SUCCESS] Histórico totalmente apagado e zerado.');
      } else {
        alert(`Erro ao apagar histórico: ${data.mensagem}`);
      }
    } catch (err: any) {
      console.error('Erro ao enviar solicitação de limpeza do histórico:', err);
      setHistory([]);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
    }
  };

  // Import JSON
  const handleImportData = (entries: RoundEntry[]) => {
    setHistory(entries);
  };

  // Registrar automaticamente nova rodada confirmada pela Gemini Live API
  const handleLiveResultConfirmed = (result: LiveResultPayload) => {
    const syncCheck = canSyncResultToDashboard(result, { autoMark: true });
    if (!syncCheck.canSync) {
      console.log(`[VISUAL_HISTORY_TRACE] eventId=${syncCheck.eventId || 'N/A'} item=${syncCheck.item || 'N/A'} appendAllowed=false appendReason=${syncCheck.reason} duplicateCheck=false historyUpdated=false uiUpdated=false`);
      return;
    }

    const item = syncCheck.item as WheelItem;
    if (item && item in WHEEL_ITEMS) {
      const eventId = syncCheck.eventId || `EVT_${Date.now()}`;
      const newEntry: RoundEntry = {
        id: `live_${eventId}`,
        item: item as WheelItem,
        timestamp: result.timestamp || Date.now(),
        source: 'ai_vision',
      };

      setHistory((prev) => {
        // Regra 6: Verificar se o eventId já existe no histórico
        const duplicateCheck = prev.some((e) => e.id.includes(eventId));
        if (duplicateCheck) {
          console.log(
            `[VISUAL_HISTORY_TRACE] ` +
            `eventId=${eventId} ` +
            `object=${result.objetoDetectado || item} ` +
            `normalizedObject=${item} ` +
            `round=${syncCheck.rodada || 'N/A'} ` +
            `timestamp=${newEntry.timestamp} ` +
            `previousHistoryLength=${prev.length} ` +
            `newHistoryLength=${prev.length} ` +
            `appendAllowed=false ` +
            `appendReason=DUPLICATE_EVENT_ID ` +
            `duplicateCheck=true ` +
            `duplicateReason=EVENT_ID_EXISTS ` +
            `historyUpdated=false ` +
            `uiUpdated=false`
          );
          return prev;
        }

        const updated = [...prev, newEntry];
        console.log(
          `[VISUAL_HISTORY_TRACE] ` +
          `eventId=${eventId} ` +
          `object=${result.objetoDetectado || item} ` +
          `normalizedObject=${item} ` +
          `round=${syncCheck.rodada || 'N/A'} ` +
          `timestamp=${newEntry.timestamp} ` +
          `previousHistoryLength=${prev.length} ` +
          `newHistoryLength=${updated.length} ` +
          `appendAllowed=true ` +
          `appendReason=NEW_EVENT_ID ` +
          `duplicateCheck=false ` +
          `duplicateReason=NONE ` +
          `historyUpdated=true ` +
          `uiUpdated=true`
        );
        return updated;
      });

      setLastAddedItem(item as WheelItem);

      setTimeout(() => {
        setLastAddedItem(null);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Top Header */}
      <Header
        history={history}
        onOpenVision={() => setIsVisionOpen(true)}
        onOpenLiveCamera={() => setIsLiveCameraOpen(true)}
        onOpenAiQuery={() => setIsAiQueryOpen(true)}
        onOpenDataMgmt={() => setIsDataMgmtOpen(true)}
        onOpenAuditoria={() => setIsAuditoriaOpen(true)}
        onToggleMatrix={() => setShowMatrix((prev) => !prev)}
        showMatrix={showMatrix}
        onToggleIntelligence={() => setShowIntelligence((prev) => !prev)}
        showIntelligence={showIntelligence}
      />

      {/* Main Dashboard Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Motor de Análise Estatística e Padrões da Roda */}
        <WheelAnalysisEnginePanel history={history.map((h) => h.item)} />

        {/* Painel de Análise Estatística Oficial (StatisticsEngine) */}
        <AnaliseEstatisticaPanel />

        {/* Painel de Inteligência Estatística (Prompt 007) */}
        {showIntelligence && <IntelligencePanel />}

        {/* Quick Manual Entry Bar */}
        <QuickAddBar onAddItem={handleAddItem} lastAddedItem={lastAddedItem} />

        {/* Roda Gigante Visual History (Rule 5: Left = Newest, Right = Oldest) */}
        <VisualHistoryBar
          history={history}
          onRemoveEntry={handleRemoveEntry}
          onUndoLast={handleUndoLast}
        />

        {/* Últimos 10 Resultados Panel (Rule 6) */}
        <RecentTenPanel history={history} />

        {/* Probability & Prediction Panel (Rule 7) */}
        <PredictionPanel history={history} />

        {/* 8x8 Transition Matrix & Atrasômetro (Optional Toggle) */}
        {showMatrix && <MatrixView history={history} />}

      </main>

      {/* Footer Disclaimer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-semibold text-slate-400">
            Farm Fishing AI — Sistema Profissional de Análise Estatística da Roda Gigante
          </p>
          <p className="mt-1">
            Todas as probabilidades e recomendações são estritamente calculadas a partir dos dados do banco estatístico gravado.
          </p>
        </div>
      </footer>

      {/* Computer Vision AI Modal */}
      <PanelErrorBoundary panelName="VISAO_AI">
        <ComputerVisionModal
          isOpen={isVisionOpen}
          onClose={() => setIsVisionOpen(false)}
          onRegisterDetectedItems={handleRegisterDetectedItems}
        />
      </PanelErrorBoundary>

      {/* AI Assistant Natural Language Query Modal */}
      <PanelErrorBoundary panelName="PERGUNTA_AI">
        <AIChatQueryModal
          isOpen={isAiQueryOpen}
          onClose={() => setIsAiQueryOpen(false)}
          history={history}
        />
      </PanelErrorBoundary>

      {/* Data Management Modal */}
      <DataManagementModal
        isOpen={isDataMgmtOpen}
        onClose={() => setIsDataMgmtOpen(false)}
        history={history}
        onLoadSampleData={handleLoadSampleData}
        onClearData={handleClearData}
        onImportData={handleImportData}
      />

      {/* Auditoria Inteligente do Histórico Modal */}
      <AuditoriaModal
        isOpen={isAuditoriaOpen}
        onClose={() => setIsAuditoriaOpen(false)}
      />

      {/* Câmera Live AI – Transmissão Contínua (PROMPT LIVE 004) */}
      <LiveCamera
        isOpen={isLiveCameraOpen}
        onClose={() => setIsLiveCameraOpen(false)}
        onResultDetected={handleLiveResultConfirmed}
      />

    </div>
  );
}
