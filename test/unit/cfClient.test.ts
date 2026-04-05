import { describe, it, expect } from 'vitest';
import { parseCfAppsOutput } from '../../src/core/cfClient';

describe('parseCfAppsOutput', () => {
  const SAMPLE_OUTPUT = `
Getting apps in org my-org / space dev as user@example.com...
OK

name               requested state   instances   memory   disk   urls
my-service-a       started           1/1         256M     1G     my-service-a.cfapps.ap11.hana.ondemand.com
my-service-b       started           2/2         512M     1G     my-service-b.cfapps.ap11.hana.ondemand.com
old-gateway        stopped           0/1         256M     1G
`;

  it('parses started and stopped apps', () => {
    const apps = parseCfAppsOutput(SAMPLE_OUTPUT);
    expect(apps).toHaveLength(3);
    expect(apps[0].name).toBe('my-service-a');
    expect(apps[0].state).toBe('STARTED');
    expect(apps[1].name).toBe('my-service-b');
    expect(apps[1].state).toBe('STARTED');
    expect(apps[2].name).toBe('old-gateway');
    expect(apps[2].state).toBe('STOPPED');
  });

  it('parses app URLs', () => {
    const apps = parseCfAppsOutput(SAMPLE_OUTPUT);
    expect(apps[0].urls).toContain('my-service-a.cfapps.ap11.hana.ondemand.com');
    expect(apps[2].urls).toHaveLength(0);
  });

  it('returns empty array for empty output', () => {
    const apps = parseCfAppsOutput('Getting apps...\nNo apps found');
    expect(apps).toHaveLength(0);
  });

  it('handles output without header', () => {
    const apps = parseCfAppsOutput('');
    expect(apps).toEqual([]);
  });
});
