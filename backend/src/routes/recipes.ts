import { Router, Response } from 'express';
import { HttpError } from '../http.js';
import {
  getRecipeIngredients,
  addRecipeIngredient,
  updateRecipeIngredient,
  deleteRecipeIngredient,
  checkStockRequirements,
} from '../services/recipeService.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { emitInventoryUpdate } from '../socket.js';

const router = Router();

// GET recipe ingredients for a menu item
router.get('/:menuItemId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const ingredients = await getRecipeIngredients(menuItemId, req.restaurantId!);
    res.json(ingredients);
  } catch (error) {
    console.error('Error fetching recipe ingredients:', error);
    res.status(500).json({ error: 'Failed to fetch recipe ingredients' });
  }
});

// POST add ingredient to recipe
router.post('/:menuItemId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const {
      inventoryItemId,
      quantity,
      unitOfMeasure,
      yieldPercentage = 100,
      isOptional = false,
    } = req.body;

    if (!inventoryItemId || quantity === undefined) {
      throw new HttpError(400, 'inventoryItemId and quantity are required');
    }

    const ingredient = await addRecipeIngredient(
      menuItemId,
      req.restaurantId!,
      inventoryItemId,
      quantity,
      unitOfMeasure,
      yieldPercentage,
      isOptional
    );

    emitInventoryUpdate({ type: 'recipe_change', menuItemId });
    res.status(201).json(ingredient);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error adding recipe ingredient:', error);
      res.status(500).json({ error: 'Failed to add recipe ingredient' });
    }
  }
});

// PUT update recipe ingredient
router.put('/:menuItemId/:ingredientId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ingredientId } = req.params;
    const updates = req.body;

    const ingredient = await updateRecipeIngredient(ingredientId, req.restaurantId!, updates);

    if (!ingredient) {
      throw new HttpError(404, 'Recipe ingredient not found');
    }

    emitInventoryUpdate({ type: 'recipe_change', menuItemId: ingredient.menuItemId });
    res.json(ingredient);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating recipe ingredient:', error);
      res.status(500).json({ error: 'Failed to update recipe ingredient' });
    }
  }
});

// DELETE recipe ingredient
router.delete('/:menuItemId/:ingredientId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ingredientId, menuItemId } = req.params;

    const success = await deleteRecipeIngredient(ingredientId, req.restaurantId!);

    if (!success) {
      throw new HttpError(404, 'Recipe ingredient not found');
    }

    emitInventoryUpdate({ type: 'recipe_change', menuItemId });
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting recipe ingredient:', error);
      res.status(500).json({ error: 'Failed to delete recipe ingredient' });
    }
  }
});

// POST check stock requirements for menu item order
router.post('/:menuItemId/requirements', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { quantity = 1, locationId } = req.body;

    const requirements = await checkStockRequirements(
      menuItemId,
      req.restaurantId!,
      quantity,
      locationId
    );

    res.json(requirements);
  } catch (error) {
    console.error('Error checking stock requirements:', error);
    res.status(500).json({ error: 'Failed to check stock requirements' });
  }
});

export const recipesRouter = router;
