import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, ArrowRight, Bot } from 'lucide-react';
import { askAIAnalyst } from '../../api/ai';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
}

interface AIInsightsChatProps {
  forecasts?: any;
  alerts?: any;
  onGenerateForecasts?: () => void;
  isGenerating?: boolean;
}

export function AIInsightsChat(_props: AIInsightsChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm Servv IQ, your AI Operations Analyst. I've analyzed your stock, waste, and sales data. How can I help optimize your restaurant today?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const data = await askAIAnalyst(text);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.answer, actions: data.suggestedActions },
      ]);
    } catch (error: any) {
      const msg = error?.message || 'An error occurred. Please try again.';
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I hit a snag: ${msg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const QUICK_PROMPTS = [
    'What items are low on stock?',
    'Show top sellers this month',
    'Where is most waste coming from?',
  ];

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[88vw] sm:w-80 md:w-96 h-[65vh] sm:h-[520px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-amber-500/15 rounded-lg">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 leading-none">Servv IQ</p>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Live data connected
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center mb-0.5">
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-slate-950 rounded-br-sm font-medium'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-700 flex flex-wrap gap-1.5">
                      {msg.actions.map(action => (
                        <span
                          key={action}
                          className="inline-flex items-center gap-1 text-[10px] font-medium bg-slate-700 text-amber-300 px-2 py-1 rounded-md"
                        >
                          {action.replace(/_/g, ' ')}
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-end gap-2 justify-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700 px-3 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Quick prompts — only shown on first message */}
          {messages.length === 1 && !isLoading && (
            <div className="px-4 pb-2 flex flex-col gap-1.5">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-left text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-700 bg-slate-800/40">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stock, waste or trends…"
                disabled={isLoading}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 disabled:opacity-50 transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 p-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full shadow-xl shadow-amber-900/30 transition-all hover:scale-105 active:scale-95"
      >
        <Sparkles className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-12' : ''}`} />
        {!isOpen && <span className="font-semibold text-sm pr-0.5">Servv IQ</span>}
      </button>
    </div>
  );
}
