import { describe, expect, it } from 'vitest';

import {
  API_TRACE_GLOBAL_NAME,
  API_TRACE_RUNTIME_SOURCE,
  buildApiTraceDrainExpression,
  buildApiTraceInstallExpression,
  buildApiTraceStopExpression,
} from './apiTraceInjectionSource';

describe('apiTraceInjectionSource', () => {
  it('defines a bounded runtime queue with install, drain, disable, and uninstall controls', () => {
    expect(API_TRACE_GLOBAL_NAME).toBe('__SAP_TOOLS_HTTP_TRACE__');
    expect(API_TRACE_RUNTIME_SOURCE).toContain('__SAP_TOOLS_HTTP_TRACE__');
    expect(API_TRACE_RUNTIME_SOURCE).toContain('drainEvents');
    expect(API_TRACE_RUNTIME_SOURCE).toContain('uninstall');
    expect(API_TRACE_RUNTIME_SOURCE).toContain('disable');
    expect(API_TRACE_RUNTIME_SOURCE).toContain('maxEvents');
    expect(API_TRACE_RUNTIME_SOURCE).not.toContain('console.log');
    expect(API_TRACE_RUNTIME_SOURCE).not.toContain(['S', 'MDG_REQUEST_TRACE'].join(''));
  });

  it('builds static Runtime.evaluate expressions for install, drain, and stop', () => {
    expect(
      buildApiTraceInstallExpression({
        appId: 'finance-uat-api',
        instance: '0',
        captureHeaders: true,
        captureRequestBody: true,
        captureResponseBody: true,
        maxBodyBytes: 4096,
        maxEvents: 1000,
      })
    ).toContain('.install({');
    expect(buildApiTraceDrainExpression(50)).toContain('.drainEvents(50)');
    expect(buildApiTraceStopExpression(true)).toContain('.uninstall()');
    expect(buildApiTraceStopExpression(false)).toContain('.disable()');
  });
});
