import type { CfRegion } from '../types/index.js';

export const CF_REGIONS: CfRegion[] = [
  { id: 'ap11', label: 'Singapore (ap11)', apiEndpoint: 'https://api.cf.ap11.hana.ondemand.com' },
  { id: 'ap12', label: 'Seoul (ap12)', apiEndpoint: 'https://api.cf.ap12.hana.ondemand.com' },
  { id: 'ap20', label: 'Sydney (ap20)', apiEndpoint: 'https://api.cf.ap20.hana.ondemand.com' },
  { id: 'ap21', label: 'Sydney (ap21)', apiEndpoint: 'https://api.cf.ap21.hana.ondemand.com' },
  { id: 'br10', label: 'Brazil (br10)', apiEndpoint: 'https://api.cf.br10.hana.ondemand.com' },
  { id: 'ca10', label: 'Canada (ca10)', apiEndpoint: 'https://api.cf.ca10.hana.ondemand.com' },
  { id: 'eu10', label: 'Frankfurt (eu10)', apiEndpoint: 'https://api.cf.eu10.hana.ondemand.com' },
  { id: 'eu11', label: 'Frankfurt (eu11)', apiEndpoint: 'https://api.cf.eu11.hana.ondemand.com' },
  { id: 'eu20', label: 'Netherlands (eu20)', apiEndpoint: 'https://api.cf.eu20.hana.ondemand.com' },
  { id: 'eu30', label: 'Frankfurt (eu30)', apiEndpoint: 'https://api.cf.eu30.hana.ondemand.com' },
  { id: 'in30', label: 'Mumbai (in30)', apiEndpoint: 'https://api.cf.in30.hana.ondemand.com' },
  { id: 'jp10', label: 'Japan (jp10)', apiEndpoint: 'https://api.cf.jp10.hana.ondemand.com' },
  { id: 'jp20', label: 'Japan (jp20)', apiEndpoint: 'https://api.cf.jp20.hana.ondemand.com' },
  { id: 'us10', label: 'US East (us10)', apiEndpoint: 'https://api.cf.us10.hana.ondemand.com' },
  { id: 'us20', label: 'US West (us20)', apiEndpoint: 'https://api.cf.us20.hana.ondemand.com' },
  { id: 'us21', label: 'US East (us21)', apiEndpoint: 'https://api.cf.us21.hana.ondemand.com' },
  { id: 'us30', label: 'US Central (us30)', apiEndpoint: 'https://api.cf.us30.hana.ondemand.com' },
];

export function getRegionById(id: string): CfRegion | undefined {
  return CF_REGIONS.find(r => r.id === id);
}

export function getOrCustomRegion(id: string, customEndpoint?: string): CfRegion {
  if (id === 'custom' && customEndpoint !== undefined) {
    return { id: 'custom', label: 'Custom', apiEndpoint: customEndpoint };
  }
  return getRegionById(id) ?? CF_REGIONS[0];
}
