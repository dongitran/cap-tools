export const REGION_GROUPS = [
  {
    id: 'americas',
    label: 'Americas',
    regions: [
      { id: 'eastus', name: 'US East', code: 'us-10' },
      { id: 'eastus2', name: 'US East 2', code: 'us-11' },
      { id: 'westus', name: 'US West', code: 'us-20' },
      { id: 'westus2', name: 'US West 2', code: 'us-21' },
      { id: 'southcentralus', name: 'South Central US', code: 'us-30' },
      { id: 'canadacentral', name: 'Canada Central', code: 'ca-10' },
      { id: 'brazilsouth', name: 'Brazil South', code: 'br-10' },
    ],
  },
  {
    id: 'europe',
    label: 'Europe',
    regions: [
      { id: 'westeurope', name: 'West Europe', code: 'eu-10' },
      { id: 'northeurope', name: 'North Europe', code: 'eu-11' },
      { id: 'centraleurope', name: 'Central Europe', code: 'eu-12' },
      { id: 'uksouth', name: 'UK South', code: 'uk-10' },
      { id: 'germanywestcentral', name: 'Germany West Central', code: 'de-10' },
      { id: 'switzerlandnorth', name: 'Switzerland North', code: 'ch-10' },
      { id: 'swedencentral', name: 'Sweden Central', code: 'se-10' },
      { id: 'francecentral', name: 'France Central', code: 'fr-10' },
    ],
  },
  {
    id: 'asia-pacific',
    label: 'Asia Pacific',
    regions: [
      { id: 'eastasia', name: 'East Asia', code: 'hk-10' },
      { id: 'southeastasia', name: 'Southeast Asia', code: 'sg-10' },
      { id: 'japaneast', name: 'Japan East', code: 'jp-10' },
      { id: 'japanwest', name: 'Japan West', code: 'jp-11' },
      { id: 'koreacentral', name: 'Korea Central', code: 'kr-10' },
      { id: 'australiaeast', name: 'Australia East', code: 'au-10' },
      { id: 'australiasoutheast', name: 'Australia Southeast', code: 'au-11' },
    ],
  },
  {
    id: 'middle-east-africa',
    label: 'Middle East & Africa',
    regions: [
      { id: 'uaenorth', name: 'UAE North', code: 'ae-10' },
      { id: 'qatarcentral', name: 'Qatar Central', code: 'qa-10' },
      { id: 'southafricanorth', name: 'South Africa North', code: 'za-10' },
    ],
  },
];

export const DESIGN_CATALOG = [
  {
    id: 34,
    name: 'Solar Frame',
    subtitle: '',
    layout: 'chips',
    pattern: 'bars',
    selectStyle: 'underline',
    typography: {
      title: '"Gill Sans", "Trebuchet MS", sans-serif',
      body: '"Verdana", "Tahoma", sans-serif',
    },
    colors: {
      page: '#fff7eb',
      frame: '#fffdfa',
      surface: '#fff5e6',
      border: '#efd1a8',
      text: '#4d2f12',
      muted: '#845f34',
      accent: '#dd7a12',
      accentSoft: '#ffe3c0',
      chipText: '#6f3f09',
    },
    shadow: '0 15px 38px rgba(124, 66, 10, 0.2)',
  },
];

export const TOTAL_REGION_COUNT = REGION_GROUPS.reduce((count, group) => {
  return count + group.regions.length;
}, 0);

export function formatDesignFilename(designId) {
  const paddedId = String(designId).padStart(2, '0');
  return `design-${paddedId}.html`;
}
