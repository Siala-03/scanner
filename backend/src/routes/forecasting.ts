import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { generateAllForecasts, getStoredForecasts, getForecastAlerts, generateInventoryForecast } from '../services/forecastingService.js';

const router = Router();

// GET /api/forecasting - Get all forecasts
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const forecasts = await getStoredForecasts(restaurantId);
    res.json(forecasts);
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    res.status(500).json({ error: 'Failed to fetch forecasts' });
  }
});

// POST /api/forecasting/generate - Generate new forecasts
router.post('/generate', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const forecasts = await generateAllForecasts(restaurantId);
    res.json({
      success: true,
      count: forecasts.length,
      forecasts
    });
  } catch (error) {
    console.error('Error generating forecasts:', error);
    res.status(500).json({ error: 'Failed to generate forecasts' });
  }
});

// GET /api/forecasting/alerts - Get forecast alerts only
router.get('/alerts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const alerts = await getForecastAlerts(restaurantId);
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching forecast alerts:', error);
    res.status(500).json({ error: 'Failed to fetch forecast alerts' });
  }
});

// GET /api/forecasting/:menuItemId - Get forecast for specific item
router.get('/:menuItemId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { menuItemName } = req.query;
    
    const forecast = await generateInventoryForecast(
      menuItemId, 
      menuItemName?.toString() || menuItemId,
      7
    );
    
    res.json(forecast);
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

export const forecastingRouter = router;