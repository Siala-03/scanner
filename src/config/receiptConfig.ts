/**
 * Receipt Configuration
 * 
 * This file contains the default receipt settings that can be customized by restaurant managers.
 * In a production environment, these settings would typically be stored in a database and
 * managed through a settings interface.
 */

export interface ReceiptConfig {
  // Restaurant Information
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantEmail: string;
  restaurantLogo?: string;
  taxId?: string;

  // Financial Settings
  taxRate: number; // Percentage (e.g., 18 for 18%)
  currency: 'USD' | 'RWF';

  // Loyalty Program Settings
  loyaltyProgram: {
    enabled: boolean;
    pointsPerUnit: number; // Points earned per unit amount
    unitAmount: number; // Amount threshold for earning points (in RWF)
    threshold: number; // Minimum order amount to start earning points (in RWF)
    exchangeRate: number; // Used only when historical totals are stored in USD
  };

  // Receipt Display Settings
  showReceiptId: boolean;
  showServerName: boolean;
  showTableNumber: boolean;
  showCustomerName: boolean;
  showSpecialInstructions: boolean;
  autoPrint: boolean; // Auto-print receipt when order is served

  // Footer Message
  footerMessage: string;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
}

/**
 * Default receipt configuration
 */
export const defaultReceiptConfig: ReceiptConfig = {
  // Restaurant Information
  restaurantName: 'Servv IQ',
  restaurantAddress: '123 Main Street, City',
  restaurantPhone: '(555) 123-4567',
  restaurantEmail: 'info@servv.com',
  
  // Financial Settings
  taxRate: 18, // 18% tax
  currency: 'RWF',

  // Loyalty Program Settings
  loyaltyProgram: {
    enabled: true,
    pointsPerUnit: 1, // 1 point per 1,000 RWF
    unitAmount: 1000,
    threshold: 5000, // No points for orders at or below 5,000 RWF
    exchangeRate: 1300 // 1 USD = 1300 RWF
  },

  // Receipt Display Settings
  showReceiptId: true,
  showServerName: true,
  showTableNumber: true,
  showCustomerName: true,
  showSpecialInstructions: true,
  autoPrint: false,

  // Footer Message
  footerMessage: 'Thank you for chosing us!',
  
  // Social Media (optional)
  socialMedia: {
    instagram: '@servv_restaurant',
    facebook: 'ServvRestaurant'
  }
};

/**
 * Get the current receipt configuration
 * In production, this would fetch from a database/API
 */
export function getReceiptConfig(): ReceiptConfig {
  // Try to get from localStorage first (for customization)
  try {
    const savedConfig = localStorage.getItem('receiptConfig');
    if (savedConfig) {
      return { ...defaultReceiptConfig, ...JSON.parse(savedConfig) };
    }
  } catch (error) {
    console.warn('Failed to load receipt config from localStorage:', error);
  }
  
  return defaultReceiptConfig;
}

/**
 * Save receipt configuration
 * In production, this would save to a database/API
 */
export function saveReceiptConfig(config: Partial<ReceiptConfig>): void {
  try {
    const currentConfig = getReceiptConfig();
    const newConfig = { ...currentConfig, ...config };
    localStorage.setItem('receiptConfig', JSON.stringify(newConfig));
  } catch (error) {
    console.error('Failed to save receipt config:', error);
  }
}

/**
 * Reset receipt configuration to defaults
 */
export function resetReceiptConfig(): void {
  try {
    localStorage.removeItem('receiptConfig');
  } catch (error) {
    console.error('Failed to reset receipt config:', error);
  }
}

/**
 * Calculate loyalty points for an order
 */
export function calculateLoyaltyPoints(orderTotalAmount: number, config: ReceiptConfig = defaultReceiptConfig): number {
  if (!config.loyaltyProgram.enabled) {
    return 0;
  }

  const orderTotalRWF = config.currency === 'USD'
    ? orderTotalAmount * config.loyaltyProgram.exchangeRate
    : orderTotalAmount;
  
  // Check if order is above threshold
  if (orderTotalRWF <= config.loyaltyProgram.threshold) {
    return 0;
  }

  // Calculate eligible amount
  const eligibleAmount = orderTotalRWF - config.loyaltyProgram.threshold;
  
  // Calculate points
  return Math.floor(eligibleAmount / config.loyaltyProgram.unitAmount) * config.loyaltyProgram.pointsPerUnit;
}

/**
 * Format currency based on configuration
 */
export function formatReceiptCurrency(amount: number, config: ReceiptConfig = defaultReceiptConfig): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: config.currency === 'RWF' ? 0 : 2,
    maximumFractionDigits: config.currency === 'RWF' ? 0 : 2
  }).format(amount);
}