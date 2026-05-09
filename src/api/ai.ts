import { apiRequest } from './http';

export interface AIResponse {
  answer: string;
  suggestedActions: string[];
  timestamp: string;
  structured?: {
    executiveSummary: string[];
    crossModuleFindings: Record<string, string[]>;
    priorityActions: {
      now: string[];
      thisWeek: string[];
      thisMonth: string[];
    };
    risksAndDataGaps: string[];
    insightCards: Array<{
      title: string;
      metric: string;
      value: string;
      trend: 'up' | 'down' | 'flat' | 'mixed';
      impact: 'high' | 'medium' | 'low';
      recommendation: string;
    }>;
  } | null;
  insightCards?: Array<{
    title: string;
    metric: string;
    value: string;
    trend: 'up' | 'down' | 'flat' | 'mixed';
    impact: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
}

/**
 * Sends a prompt to the Gemini AI analyst with restaurant context
 */
export async function askAIAnalyst(prompt: string): Promise<AIResponse> {
  try {
    return await apiRequest<AIResponse>('/ai/analyze', {
      method: 'POST',
      json: { prompt },
    });
  } catch (error) {
    console.error('AI Analyst Error:', error);
    throw error;
  }
}