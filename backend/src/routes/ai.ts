import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { analyzeRestaurantData } from '../services/aiService.js';
import { HttpError } from '../http.js';

const router = Router();

/**
 * POST /api/ai/analyze
 * Processes manager prompts using Gemini with restaurant context
 */
router.post('/analyze', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'The AI Analyst is only available for Managers.');
    }

    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'A prompt is required.' });
    }
    const result = await analyzeRestaurantData(req.restaurantId!, prompt.trim());
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export const aiRouter = router;