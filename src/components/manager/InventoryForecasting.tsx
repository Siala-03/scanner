import { useState } from 'react';
import { TrendingUpIcon, RefreshCcwIcon } from 'lucide-react';
import type { InventoryForecast } from '../../types/inventory';

interface InventoryForecastingProps {
  forecasts: InventoryForecast[];
  alerts: InventoryForecast[];
  onGenerateForecasts: () => Promise<void>;
  isGenerating: boolean;
}

export function InventoryForecasting({ 
  forecasts, 
  alerts, 
  onGenerateForecasts, 
  isGenerating 
}: InventoryForecastingProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'all'>('overview');

  const getAlertColor = (alertStatus: string) => {
    switch (alertStatus) {
      case 'critical': return 'bg-red-900/30 border-red-700/50 text-red-300';
      case 'warning': return 'bg-amber-900/30 border-amber-700/50 text-amber-300';
      default: return 'bg-slate-800/40 border-slate-700/50 text-slate-400';
    }
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return { label: 'High', color: 'text-emerald-400' };
    if (confidence >= 0.5) return { label: 'Medium', color: 'text-amber-400' };
    return { label: 'Low', color: 'text-red-400' };
  };

  const getTrendIcon = (factor: number) => {
    if (factor > 1.05) return '↑';
    if (factor < 0.95) return '↓';
    return '→';
  };

  const getTrendColor = (factor: number) => {
    if (factor > 1.05) return 'text-emerald-400';
    if (factor < 0.95) return 'text-red-400';
    return 'text-slate-500';
  };

  const formatDaysUntilStockout = (days: number) => {
    if (days <= 0) return 'Out of stock';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  const displayedForecasts = activeTab === 'alerts' 
    ? alerts 
    : activeTab === 'all' 
      ? forecasts 
      : forecasts.slice(0, 10);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUpIcon className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-100">AI-Powered Inventory Forecasting</h3>
            <p className="text-xs text-slate-400">
              Predictions based on historical data & seasonality patterns
            </p>
          </div>
        </div>
        <button
          onClick={onGenerateForecasts}
          disabled={isGenerating}
          className="px-3 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 disabled:bg-amber-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
        >
          {isGenerating ? (
            <>
              <RefreshCcwIcon className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <RefreshCcwIcon className="w-4 h-4" />
              Refresh Forecasts
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-700 pb-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'overview'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview
          {forecasts.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded-full">
              {forecasts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'alerts'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Alerts
          {alerts.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-900/50 text-red-400 rounded-full">
              {alerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'all'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          All Items
        </button>
      </div>

      {/* Alerts Summary */}
      {alerts.length > 0 && activeTab !== 'all' && (
        <div className="mb-4 flex gap-2">
          {alerts.filter(a => a.alertStatus === 'critical').length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 bg-red-900/30 border border-red-700/50 rounded-lg">
              <span className="text-red-400 font-medium text-sm">
                {alerts.filter(a => a.alertStatus === 'critical').length}
              </span>
              <span className="text-red-300 text-xs">Critical</span>
            </div>
          )}
          {alerts.filter(a => a.alertStatus === 'warning').length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 bg-amber-900/30 border border-amber-700/50 rounded-lg">
              <span className="text-amber-400 font-medium text-sm">
                {alerts.filter(a => a.alertStatus === 'warning').length}
              </span>
              <span className="text-amber-300 text-xs">Warning</span>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {forecasts.length === 0 && !isGenerating && (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">📊</div>
          <h4 className="text-lg font-medium text-gray-100 mb-2">
            No Forecasts Available
          </h4>
          <p className="text-sm text-slate-400 mb-4">
            Generate forecasts to see AI-powered predictions for your inventory.
          </p>
          <button
            onClick={onGenerateForecasts}
            className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors text-sm font-medium"
          >
            Generate Forecasts
          </button>
        </div>
      )}

      {/* Forecast Table */}
      {forecasts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full">
            <thead className="bg-slate-700/40 border-b border-slate-700/50">
              <tr>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Item
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Stock
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Days Left
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Daily Usage
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Trend
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Seasonality
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Recommended Order
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {displayedForecasts.map((forecast) => {
                const confidence = getConfidenceLabel(forecast.confidenceLevel);
                return (
                  <tr 
                    key={forecast.id}
                    className={`hover:bg-slate-700/20 transition-colors ${getAlertColor(forecast.alertStatus)}`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-gray-100">
                        {forecast.menuItemName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {forecast.menuItemId}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`font-medium ${
                        forecast.lastStockLevel <= 5 ? 'text-red-400' : 
                        forecast.lastStockLevel <= 10 ? 'text-amber-400' : 'text-gray-100'
                      }`}>
                        {forecast.lastStockLevel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`font-medium ${
                        forecast.daysUntilStockout <= 2 ? 'text-red-400' :
                        forecast.daysUntilStockout <= 5 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {formatDaysUntilStockout(forecast.daysUntilStockout)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-400">
                      {forecast.predictedConsumption}/day
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 ${getTrendColor(forecast.trendFactor)}`}>
                        <span>{getTrendIcon(forecast.trendFactor)}</span>
                        <span className="text-xs">
                          {forecast.trendFactor > 1 ? '+' : ''}{Math.round((forecast.trendFactor - 1) * 100)}%
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs ${
                        forecast.seasonalityFactor > 1.1 ? 'text-orange-400' :
                        forecast.seasonalityFactor < 0.9 ? 'text-sky-400' : 'text-slate-500'
                      }`}>
                        {forecast.seasonalityFactor > 1.1 ? '↑ High' : 
                         forecast.seasonalityFactor < 0.9 ? '↓ Low' : '→ Normal'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs font-medium ${confidence.color}`}>
                        {confidence.label}
                        <span className="ml-1 text-slate-500">
                          ({Math.round(forecast.confidenceLevel * 100)}%)
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-amber-400 font-medium text-sm">
                        {forecast.recommendedReorderQty} units
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Show more indicator */}
      {activeTab === 'overview' && forecasts.length > 10 && (
        <div className="text-center mt-3">
          <button
            onClick={() => setActiveTab('all')}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium"
          >
            View all {forecasts.length} items →
          </button>
        </div>
      )}

      {/* Loading State */}
      {isGenerating && (
        <div className="text-center py-8">
          <div className="animate-spin text-3xl mb-2">⏳</div>
          <p className="text-slate-400">Analyzing historical data...</p>
          <p className="text-xs text-slate-500 mt-1">
            This may take a moment for large inventories
          </p>
        </div>
      )}
    </div>
  );
}