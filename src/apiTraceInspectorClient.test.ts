import { describe, expect, it } from 'vitest';

import {
  buildRuntimeEvaluateRequest,
  extractInspectorEvaluateValue,
  parseInspectorTargetList,
} from './apiTraceInspectorClient';

describe('apiTraceInspectorClient', () => {
  it('rewrites inspector websocket URLs to the local tunnel port', () => {
    expect(
      parseInspectorTargetList(
        [
          {
            type: 'node',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9229/abc-def',
          },
        ],
        51234
      )
    ).toBe('ws://127.0.0.1:51234/abc-def');
  });

  it('extracts returnByValue Runtime.evaluate results', () => {
    expect(
      extractInspectorEvaluateValue({
        id: 1,
        result: {
          result: {
            type: 'object',
            value: { ok: true },
          },
        },
      })
    ).toEqual({ ok: true });
  });

  it('throws a generic error when Runtime.evaluate reports an exception', () => {
    expect(() =>
      extractInspectorEvaluateValue({
        id: 1,
        result: {
          exceptionDetails: {
            text: 'ReferenceError',
          },
        },
      })
    ).toThrow('Inspector Runtime.evaluate failed.');
  });

  it('builds Runtime.evaluate requests with value-return enabled', () => {
    expect(buildRuntimeEvaluateRequest(7, '1 + 1')).toEqual({
      id: 7,
      method: 'Runtime.evaluate',
      params: {
        expression: '1 + 1',
        awaitPromise: false,
        returnByValue: true,
      },
    });
  });
});
