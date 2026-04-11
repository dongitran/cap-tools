export const REGION_AREAS = [
  'Americas',
  'Europe',
  'Middle East and Africa',
  'Asia Pacific',
] as const;

export type RegionArea = (typeof REGION_AREAS)[number];

export const PROVIDERS = ['AWS', 'Azure', 'GCP'] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface SapBtpRegion {
  readonly id: string;
  readonly displayName: string;
  readonly area: RegionArea;
  readonly provider: Provider;
}

export const SAP_BTP_REGIONS: readonly SapBtpRegion[] = [
  { id: 'us10', displayName: 'US East (VA)', area: 'Americas', provider: 'AWS' },
  { id: 'us20', displayName: 'US West (WA)', area: 'Americas', provider: 'AWS' },
  { id: 'us30', displayName: 'US East (IA)', area: 'Americas', provider: 'AWS' },
  {
    id: 'ca10',
    displayName: 'Canada (Toronto)',
    area: 'Americas',
    provider: 'AWS',
  },
  {
    id: 'br10',
    displayName: 'Brazil (Sao Paulo)',
    area: 'Americas',
    provider: 'AWS',
  },
  {
    id: 'mx10',
    displayName: 'Mexico (Queretaro)',
    area: 'Americas',
    provider: 'Azure',
  },
  {
    id: 'eu10',
    displayName: 'Germany (Frankfurt)',
    area: 'Europe',
    provider: 'AWS',
  },
  {
    id: 'eu11',
    displayName: 'Germany (Frankfurt) - Azure',
    area: 'Europe',
    provider: 'Azure',
  },
  {
    id: 'eu20',
    displayName: 'Netherlands (Amsterdam)',
    area: 'Europe',
    provider: 'Azure',
  },
  {
    id: 'eu30',
    displayName: 'United Kingdom (London)',
    area: 'Europe',
    provider: 'Azure',
  },
  {
    id: 'eu40',
    displayName: 'Switzerland (Zurich)',
    area: 'Europe',
    provider: 'GCP',
  },
  {
    id: 'eu50',
    displayName: 'Sweden (Stockholm)',
    area: 'Europe',
    provider: 'Azure',
  },
  {
    id: 'eu60',
    displayName: 'Spain (Madrid)',
    area: 'Europe',
    provider: 'Azure',
  },
  {
    id: 'me10',
    displayName: 'United Arab Emirates (Dubai)',
    area: 'Middle East and Africa',
    provider: 'Azure',
  },
  {
    id: 'me20',
    displayName: 'Qatar (Doha)',
    area: 'Middle East and Africa',
    provider: 'GCP',
  },
  {
    id: 'me30',
    displayName: 'Saudi Arabia (Riyadh)',
    area: 'Middle East and Africa',
    provider: 'Azure',
  },
  {
    id: 'af10',
    displayName: 'South Africa (Johannesburg)',
    area: 'Middle East and Africa',
    provider: 'Azure',
  },
  {
    id: 'ap10',
    displayName: 'Singapore - AWS',
    area: 'Asia Pacific',
    provider: 'AWS',
  },
  {
    id: 'ap11',
    displayName: 'Singapore - Azure',
    area: 'Asia Pacific',
    provider: 'Azure',
  },
  {
    id: 'ap20',
    displayName: 'Australia (Sydney)',
    area: 'Asia Pacific',
    provider: 'Azure',
  },
  {
    id: 'ap30',
    displayName: 'Australia (Melbourne)',
    area: 'Asia Pacific',
    provider: 'Azure',
  },
  {
    id: 'jp10',
    displayName: 'Japan (Tokyo)',
    area: 'Asia Pacific',
    provider: 'AWS',
  },
  {
    id: 'jp20',
    displayName: 'Japan (Osaka)',
    area: 'Asia Pacific',
    provider: 'Azure',
  },
  {
    id: 'kr10',
    displayName: 'South Korea (Seoul)',
    area: 'Asia Pacific',
    provider: 'AWS',
  },
  {
    id: 'in30',
    displayName: 'India (Mumbai)',
    area: 'Asia Pacific',
    provider: 'AWS',
  },
] as const;
