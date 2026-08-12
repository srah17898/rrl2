import React, { useState } from 'react';
import { RoundEntry } from '../types';
import {
  HelpCircle,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';

interface AIChatQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: RoundEntry[];
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export const AIChatQueryModal: React.FC<AIChatQueryModalProps> = ({
  isOpen,
  onClose,
  history,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Olá! Sou o Farm Fishing AI, seu assistente de análise estatística da Roda Gigante. Você pode me perguntar "o que vem depois de Soco?", "quais os últimos 10 resultados?" ou qualquer outra dúvida estatística baseada no histórico real.',
      timestamp: new Date(),
    },
  ]);

  const quickQuestions = [
    'O que vem depois de Soco?',
    'Quais os últimos 10 resultados?',
    'Qual item está com maior atraso?',
    'Qual o item mais sorteado?',
  ];

  const handleSendQuery = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/query-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: textToSend,
          history,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar consulta com o servidor.');
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Erro na consulta AI:', err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `Erro ao obter resposta estatística: ${err.message || 'Falha de conexão.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

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

      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full h-[600px] max-h-[90dvh] flex flex-col shadow-2xl relative z-10 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-100 flex items-center gap-2">
                <span>Consulta Farm Fishing AI</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
                  {history.length} Rodadas
                </span>
              </h2>
              <p className="text-xs text-slate-400 hidden xs:block">
                Respostas estritamente fundamentadas no banco estatístico gravado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Fechar Chat AI"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>SAIR</span>
          </button>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/60">
          {(!messages || messages.length === 0) && (
            <div className="p-8 text-center text-slate-400 space-y-2 my-auto">
              <MessageSquare className="w-8 h-8 text-cyan-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">PERGUNTA AI</p>
              <p className="text-xs text-slate-400">Faça uma pergunta sobre os resultados analisados da Roda Gigante.</p>
            </div>
          )}

          {messages && messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.sender === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-cyan-600 text-white'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600/90 text-white rounded-tr-none'
                    : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none whitespace-pre-line'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-cyan-400 bg-slate-900 border border-slate-800 p-3 rounded-xl w-fit">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Consultando matriz estatística da Roda Gigante...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/80 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">
            Sugestões:
          </span>
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendQuery(q)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold rounded-lg border border-slate-700 shrink-0 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder='Ex: "O que vem depois de Soco?" ou "Quais os últimos 10 resultados?"'
              className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
