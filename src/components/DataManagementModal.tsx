import React from 'react';
import { RoundEntry } from '../types';
import { INITIAL_SAMPLE_HISTORY, WHEEL_ITEMS } from '../data/items';
import {
  Database,
  X,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: RoundEntry[];
  onLoadSampleData: () => void;
  onClearData: () => void;
  onImportData: (entries: RoundEntry[]) => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  history,
  onLoadSampleData,
  onClearData,
  onImportData,
}) => {
  // Listener para tecla Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `farm_fishing_ai_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            onImportData(parsed);
            alert('Histórico importado com sucesso!');
            onClose();
          } else {
            alert('Formato de arquivo JSON inválido.');
          }
        } catch (err) {
          alert('Erro ao processar o arquivo JSON.');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      {/* Backdrop clicável fora do modal */}
      <div
        onClick={() => {
          onClose();
        }}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer"
        title="Clique fora para fechar"
      />

      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative z-10 my-auto max-h-[90dvh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-800 text-cyan-400 rounded-xl border border-slate-700 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-100">
                Gerenciar Banco de Dados
              </h2>
              <p className="text-xs text-slate-400">
                {history.length} rodadas armazenadas no navegador
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Sair / Fechar"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>SAIR</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="my-5 space-y-3">
          {/* Seed Sample Dataset */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200">
                Carregar Histórico de Exemplo (40 Rodadas)
              </h3>
              <p className="text-[11px] text-slate-400">
                Preenche o banco de dados com 40 resultados reais da Roda para testar as previsões estatísticas imediatamente.
              </p>
            </div>
            <button
              onClick={() => {
                onLoadSampleData();
                onClose();
              }}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shrink-0 cursor-pointer"
            >
              Carregar Amostra
            </button>
          </div>

          {/* Export JSON */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200">
                Exportar Histórico (JSON)
              </h3>
              <p className="text-[11px] text-slate-400">
                Faça backup do seu histórico de resultados registrado.
              </p>
            </div>
            <button
              onClick={handleExportJSON}
              disabled={history.length === 0}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>
          </div>

          {/* Import JSON */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200">
                Importar Backup (JSON)
              </h3>
              <p className="text-[11px] text-slate-400">
                Restaure ou carregue um histórico salvo previamente.
              </p>
            </div>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl shrink-0 cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>Importar</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>

          {/* Reset Database */}
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-red-300">
                Apagar todos os resultados
              </h3>
              <p className="text-[11px] text-red-400/80">
                Esta ação removerá permanentemente todo o histórico de resultados do Supabase e do sistema.
              </p>
            </div>
            <button
              onClick={() => {
                const msg =
                  'Tem certeza que deseja apagar todos os resultados?\n\nEsta ação removerá permanentemente todo o histórico de resultados do Supabase e do sistema.';
                if (window.confirm(msg)) {
                  onClearData();
                  onClose();
                }
              }}
              className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shrink-0 cursor-pointer flex items-center gap-1.5"
              id="btn-apagar-todos-resultados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Apagar todos os resultados</span>
            </button>
          </div>
        </div>

        {/* Footer / Bottom Close button */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>Fechar Janela</span>
          </button>
        </div>

      </div>
    </div>
  );
};
