import { describe, expect, it } from 'vitest';
import { isPhone, PHONE_MAX_SHORT_SIDE } from './deviceGate';

describe('desktop-only gate', () => {
  it('stops touch-only phones, portrait and landscape', () => {
    expect(isPhone({ touchOnly: true, screenWidth: 390, screenHeight: 844 })).toBe(true);
    expect(isPhone({ touchOnly: true, screenWidth: 932, screenHeight: 430 })).toBe(true);
  });
  it('lets tablets, touchscreen laptops and narrow desktop windows through', () => {
    expect(isPhone({ touchOnly: true, screenWidth: 820, screenHeight: 1180 })).toBe(false);   // tablet
    expect(isPhone({ touchOnly: false, screenWidth: 1440, screenHeight: 900 })).toBe(false);  // laptop, touch or not
    expect(isPhone({ touchOnly: false, screenWidth: 390, screenHeight: 844 })).toBe(false);   // desktop at phone width
    expect(PHONE_MAX_SHORT_SIDE).toBe(600);
  });
});
