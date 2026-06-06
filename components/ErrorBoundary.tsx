import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="max-w-md bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto animate-bounce">
              <AlertOctagon className="w-8 h-8 text-rose-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Ops, si è verificato un errore critico</h1>
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              L'applicazione ha riscontrato un problema inaspettato. Abbiamo registrato l'errore e stiamo lavorando per risolverlo.
            </p>
            {this.state.error && (
              <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100 max-h-32 overflow-y-auto no-scrollbar">
                <p className="font-mono text-[10px] text-slate-400 font-bold uppercase mb-1">Dettagli Errore:</p>
                <code className="font-mono text-xs text-rose-600 leading-none">{this.state.error.message || String(this.state.error)}</code>
              </div>
            )}
            <button 
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase text-xs tracking-wider py-4 px-6 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Ricarica Applicazione
            </button>
          </div>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
