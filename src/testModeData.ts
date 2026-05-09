import type { CfTopology, CfTopologyOrg } from './cfTopology';

interface MockOrg {
  readonly guid: string;
  readonly name: string;
}

const DEFAULT_MOCK_ORGS: readonly MockOrg[] = [
  { guid: 'org-core-prod', name: 'core-platform-prod' },
  { guid: 'org-finance-prod', name: 'finance-services-prod' },
  { guid: 'org-retail-prod', name: 'retail-experience-prod' },
  { guid: 'org-data-prod', name: 'data-foundation-prod' },
  { guid: 'org-apps-proof', name: 'apps-proof-prod' },
] as const;

const BR10_MOCK_ORGS: readonly MockOrg[] = [
  { guid: 'org-br10-core-platform', name: 'core-platform-prod' },
  { guid: 'org-br10-finance-services', name: 'finance-services-prod' },
  { guid: 'org-br10-retail-experience', name: 'retail-experience-prod' },
  { guid: 'org-br10-data-foundation', name: 'data-foundation-prod' },
  { guid: 'org-br10-tax-engineering', name: 'tax-engineering-prod' },
  { guid: 'org-br10-payments-ledger', name: 'payments-ledger-prod' },
  { guid: 'org-br10-supply-chain', name: 'supply-chain-control-prod' },
  { guid: 'org-br10-customer-insights', name: 'customer-insights-prod' },
  { guid: 'org-br10-partner-gateway', name: 'partner-gateway-prod' },
  { guid: 'org-br10-revenue-ops', name: 'revenue-operations-prod' },
  { guid: 'org-br10-commerce-catalog', name: 'commerce-catalog-prod' },
  { guid: 'org-br10-risk-compliance', name: 'risk-compliance-prod' },
  { guid: 'org-br10-identity-access', name: 'identity-access-prod' },
  {
    guid: 'org-br10-billing-reconciliation',
    name: 'billing-reconciliation-prod',
  },
] as const;

const MOCK_SPACES: Record<string, readonly { name: string }[]> = {
  'core-platform-prod': [{ name: 'prod' }, { name: 'staging' }, { name: 'integration' }],
  'finance-services-prod': [{ name: 'prod' }, { name: 'uat' }, { name: 'sandbox' }],
  'retail-experience-prod': [{ name: 'prod' }, { name: 'campaigns' }, { name: 'performance' }],
  'data-foundation-prod': [
    { name: 'prod' },
    { name: 'etl' },
    { name: 'observability' },
    { name: 'noapps' },
    { name: 'failspace' },
  ],
  'apps-proof-prod': [{ name: 'proofspace' }],
  'tax-engineering-prod': [{ name: 'prod' }, { name: 'uat' }],
  'payments-ledger-prod': [{ name: 'prod' }, { name: 'staging' }],
  'supply-chain-control-prod': [{ name: 'prod' }, { name: 'integration' }],
  'customer-insights-prod': [{ name: 'prod' }, { name: 'performance' }],
  'partner-gateway-prod': [{ name: 'prod' }, { name: 'sandbox' }],
  'revenue-operations-prod': [{ name: 'prod' }, { name: 'uat' }, { name: 'observability' }],
  'commerce-catalog-prod': [{ name: 'prod' }, { name: 'campaigns' }],
  'risk-compliance-prod': [{ name: 'prod' }, { name: 'staging' }, { name: 'observability' }],
  'identity-access-prod': [{ name: 'prod' }, { name: 'integration' }, { name: 'sandbox' }],
  'billing-reconciliation-prod': [{ name: 'prod' }, { name: 'uat' }, { name: 'etl' }],
};

const MOCK_APPS_BY_SPACE: Record<string, readonly string[]> = {
  noapps: [],
  prod: ['billing-api', 'payments-worker', 'audit-service', 'destination-adapter'],
  staging: ['billing-api-staging', 'payments-worker-staging', 'audit-service-staging'],
  integration: ['billing-api-int', 'payments-worker-int', 'events-int-consumer'],
  uat: ['finance-uat-api', 'finance-uat-worker', 'finance-uat-audit'],
  sandbox: ['sandbox-api', 'sandbox-worker', 'sandbox-observer'],
  campaigns: ['campaign-engine', 'campaign-events', 'campaign-content'],
  performance: ['perf-api', 'perf-worker', 'perf-load-probe'],
  etl: ['etl-scheduler', 'etl-transformer', 'etl-writer'],
  observability: ['metrics-collector', 'traces-forwarder', 'alerts-dispatcher'],
  proofspace: ['proof-gateway', 'proof-worker'],
};

function buildSqlStressUatApps(): readonly string[] {
  return [
    'finance-uat-api',
    'finance-uat-worker',
    'finance-uat-audit',
    'finance-uat-ledger',
    'finance-uat-recon',
    'finance-uat-payments',
    'finance-uat-tax',
    'finance-uat-fx',
    'finance-uat-risk',
    'finance-uat-notify',
    'finance-uat-reporting',
    'finance-uat-archive',
  ];
}

export function resolveMockOrgsForRegion(regionCode: string): readonly MockOrg[] {
  const normalizedRegionCode = regionCode.trim().toLowerCase();
  if (normalizedRegionCode === 'br-10') {
    return BR10_MOCK_ORGS;
  }
  return DEFAULT_MOCK_ORGS;
}

export function resolveMockSpacesForOrg(org: {
  readonly guid: string;
  readonly name: string;
}): readonly { name: string }[] {
  const spacesByName = MOCK_SPACES[org.name];
  if (spacesByName !== undefined) {
    return spacesByName;
  }
  return MOCK_SPACES['core-platform-prod'] ?? [];
}

interface MockRegionDefinition {
  readonly regionKey: string;
  readonly regionLabel: string;
  readonly apiEndpoint: string;
  readonly orgs: readonly MockOrg[];
}

const MOCK_TOPOLOGY_REGIONS: readonly MockRegionDefinition[] = [
  {
    regionKey: 'us10',
    regionLabel: 'US East (VA) - AWS (us10)',
    apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
    orgs: DEFAULT_MOCK_ORGS,
  },
  {
    regionKey: 'br10',
    regionLabel: 'Brazil (Sao Paulo) - AWS (br10)',
    apiEndpoint: 'https://api.cf.br10.hana.ondemand.com',
    orgs: BR10_MOCK_ORGS,
  },
];

export function resolveMockCfTopology(): CfTopology {
  if (process.env['SAP_TOOLS_E2E_DISABLE_TOPOLOGY'] === '1') {
    return { ready: false, accounts: [] };
  }
  if (process.env['SAP_TOOLS_E2E_EMPTY_TOPOLOGY'] === '1') {
    return { ready: true, accounts: [] };
  }

  const accounts: CfTopologyOrg[] = [];
  for (const region of MOCK_TOPOLOGY_REGIONS) {
    for (const org of region.orgs) {
      const spaces = (MOCK_SPACES[org.name] ?? []).map((space) => space.name);
      accounts.push({
        regionKey: region.regionKey,
        regionLabel: region.regionLabel,
        apiEndpoint: region.apiEndpoint,
        orgName: org.name,
        spaces,
      });
    }
  }

  accounts.sort((left, right) => {
    const orgCompare = left.orgName.localeCompare(right.orgName);
    if (orgCompare !== 0) return orgCompare;
    return left.regionKey.localeCompare(right.regionKey);
  });

  return {
    ready: accounts.length > 0,
    accounts,
  };
}

export function resolveMockApps(spaceName: string): string[] {
  const key = spaceName.trim().toLowerCase();
  if (key === 'uat' && process.env['SAP_TOOLS_E2E_SQL_MANY_APPS'] === '1') {
    return [...buildSqlStressUatApps()];
  }

  const apps = MOCK_APPS_BY_SPACE[key];
  if (apps !== undefined) {
    return [...apps];
  }

  const fallbackPrefix = key.length > 0 ? key : 'space';
  return [`${fallbackPrefix}-api`, `${fallbackPrefix}-worker`, `${fallbackPrefix}-jobs`];
}
