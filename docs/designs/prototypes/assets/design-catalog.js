export const REGION_GROUPS = [
  {
    id: 'americas',
    label: 'Americas (br - ca - us)',
    regions: [
      { id: 'br10', name: 'Brazil (Sao Paulo)', code: 'br-10' },
      { id: 'br20', name: 'Brazil (Sao Paulo)', code: 'br-20' },
      { id: 'br30', name: 'Brazil (Sao Paulo)', code: 'br-30' },
      { id: 'ca10', name: 'Canada (Montreal)', code: 'ca-10' },
      { id: 'ca20', name: 'Canada Central (Toronto)', code: 'ca-20' },
      { id: 'us01', name: 'US (Sterling)', code: 'us-01' },
      { id: 'us30', name: 'US Central (IA)', code: 'us-30' },
      { id: 'us10', name: 'US East (VA)', code: 'us-10' },
      { id: 'us21', name: 'US East (VA)', code: 'us-21' },
      { id: 'us10-001', name: 'US East (VA) Extension', code: 'us10-001' },
      { id: 'us10-002', name: 'US East (VA) Extension', code: 'us10-002' },
      { id: 'us02', name: 'US West (Colorado)', code: 'us-02' },
      { id: 'us11', name: 'US West (Oregon)', code: 'us-11' },
      { id: 'us20', name: 'US West (WA)', code: 'us-20' },
    ],
  },
  {
    id: 'europe',
    label: 'Europe (ch - eu - uk)',
    regions: [
      { id: 'eu10', name: 'Europe (Frankfurt)', code: 'eu-10' },
      { id: 'eu11', name: 'Europe (Frankfurt)', code: 'eu-11' },
      { id: 'eu22', name: 'Europe (Frankfurt)', code: 'eu-22' },
      { id: 'eu30', name: 'Europe (Frankfurt)', code: 'eu-30' },
      { id: 'eu01', name: 'Europe (Frankfurt) EU Access', code: 'eu-01' },
      { id: 'eu10-002', name: 'Europe (Frankfurt) Extension', code: 'eu10-002' },
      { id: 'eu10-003', name: 'Europe (Frankfurt) Extension', code: 'eu10-003' },
      { id: 'eu10-004', name: 'Europe (Frankfurt) Extension', code: 'eu10-004' },
      { id: 'eu10-005', name: 'Europe (Frankfurt) Extension', code: 'eu10-005' },
      { id: 'eu13', name: 'Europe (Milan)', code: 'eu-13' },
      { id: 'eu20', name: 'Europe (Netherlands)', code: 'eu-20' },
      { id: 'eu20-001', name: 'Europe (Netherlands) Extension', code: 'eu20-001' },
      { id: 'eu20-002', name: 'Europe (Netherlands) Extension', code: 'eu20-002' },
      { id: 'eu02', name: 'Europe (Rot) EU Access', code: 'eu-02' },
      { id: 'ch20', name: 'Switzerland (Zurich)', code: 'ch-20' },
      { id: 'uk20', name: 'UK South (London)', code: 'uk-20' },
    ],
  },
  {
    id: 'asia-pacific',
    label: 'Asia Pacific (ap - in - jp)',
    regions: [
      { id: 'ap12', name: 'Asia Pacific (Seoul)', code: 'ap-12' },
      { id: 'ap11', name: 'Asia Pacific (Singapore)', code: 'ap-11' },
      { id: 'ap01', name: 'Australia (Sydney)', code: 'ap-01' },
      { id: 'ap10', name: 'Australia (Sydney)', code: 'ap-10' },
      { id: 'ap20', name: 'Australia (Sydney)', code: 'ap-20' },
      { id: 'ap30', name: 'Australia (Sydney)', code: 'ap-30' },
      { id: 'in30', name: 'India (Mumbai)', code: 'in-30' },
      { id: 'jp30', name: 'Japan (Osaka)', code: 'jp-30' },
      { id: 'jp01', name: 'Japan (Tokyo)', code: 'jp-01' },
      { id: 'jp10', name: 'Japan (Tokyo)', code: 'jp-10' },
      { id: 'jp20', name: 'Japan (Tokyo)', code: 'jp-20' },
      { id: 'jp31', name: 'Japan (Tokyo)', code: 'jp-31' },
      { id: 'ap21', name: 'Singapore', code: 'ap-21' },
    ],
  },
  {
    id: 'middle-east-africa',
    label: 'Middle East & Africa (ae - il - sa)',
    regions: [
      { id: 'il30', name: 'Israel (Tel Aviv)', code: 'il-30' },
      {
        id: 'sa31',
        name: 'KSA (Dammam Non-Regulated)',
        code: 'sa-31',
      },
      {
        id: 'sa30',
        name: 'KSA (Dammam Regulated)',
        code: 'sa-30',
      },
      { id: 'ae01', name: 'UAE (Dubai)', code: 'ae-01' },
    ],
  },
  {
    id: 'china',
    label: 'China (cn)',
    regions: [
      { id: 'cn20', name: 'China (North 3)', code: 'cn-20' },
      { id: 'cn40', name: 'China (Shanghai)', code: 'cn-40' },
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
