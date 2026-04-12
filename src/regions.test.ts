import { describe, expect, it } from 'vitest';

import { SAP_BTP_REGIONS } from './regions';

function countByArea(area: string): number {
  return SAP_BTP_REGIONS.filter((region) => region.area === area).length;
}

describe('SAP_BTP_REGIONS', () => {
  it('contains 41 regions', () => {
    expect(SAP_BTP_REGIONS).toHaveLength(41);
  });

  it('keeps grouped distribution across areas', () => {
    expect(countByArea('Americas')).toBe(12);
    expect(countByArea('Europe')).toBe(10);
    expect(countByArea('Middle East and Africa')).toBe(4);
    expect(countByArea('Asia Pacific')).toBe(13);
    expect(countByArea('China')).toBe(2);
  });
});
