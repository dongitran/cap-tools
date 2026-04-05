import { describe, it, expect } from 'vitest';
import { allocatePort } from '../../src/features/debug/appMapper';

describe('allocatePort', () => {
  it('returns basePort when no ports used', () => {
    const used = new Set<number>();
    expect(allocatePort(9229, used)).toBe(9229);
    expect(used.has(9229)).toBe(true);
  });

  it('skips used ports', () => {
    const used = new Set([9229, 9230]);
    expect(allocatePort(9229, used)).toBe(9231);
    expect(used.has(9231)).toBe(true);
  });

  it('allocates sequential ports for multiple calls', () => {
    const used = new Set<number>();
    const p1 = allocatePort(9229, used);
    const p2 = allocatePort(9229, used);
    const p3 = allocatePort(9229, used);
    expect([p1, p2, p3]).toEqual([9229, 9230, 9231]);
  });
});
