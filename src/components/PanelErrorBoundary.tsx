import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface PanelErrorBoundaryProps {
  panelName: string;
  children: React.ReactNode;
  onReset?: () => void;
}

export interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PANEL_ERROR] panel=${this.props.panelName} error=${error?.message || error}`, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 text-center space-y-4 max-w-md mx-auto my-6 shadow-2xl text-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              Não foi possível carregar este painel.
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Ocorreu uma falha na renderização do componente ({this.props.panelName}). Tente novamente.
            </p>
          </div>
          {this.state.error && (
            <div className="text-[10px] font-mono text-rose-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-left overflow-x-auto max-h-24">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 mx-auto cursor-pointer transition active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
