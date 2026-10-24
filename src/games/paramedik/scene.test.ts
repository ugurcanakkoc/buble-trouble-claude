import { describe, expect, it } from 'vitest';
import { actLabel, cprQuality } from './panels';

describe('paramedik scene helpers', () => {
  it('cprQuality: perfect tempo = 1, double tempo fails, too few taps = 0', () => {
    const at = (ms: number) => Array.from({ length: 30 }, (_, i) => i * ms);
    expect(cprQuality(at(500), 120)).toBe(1);
    expect(cprQuality(at(250), 120)).toBe(0);
    expect(cprQuality(at(550), 120)).toBeCloseTo(0.8, 2);
    expect(cprQuality([0], 110)).toBe(0);
  });
  it('actLabel reads action keys in Turkish', () => {
    expect(actLabel('ilac:mavi:2')).toBe('Mavi ampul 2 tık');
    expect(actLabel('triyaj:kirmizi')).toBe('Triyaj Kırmızı');
    expect(actLabel('status:arrest')).toBe('Durum: Arrest!');
  });
});
