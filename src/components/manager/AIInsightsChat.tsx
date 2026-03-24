import { useState, useRef, useEffect } from 'react';
import { MessageCircleIcon, SendIcon, XIcon, LightbulbIcon, TrendingUpIcon, PackageIcon, UsersIcon, AlertTriangleIcon } from 'lucide-react';
import type { InventoryForecast } from '../../types/inventory';

interface AIInsightsChatProps {
  forecasts: InventoryForecast[];
  alerts: InventoryForecast[];
  onGenerateForecasts: () => Promise<void>;
  isGenerating: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  { id: 'reorder', label: 'What should I reorder?', icon: <PackageIcon className="w-4 h-4" /> },
  { id: 'trends', label: 'Show me sales trends', icon: <TrendingUpIcon className="w-4 h-4" /> },
  { id: 'alerts', label: 'Any urgent alerts?', icon: <AlertTriangleIcon className="w-4 h-4" /> },
  { id: 'staff', label: 'Staff performance', icon: <UsersIcon className="w-4 h-4" /> },
];

export function AIInsightsChat({ 
  forecasts, 
  alerts, 
  onGenerateForecasts, 
  isGenerating 
}: AIInsightsChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant. Ask me about your inventory, sales, or staff performance, or use the quick questions below.',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateResponse = (question: string): string => {
    const q = question.toLowerCase();
    
    if (q.includes('reorder') || q.includes('stock')) {
      const criticalItems = forecasts.filter(f => f.alertStatus === 'critical');
      const warningItems = forecasts.filter(f => f.alertStatus === 'warning');
      
      if (criticalItems.length > 0) {
        return `🔴 **Critical Reorder Needed:**\n\n${criticalItems.map(f => `• ${f.menuItemName}: ${f.lastStockLevel} left, ${f.daysUntilStockout} days until stockout`).join('\n')}\n\nI recommend ordering ${criticalItems.map(f => f.recommendedReorderQty).reduce((a, b) => a + b, 0)} units total.`;
      } else if (warningItems.length > 0) {
        return `🟡 **Reorder Warning:**\n\n${warningItems.map(f => `• ${f.menuItemName}: ${f.lastStockLevel} left`).join('\n')}\n\nThese items may need attention soon.`;
      }
      return '✅ Your inventory looks good! No critical stock issues detected.';
    }
    
    if (q.includes('alert') || q.includes('urgent') || q.includes('warning')) {
      const critical = alerts.filter(a => a.alertStatus === 'critical');
      const warning = alerts.filter(a => a.alertStatus === 'warning');
      
      if (critical.length === 0 && warning.length === 0) {
        return '✅ No urgent alerts at the moment. All systems are normal.';
      }
      
      let response = '';
      if (critical.length > 0) {
        response += `🚨 **${critical.length} Critical Alert(s):**\n${critical.map(f => `• ${f.menuItemName} - Out of stock in ${f.daysUntilStockout} days`).join('\n')}\n\n`;
      }
      if (warning.length > 0) {
        response += `⚠️ **${warning.length} Warning(s):**\n${warning.map(f => `• ${f.menuItemName} - Low stock (${f.lastStockLevel} left)`).join('\n')}`;
      }
      return response;
    }
    
    if (q.includes('trend') || q.includes('sales') || q.includes('revenue')) {
      const highTrend = forecasts.filter(f => f.trendFactor > 1.1);
      const lowTrend = forecasts.filter(f => f.trendFactor < 0.9);
      
      if (highTrend.length > 0) {
        return `📈 **Increasing Demand:**\n\n${highTrend.slice(0, 5).map(f => `• ${f.menuItemName}: +${Math.round((f.trendFactor - 1) * 100)}% trend`).join('\n')}\n\nConsider increasing stock for these popular items.`;
      } else if (lowTrend.length > 0) {
        return `📉 **Decreasing Demand:**\n\n${lowTrend.slice(0, 5).map(f => `• ${f.menuItemName}: ${Math.round((f.trendFactor - 1) * 100)}% trend`).join('\n')}\n\nThese items may need promotion or portion review.`;
      }
      return '📊 Sales trends are stable across your inventory. No significant changes detected.';
    }
    
    if (q.includes('staff') || q.includes('team') || q.includes('performance')) {
      return '👥 **Staff Performance Insights:**\n\nTo view staff KPIs and performance metrics, please check the Staff Management page. You can set daily, weekly, or monthly targets for your team and track their progress.';
    }
    
    if (q.includes('season') || q.includes('seasonality')) {
      const seasonal = forecasts.filter(f => f.seasonalityFactor > 1.1 || f.seasonalityFactor < 0.9);
      if (seasonal.length > 0) {
        return `📅 **Seasonality Patterns:**\n\n${seasonal.slice(0, 5).map(f => `• ${f.menuItemName}: ${f.seasonalityFactor > 1.1 ? 'High' : 'Low'} season factor (${f.seasonalityFactor.toFixed(2)})`).join('\n')}`;
      }
      return 'No significant seasonality patterns detected in your inventory data.';
    }
    
    if (q.includes('confidence') || q.includes('reliable')) {
      const highConf = forecasts.filter(f => f.confidenceLevel >= 0.8);
      const lowConf = forecasts.filter(f => f.confidenceLevel < 0.5);
      
      return `🎯 **Forecast Confidence:**\n\n• High confidence: ${highConf.length} items\n• Medium confidence: ${forecasts.filter(f => f.confidenceLevel >= 0.5 && f.confidenceLevel < 0.8).length} items\n• Low confidence: ${lowConf.length} items\n\nLow confidence forecasts may need more historical data for accuracy.`;
    }
    
    return 'I can help you with:\n• Reorder suggestions\n• Sales trends\n• Urgent alerts\n• Staff performance\n• Seasonality patterns\n• Forecast confidence\n\nWhat would you like to know?';
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Simulate AI thinking delay
    setTimeout(() => {
      const response = generateResponse(inputValue);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 500);
    
    setInputValue('');
  };

  const handleQuickQuestion = (question: string) => {
    setInputValue(question);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-amber-500 hover:bg-amber-400 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-50"
      >
        <MessageCircleIcon className="w-6 h-6 text-slate-900" />
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-96 h-[500px] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/90">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-lg">🤖</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Insights</h3>
                <p className="text-xs text-slate-400">Based on your data</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Questions */}
          <div className="p-3 border-b border-slate-700 bg-slate-800/50">
            <p className="text-xs text-slate-400 mb-2">Quick questions:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => handleQuickQuestion(q.label)}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors"
                >
                  {q.icon}
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-slate-700 text-slate-100 whitespace-pre-wrap'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="bg-slate-700 p-3 rounded-lg">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-700 bg-slate-800/90">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask about your business..."
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <SendIcon className="w-4 h-4 text-slate-900" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}