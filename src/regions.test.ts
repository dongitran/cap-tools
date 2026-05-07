import { describe, expect, it } from 'vitest';

import { SAP_BTP_REGIONS, toHyphenatedRegionCode } from './regions';

function countByArea(area: string): number {
  return SAP_BTP_REGIONS.filter((region) => region.area === area).length;
}

describe('SAP_BTP_REGIONS', () => {
  it('contains 49 regions', () => {
    expect(SAP_BTP_REGIONS).toHaveLength(49);
  });

  it('keeps grouped distribution across areas', () => {
    expect(countByArea('Americas')).toBe(15);
    expect(countByArea('Europe')).toBe(15);
    expect(countByArea('Middle East and Africa')).toBe(4);
    expect(countByArea('Asia Pacific')).toBe(13);
    expect(countByArea('China')).toBe(2);
  });

  it('lists eu10-004 extension landscape in Americas picker group', () => {
    expect(SAP_BTP_REGIONS).toContainEqual({
      id: 'eu10-004',
      displayName: 'Europe (Frankfurt) - AWS Extension',
      area: 'Americas',
      provider: 'AWS',
    });
  });

  it('lists us10-001 extension landscape in Americas picker group', () => {
    expect(SAP_BTP_REGIONS).toContainEqual({
      id: 'us10-001',
      displayName: 'US East (VA) - AWS Extension',
      area: 'Americas',
      provider: 'AWS',
    });
  });

  it('lists current Cloud Foundry extension landscapes from SAP Help', () => {
    const extensionRegions = [
      {
        id: 'us10-002',
        displayName: 'US East (VA) - AWS Extension',
        area: 'Americas',
        provider: 'AWS',
      },
      {
        id: 'eu10-002',
        displayName: 'Europe (Frankfurt) - AWS Extension',
        area: 'Europe',
        provider: 'AWS',
      },
      {
        id: 'eu10-003',
        displayName: 'Europe (Frankfurt) - AWS Extension',
        area: 'Europe',
        provider: 'AWS',
      },
      {
        id: 'eu10-005',
        displayName: 'Europe (Frankfurt) - AWS Extension',
        area: 'Europe',
        provider: 'AWS',
      },
      {
        id: 'eu20-001',
        displayName: 'Europe (Netherlands) - Azure Extension',
        area: 'Europe',
        provider: 'Azure',
      },
      {
        id: 'eu20-002',
        displayName: 'Europe (Netherlands) - Azure Extension',
        area: 'Europe',
        provider: 'Azure',
      },
    ];

    for (const extensionRegion of extensionRegions) {
      expect(SAP_BTP_REGIONS).toContainEqual(extensionRegion);
    }
  });

  it('formats region code into hyphen form', () => {
    expect(toHyphenatedRegionCode('us10')).toBe('us-10');
    expect(toHyphenatedRegionCode('us-10')).toBe('us-10');
    expect(toHyphenatedRegionCode('CN40')).toBe('cn-40');
    expect(toHyphenatedRegionCode('us10001')).toBe('us10-001');
    expect(toHyphenatedRegionCode('US10-001')).toBe('us10-001');
    expect(toHyphenatedRegionCode('us10002')).toBe('us10-002');
    expect(toHyphenatedRegionCode('eu10002')).toBe('eu10-002');
    expect(toHyphenatedRegionCode('eu10003')).toBe('eu10-003');
    expect(toHyphenatedRegionCode('eu10004')).toBe('eu10-004');
    expect(toHyphenatedRegionCode('EU10-004')).toBe('eu10-004');
    expect(toHyphenatedRegionCode('eu10005')).toBe('eu10-005');
    expect(toHyphenatedRegionCode('eu20001')).toBe('eu20-001');
    expect(toHyphenatedRegionCode('EU20-002')).toBe('eu20-002');
  });
});
