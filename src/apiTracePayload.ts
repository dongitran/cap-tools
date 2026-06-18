import { truncatePreview } from './apiTracePreview';
import type { ApiTraceEvent } from './apiTraceTypes';

export interface ApiTraceDrainParseOptions {
  readonly appId: string;
  readonly maxBodyBytes: number;
}

export interface ApiTraceDrainParseResult {
  readonly events: readonly ApiTraceEvent[];
  readonly droppedCount: number;
  readonly queueSize: number;
}

let fallbackEventId = 0;

export function parseApiTraceDrainResult(
  payload: unknown,
  options: ApiTraceDrainParseOptions
): ApiTraceDrainParseResult {
  if (!isRecord(payload)) {
    return { events: [], droppedCount: 0, queueSize: 0 };
  }
  const rawEvents = Array.isArray(payload['events']) ? payload['events'] : [];
  return {
    events: rawEvents
      .map((event) => parseRuntimeTraceEvent(event, options))
      .filter((event): event is ApiTraceEvent => event !== null),
    droppedCount: readNonNegativeNumber(payload['droppedCount']),
    queueSize: readNonNegativeNumber(payload['queueSize']),
  };
}

function parseRuntimeTraceEvent(
  payload: unknown,
  options: ApiTraceDrainParseOptions
): ApiTraceEvent | null {
  if (!isRecord(payload)) {
    return null;
  }
  const rawUrl = readString(payload['url']) ?? readString(payload['normalizedUrl']) ?? readString(payload['path']);
  if (rawUrl === null) {
    return null;
  }
  const requestBody = truncatePreview(readString(payload['requestBodyPreview']) ?? '', options.maxBodyBytes);
  const responseBody = truncatePreview(readString(payload['responseBodyPreview']) ?? '', options.maxBodyBytes);
  return {
    id: readString(payload['id']) ?? nextFallbackEventId(),
    timestamp: readString(payload['timestamp']) ?? new Date().toISOString(),
    appId: options.appId,
    instance: readString(payload['instance']) ?? '0',
    method: (readString(payload['method']) ?? 'GET').toUpperCase(),
    path: readString(payload['path']) ?? normalizePath(rawUrl),
    url: rawUrl,
    normalizedUrl: readString(payload['normalizedUrl']) ?? normalizePath(rawUrl),
    status: readNullableNumber(payload['status']),
    durationMs: readNullableNumber(payload['durationMs']),
    requestBytes: readNonNegativeNumber(payload['requestBytes']),
    responseBytes: readNonNegativeNumber(payload['responseBytes']),
    requestHeaders: readHeaders(payload['requestHeaders']),
    responseHeaders: readHeaders(payload['responseHeaders']),
    requestBodyPreview: requestBody.preview,
    responseBodyPreview: responseBody.preview,
    requestBodyTruncated: payload['requestBodyTruncated'] === true || requestBody.truncated,
    responseBodyTruncated: payload['responseBodyTruncated'] === true || responseBody.truncated,
    droppedBeforeEvent: readNonNegativeNumber(payload['droppedBeforeEvent']),
    source: 'runtime-http',
    traceId: readString(payload['traceId']) ?? readString(payload['id']) ?? '',
    correlationId: readString(payload['correlationId']),
  };
}

function readHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const headers: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === 'string') {
      headers[key] = rawValue;
    } else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      headers[key] = String(rawValue);
    } else if (Array.isArray(rawValue)) {
      headers[key] = rawValue.map((item) => String(item)).join(', ');
    }
  }
  return headers;
}

function normalizePath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'https://saptools.local');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function nextFallbackEventId(): string {
  fallbackEventId += 1;
  return `runtime-${String(fallbackEventId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
