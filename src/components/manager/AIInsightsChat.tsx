import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { askAIAnalyst, AIResponse } from '../../api/ai';

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

export function AIInsightsChat({ alerts }: AIInsightsChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hello! I'm your AI Operations Analyst. I've analyzed your current stock, waste, and sales data. How can I help you optimize your restaurant today?" 
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const data = await askAIAnalyst(userMessage);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        actions: data.suggestedActions 
      }]);
    } catch (error: any) {
      console.error('AI Insights Assistant Error:', error);
      const errorMsg = error.message || "I encountered an error while analyzing your data. Please check your connection.";
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Sorry, I hit a snag: ${errorMsg}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 sm:mb-4 w-[85vw] sm:w-80 md:w-96 h-[60vh] sm:h-[500px] bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm">AI Insights Assistant</h3>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Live Data Connected
                </span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                      {msg.actions.map(action => (
                        <button 
                          key={action}
                          className="text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                        >
                          {action.replace(/_/g, ' ')} <ArrowRight className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl rounded-tl-none flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-700 bg-slate-800/30">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about stock, waste or trends..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <Button 
                size="sm" 
                onClick={handleSend} 
                disabled={isLoading || !input.trim()}
                className="rounded-xl shadow-lg shadow-blue-900/20"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 sm:p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-xl shadow-blue-900/40 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 group"
      >
        <Sparkles className={`w-5 h-5 sm:w-6 sm:h-6 ${isOpen ? 'rotate-12' : ''} transition-transform`} />
        {!isOpen && <span className="font-semibold text-xs sm:text-sm pr-1">Servv IQ</span>}
      </button>
    </div>
  );
}