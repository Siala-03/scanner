import { apiRequest } from './http';

export interface AIResponse {
  answer: string;
  suggestedActions: string[];
  timestamp: string;
}

/**
 * Sends a prompt to the Gemini AI analyst with restaurant context
 */
export async function askAIAnalyst(prompt: string): Promise<AIResponse> {
  try {
    return await apiRequest<AIResponse>('/api/ai/analyze', {
      method: 'POST',
      json: { prompt },
    });
  } catch (error) {
    console.error('AI Analyst Error:', error);
    throw error;
  }
}