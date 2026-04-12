export const REGION_GROUPS = [
  {
    id: 'americas',
    label: 'Americas (br - ca - us)',
    regions: [
      { id: 'us01', name: 'US (Sterling) - SAP', code: 'us-01' },
      { id: 'us02', name: 'US West (Colorado) - SAP', code: 'us-02' },
      { id: 'us10', name: 'US East (VA) - AWS', code: 'us-10' },
      { id: 'us11', name: 'US West (Oregon) - AWS', code: 'us-11' },
      { id: 'us20', name: 'US West (WA) - Azure', code: 'us-20' },
      { id: 'us21', name: 'US East (VA) - Azure', code: 'us-21' },
      { id: 'us30', name: 'US Central (IA) - GCP', code: 'us-30' },
      { id: 'ca10', name: 'Canada (Montreal) - AWS', code: 'ca-10' },
      { id: 'ca20', name: 'Canada Central (Toronto) - Azure', code: 'ca-20' },
      { id: 'br10', name: 'Brazil (Sao Paulo) - AWS', code: 'br-10' },
      { id: 'br20', name: 'Brazil (Sao Paulo) - Azure', code: 'br-20' },
      { id: 'br30', name: 'Brazil (Sao Paulo) - GCP', code: 'br-30' },
    ],
  },
  {
    id: 'europe',
    label: 'Europe (ch - eu - uk)',
    regions: [
      { id: 'eu01', name: 'Europe (Frankfurt) - SAP EU Access', code: 'eu-01' },
      { id: 'eu02', name: 'Europe (Rot) - SAP EU Access', code: 'eu-02' },
      { id: 'eu10', name: 'Europe (Frankfurt) - AWS', code: 'eu-10' },
      { id: 'eu11', name: 'Europe (Frankfurt) - AWS', code: 'eu-11' },
      { id: 'eu13', name: 'Europe (Milan) - AWS', code: 'eu-13' },
      { id: 'eu20', name: 'Europe (Netherlands) - Azure', code: 'eu-20' },
      { id: 'eu22', name: 'Europe (Frankfurt) - Azure', code: 'eu-22' },
      { id: 'eu30', name: 'Europe (Frankfurt) - GCP', code: 'eu-30' },
      { id: 'uk20', name: 'UK South (London) - Azure', code: 'uk-20' },
      { id: 'ch20', name: 'Switzerland (Zurich) - Azure', code: 'ch-20' },
    ],
  },
  {
    id: 'asia-pacific',
    label: 'Asia Pacific (ap - in - jp)',
    regions: [
      { id: 'ap01', name: 'Australia (Sydney) - SAP', code: 'ap-01' },
      { id: 'ap10', name: 'Australia (Sydney) - AWS', code: 'ap-10' },
      { id: 'ap11', name: 'Asia Pacific (Singapore) - AWS', code: 'ap-11' },
      { id: 'ap12', name: 'Asia Pacific (Seoul) - AWS', code: 'ap-12' },
      { id: 'ap20', name: 'Australia (Sydney) - Azure', code: 'ap-20' },
      { id: 'ap21', name: 'Singapore - Azure', code: 'ap-21' },
      { id: 'ap30', name: 'Australia (Sydney) - GCP', code: 'ap-30' },
      { id: 'jp01', name: 'Japan (Tokyo) - SAP', code: 'jp-01' },
      { id: 'jp10', name: 'Japan (Tokyo) - AWS', code: 'jp-10' },
      { id: 'jp20', name: 'Japan (Tokyo) - Azure', code: 'jp-20' },
      { id: 'jp30', name: 'Japan (Osaka) - GCP', code: 'jp-30' },
      { id: 'jp31', name: 'Japan (Tokyo) - GCP', code: 'jp-31' },
      { id: 'in30', name: 'India (Mumbai) - GCP', code: 'in-30' },
    ],
  },
  {
    id: 'middle-east-africa',
    label: 'Middle East & Africa (ae - il - sa)',
    regions: [
      { id: 'ae01', name: 'UAE (Dubai) - SAP', code: 'ae-01' },
      { id: 'il30', name: 'Israel (Tel Aviv) - GCP', code: 'il-30' },
      {
        id: 'sa30',
        name: 'KSA (Dammam - Regulated) - GCP',
        code: 'sa-30',
      },
      {
        id: 'sa31',
        name: 'KSA (Dammam - Non-Regulated) - GCP',
        code: 'sa-31',
      },
    ],
  },
  {
    id: 'china',
    label: 'China (cn)',
    regions: [
      { id: 'cn20', name: 'China (North 3) - Azure', code: 'cn-20' },
      { id: 'cn40', name: 'China (Shanghai) - Alibaba', code: 'cn-40' },
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
