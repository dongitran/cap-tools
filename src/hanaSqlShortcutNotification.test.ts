import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { withProgressMock } = vi.hoisted(() => ({
  withProgressMock: vi.fn(
    async (_options: unknown, task: () => Promise<void>): Promise<void> => task()
  ),
}));

vi.mock('vscode', () => ({
  ProgressLocation: {
    Notification: 15,
  },
  window: {
    withProgress: withProgressMock,
  },
}));

import { showHanaSqlShortcutNotification } from './hanaSqlShortcutNotification';

describe('showHanaSqlShortcutNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withProgressMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test.each([
    ['darwin', 'Cmd+E Cmd+E'],
    ['linux', 'Ctrl+E Ctrl+E'],
  ])('uses the %s run chord in the notification', (platform, shortcut) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);

    showHanaSqlShortcutNotification();

    expect(withProgressMock).toHaveBeenCalledWith(
      {
        cancellable: false,
        location: 15,
        title: `Select SQL and press ${shortcut} to run.`,
      },
      expect.any(Function)
    );
  });

  test('keeps the notification open for exactly 4.5 seconds', async () => {
    showHanaSqlShortcutNotification();
    const progressPromise = withProgressMock.mock.results[0]?.value as Promise<void>;
    let resolved = false;
    void progressPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(4499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await progressPromise;
    expect(resolved).toBe(true);
  });
});
