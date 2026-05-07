// cspell:words sapcloud
export function getCfApiEndpoint(regionCode: string): string {
  const regionId = normalizeRegionHostSegment(regionCode);
  if (regionId.startsWith('cn')) {
    return `https://api.cf.${regionId}.platform.sapcloud.cn`;
  }
  return `https://api.cf.${regionId}.hana.ondemand.com`;
}

function normalizeRegionHostSegment(regionCode: string): string {
  const normalized = regionCode.trim().toLowerCase();
  const compact = normalized.replaceAll('-', '');

  if (/^[a-z]{2}\d{5}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }

  return compact;
}
