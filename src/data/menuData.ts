import { MenuItem, MenuCategoryInfo } from '../types';

export const menuCategories: MenuCategoryInfo[] = [
{ id: 'alcoholic-drinks', name: 'Alcoholic Drinks', emoji: '🍸' },
{ id: 'beers', name: 'Beers', emoji: '🍺' },
{ id: 'wine', name: 'Wine', emoji: '🍷' },
{ id: 'soft-drinks', name: 'Soft Drinks', emoji: '🥤' },
{ id: 'breakfast', name: 'Breakfast', emoji: '🍳' },
{ id: 'lunch', name: 'Lunch', emoji: '🥗' },
{ id: 'dinner', name: 'Dinner', emoji: '🍽️' }];


export const menuItems: MenuItem[] = [
// ============ ALCOHOLIC DRINKS ============
{
  id: 'alc-001',
  name: 'Classic Mojito',
  description:
  'Fresh mint, lime juice, white rum, sugar, and soda water. A refreshing Cuban classic.',
  price: 8500,
  category: 'alcoholic-drinks',
  emoji: '🍹',
  prepTime: 5,
  isAvailable: true,
  isPopular: true
},
{
  id: 'alc-002',
  name: 'Old Fashioned',
  description:
  'Bourbon whiskey muddled with sugar, bitters, and a twist of orange peel.',
  price: 10000,
  category: 'alcoholic-drinks',
  emoji: '🥃',
  prepTime: 4,
  isAvailable: true,
  isPopular: true
},
{
  id: 'alc-003',
  name: 'Margarita',
  description:
  'Premium tequila, fresh lime juice, and triple sec with a salted rim.',
  price: 9000,
  category: 'alcoholic-drinks',
  emoji: '🍸',
  prepTime: 4,
  isAvailable: true,
  isPopular: false
},
{
  id: 'alc-006',
  name: 'Espresso Martini',
  description:
  'Vodka, fresh espresso, coffee liqueur, and a touch of vanilla.',
  price: 12000,
  category: 'alcoholic-drinks',
  emoji: '🍸',
  prepTime: 5,
  isAvailable: true,
  isPopular: true
},
{
  id: 'alc-007',
  name: 'Whiskey Sour',
  description:
  'Bourbon, fresh lemon juice, simple syrup, and egg white foam.',
  price: 9500,
  category: 'alcoholic-drinks',
  emoji: '🥃',
  prepTime: 5,
  isAvailable: true,
  isPopular: false
},
{
  id: 'alc-008',
  name: 'Gin & Tonic Premium',
  description:
  'Hendricks gin with fever-tree tonic, cucumber, and juniper berries.',
  price: 8000,
  category: 'alcoholic-drinks',
  emoji: '🍸',
  prepTime: 3,
  isAvailable: true,
  isPopular: false
},

// ============ BEERS ============
{
  id: 'beer-001',
  name: 'Mutzig',
  description: 'Classic Rwandan lager, crisp and refreshing.',
  price: 2500,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: true
},
{
  id: 'beer-002',
  name: 'Primus',
  description: 'Popular local beer, perfect for any occasion.',
  price: 2000,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: true
},
{
  id: 'beer-003',
  name: 'Turbo King',
  description: 'Dark ale with a rich, robust flavor.',
  price: 2500,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'beer-004',
  name: 'Skol Lager',
  description: 'Refreshing and smooth lager.',
  price: 2000,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: true
},
{
  id: 'beer-005',
  name: 'Heineken',
  description: 'Premium imported pale lager.',
  price: 3500,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'beer-006',
  name: 'Amstel',
  description: 'Smooth and balanced lager.',
  price: 3000,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'beer-007',
  name: 'Guinness',
  description: 'Rich, dark Irish stout.',
  price: 4000,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'beer-008',
  name: 'Virunga',
  description: 'Local craft beer named after the famous mountains.',
  price: 2500,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'alc-004',
  name: 'Craft IPA',
  description: 'Local brewery hoppy IPA with citrus notes. 6.5% ABV.',
  price: 5000,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: true
},
{
  id: 'alc-005',
  name: 'Belgian Wheat Beer',
  description:
  'Smooth wheat beer with hints of coriander and orange peel. 5.2% ABV.',
  price: 4500,
  category: 'beers',
  emoji: '🍺',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},

// ============ WINE ============
{
  id: 'wine-001',
  name: 'Château Margaux 2018',
  description:
  'Full-bodied Bordeaux red with notes of blackcurrant, cedar, and tobacco.',
  price: 65000,
  category: 'wine',
  emoji: '🍷',
  prepTime: 2,
  isAvailable: true,
  isPopular: true
},
{
  id: 'wine-002',
  name: 'Pinot Grigio',
  description:
  'Crisp Italian white with citrus and green apple notes. Light and refreshing.',
  price: 7000,
  category: 'wine',
  emoji: '🥂',
  prepTime: 2,
  isAvailable: true,
  isPopular: true
},
{
  id: 'wine-003',
  name: 'Napa Valley Cabernet',
  description:
  'Rich California red with dark fruit, vanilla, and smooth tannins.',
  price: 12000,
  category: 'wine',
  emoji: '🍷',
  prepTime: 2,
  isAvailable: true,
  isPopular: false
},
{
  id: 'wine-004',
  name: 'Provence Rosé',
  description:
  'Elegant French rosé with strawberry and floral notes. Perfect for summer.',
  price: 9000,
  category: 'wine',
  emoji: '🍷',
  prepTime: 2,
  isAvailable: true,
  isPopular: true
},
{
  id: 'wine-005',
  name: 'Prosecco',
  description:
  'Italian sparkling wine with fine bubbles and notes of pear and apple.',
  price: 7500,
  category: 'wine',
  emoji: '🥂',
  prepTime: 2,
  isAvailable: true,
  isPopular: false
},
{
  id: 'wine-006',
  name: 'Sauvignon Blanc',
  description: 'New Zealand white with tropical fruit and herbaceous notes.',
  price: 8000,
  category: 'wine',
  emoji: '🥂',
  prepTime: 2,
  isAvailable: true,
  isPopular: false
},

// ============ SOFT DRINKS ============
{
  id: 'soft-001',
  name: 'Fresh Orange Juice',
  description: 'Freshly squeezed orange juice. No added sugar.',
  price: 4000,
  category: 'soft-drinks',
  emoji: '🍊',
  prepTime: 3,
  isAvailable: true,
  isPopular: true
},
{
  id: 'soft-002',
  name: 'Sparkling Water',
  description: 'San Pellegrino sparkling mineral water. 750ml bottle.',
  price: 3000,
  category: 'soft-drinks',
  emoji: '💧',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'soft-003',
  name: 'Homemade Lemonade',
  description: 'Fresh lemons, mint, and a touch of honey. Served over ice.',
  price: 3500,
  category: 'soft-drinks',
  emoji: '🍋',
  prepTime: 3,
  isAvailable: true,
  isPopular: true
},
{
  id: 'soft-004',
  name: 'Coca-Cola',
  description: 'Classic Coca-Cola. 330ml can.',
  price: 2000,
  category: 'soft-drinks',
  emoji: '🥤',
  prepTime: 1,
  isAvailable: true,
  isPopular: false
},
{
  id: 'soft-005',
  name: 'Iced Coffee',
  description: 'Cold brew coffee with milk and vanilla. Refreshingly smooth.',
  price: 4500,
  category: 'soft-drinks',
  emoji: '☕',
  prepTime: 2,
  isAvailable: true,
  isPopular: true
},
{
  id: 'soft-006',
  name: 'Berry Smoothie',
  description: 'Mixed berries, banana, yogurt, and honey. Thick and creamy.',
  price: 5000,
  category: 'soft-drinks',
  emoji: '🫐',
  prepTime: 4,
  isAvailable: true,
  isPopular: false
},

// ============ BREAKFAST ============
{
  id: 'bfast-001',
  name: 'Classic Eggs Benedict',
  description:
  'Poached eggs on English muffin with Canadian bacon and hollandaise sauce.',
  price: 11000,
  category: 'breakfast',
  emoji: '🍳',
  prepTime: 15,
  isAvailable: true,
  isPopular: true
},
{
  id: 'bfast-002',
  name: 'Avocado Toast',
  description:
  'Smashed avocado on sourdough with cherry tomatoes, feta, and poached egg.',
  price: 9500,
  category: 'breakfast',
  emoji: '🥑',
  prepTime: 10,
  isAvailable: true,
  isPopular: true
},
{
  id: 'bfast-003',
  name: 'Buttermilk Pancakes',
  description:
  'Stack of three fluffy pancakes with maple syrup and fresh berries.',
  price: 8500,
  category: 'breakfast',
  emoji: '🥞',
  prepTime: 12,
  isAvailable: true,
  isPopular: true
},
{
  id: 'bfast-004',
  name: 'Full English Breakfast',
  description: 'Eggs, bacon, sausage, beans, mushrooms, tomato, and toast.',
  price: 12000,
  category: 'breakfast',
  emoji: '🍳',
  prepTime: 18,
  isAvailable: true,
  isPopular: false
},
{
  id: 'bfast-005',
  name: 'French Toast',
  description:
  'Brioche French toast with cinnamon, vanilla cream, and caramelized bananas.',
  price: 10000,
  category: 'breakfast',
  emoji: '🍞',
  prepTime: 12,
  isAvailable: true,
  isPopular: false
},
{
  id: 'bfast-006',
  name: 'Granola Bowl',
  description:
  'House-made granola with Greek yogurt, honey, and seasonal fruits.',
  price: 7500,
  category: 'breakfast',
  emoji: '🥣',
  prepTime: 5,
  isAvailable: true,
  isPopular: false
},

// ============ LUNCH ============
{
  id: 'lunch-001',
  name: 'Gourmet Burger',
  description:
  'Angus beef patty, aged cheddar, caramelized onions, special sauce, brioche bun.',
  price: 13000,
  category: 'lunch',
  emoji: '🍔',
  prepTime: 18,
  isAvailable: true,
  isPopular: true
},
{
  id: 'lunch-002',
  name: 'Caesar Salad',
  description:
  'Crisp romaine, parmesan, croutons, and house-made Caesar dressing. Add chicken +$5.',
  price: 9500,
  category: 'lunch',
  emoji: '🥗',
  prepTime: 8,
  isAvailable: true,
  isPopular: true
},
{
  id: 'lunch-003',
  name: 'Club Sandwich',
  description:
  'Triple-decker with turkey, bacon, lettuce, tomato, and mayo. Served with fries.',
  price: 11000,
  category: 'lunch',
  emoji: '🥪',
  prepTime: 12,
  isAvailable: true,
  isPopular: false
},
{
  id: 'lunch-004',
  name: 'Fish & Chips',
  description:
  'Beer-battered cod with hand-cut fries, mushy peas, and tartar sauce.',
  price: 12500,
  category: 'lunch',
  emoji: '🐟',
  prepTime: 15,
  isAvailable: true,
  isPopular: true
},
{
  id: 'lunch-005',
  name: 'Margherita Pizza',
  description:
  'San Marzano tomatoes, fresh mozzarella, basil, and extra virgin olive oil.',
  price: 11500,
  category: 'lunch',
  emoji: '🍕',
  prepTime: 15,
  isAvailable: true,
  isPopular: false
},
{
  id: 'lunch-006',
  name: 'Grilled Chicken Wrap',
  description:
  'Grilled chicken, mixed greens, avocado, and chipotle mayo in a flour tortilla.',
  price: 10000,
  category: 'lunch',
  emoji: '🌯',
  prepTime: 12,
  isAvailable: true,
  isPopular: false
},
{
  id: 'lunch-007',
  name: 'Soup of the Day',
  description:
  "Ask your server for today's selection. Served with artisan bread.",
  price: 6000,
  category: 'lunch',
  emoji: '🍲',
  prepTime: 5,
  isAvailable: true,
  isPopular: false
},
{
  id: 'lunch-008',
  name: 'Quinoa Buddha Bowl',
  description:
  'Quinoa, roasted vegetables, chickpeas, hummus, and tahini dressing.',
  price: 10500,
  category: 'lunch',
  emoji: '🥙',
  prepTime: 10,
  isAvailable: true,
  isPopular: false
},

// ============ DINNER ============
{
  id: 'dinner-001',
  name: 'Ribeye Steak',
  description:
  '12oz prime ribeye, herb butter, roasted potatoes, and seasonal vegetables.',
  price: 28000,
  category: 'dinner',
  emoji: '🥩',
  prepTime: 25,
  isAvailable: true,
  isPopular: true
},
{
  id: 'dinner-002',
  name: 'Grilled Salmon',
  description:
  'Atlantic salmon with lemon dill sauce, asparagus, and wild rice.',
  price: 22000,
  category: 'dinner',
  emoji: '🐟',
  prepTime: 20,
  isAvailable: true,
  isPopular: true
},
{
  id: 'dinner-003',
  name: 'Lobster Linguine',
  description:
  'Fresh lobster tail with linguine in a creamy tomato basil sauce.',
  price: 26000,
  category: 'dinner',
  emoji: '🦞',
  prepTime: 22,
  isAvailable: true,
  isPopular: true
},
{
  id: 'dinner-004',
  name: 'Chicken Parmesan',
  description:
  'Breaded chicken breast, marinara, melted mozzarella, served with spaghetti.',
  price: 18000,
  category: 'dinner',
  emoji: '🍗',
  prepTime: 20,
  isAvailable: true,
  isPopular: false
},
{
  id: 'dinner-005',
  name: 'Lamb Chops',
  description:
  'New Zealand lamb chops with mint pesto, roasted garlic mash, and green beans.',
  price: 24000,
  category: 'dinner',
  emoji: '🍖',
  prepTime: 25,
  isAvailable: true,
  isPopular: false
},
{
  id: 'dinner-006',
  name: 'Mushroom Risotto',
  description:
  'Creamy arborio rice with wild mushrooms, parmesan, and truffle oil.',
  price: 16000,
  category: 'dinner',
  emoji: '🍄',
  prepTime: 25,
  isAvailable: true,
  isPopular: false
},
{
  id: 'dinner-007',
  name: 'Duck Confit',
  description:
  'Slow-cooked duck leg with cherry reduction, potato gratin, and braised cabbage.',
  price: 23000,
  category: 'dinner',
  emoji: '🦆',
  prepTime: 20,
  isAvailable: true,
  isPopular: false
},
{
  id: 'dinner-008',
  name: 'Seafood Platter',
  description:
  'Grilled shrimp, scallops, calamari, and fish of the day with garlic butter.',
  price: 30000,
  category: 'dinner',
  emoji: '🦐',
  prepTime: 25,
  isAvailable: true,
  isPopular: true
}];


export const getMenuItemsByCategory = (category: string): MenuItem[] => {
  if (category === 'all') return menuItems;
  return menuItems.filter((item) => item.category === category);
};

export const getPopularItems = (): MenuItem[] => {
  return menuItems.filter((item) => item.isPopular);
};

export const getMenuItemById = (id: string): MenuItem | undefined => {
  return menuItems.find((item) => item.id === id);
};