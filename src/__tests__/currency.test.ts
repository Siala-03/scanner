import { describe, expect, it } from 'vitest';
import { formatPrice } from '../utils/currency';

describe('formatPrice', () => {
  it('formats number with RWF and comma separators', () => {
    expect(formatPrice(1000)).toBe('RWF 1,000');
    expect(formatPrice(1234567)).toBe('RWF 1,234,567');
  });

  it('formats 0 as RWF 0', () => {
    expect(formatPrice(0)).toBe('RWF 0');
  });
});
