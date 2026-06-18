import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function readToolsSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/07g-render-tools.js', import.meta.url),
    'utf8'
  );
}

async function readEventsSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/01-events.js', import.meta.url),
    'utf8'
  );
}

async function readSqlRenderSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/07e-render-sql.js', import.meta.url),
    'utf8'
  );
}

async function readStateSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/00-state.js', import.meta.url),
    'utf8'
  );
}

async function readQuickSelectionSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/05-quick-selection.js', import.meta.url),
    'utf8'
  );
}

async function readWorkspaceRenderSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/07d-render-workspace.js', import.meta.url),
    'utf8'
  );
}

async function readEventStylesSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/styles/09-events.css', import.meta.url),
    'utf8'
  );
}

async function readLogsStylesSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/src/styles/03-logs-panel.css', import.meta.url),
    'utf8'
  );
}

async function readEventWebviewSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/assets/events-webview.js', import.meta.url),
    'utf8'
  );
}

async function readEventVariantSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/variants/events-webview.html', import.meta.url),
    'utf8'
  );
}

async function readGallerySource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/assets/gallery.js', import.meta.url),
    'utf8'
  );
}

async function readPrototypeIndexSource(): Promise<string> {
  return readFile(
    new URL('../docs/designs/prototypes/index.html', import.meta.url),
    'utf8'
  );
}

describe('prototype Microsoft Graph tools UI', () => {
  it('renders an explicit show/hide toggle for client secret fields', async () => {
    const source = await readToolsSource();

    expect(source).toContain('toggle-client-secret-visibility');
    expect(source).toContain('Show Client Secret');
    expect(source).toContain('Hide Client Secret');
    expect(source).toContain('microsoftGraphClientSecretVisibleByTool');
  });

  it('uses the active tool name as the screen heading without a duplicate inner header', async () => {
    const source = await readToolsSource();

    expect(source).toContain('resolveToolsHeaderTitle');
    expect(source).not.toContain('tool-workbench-head');
  });

  it('routes SVG icon clicks through the nearest action button', async () => {
    const source = await readEventsSource();

    expect(source).toContain("eventTarget.closest('[data-action]')");
  });
});

describe('prototype Log-API-Event workspace', () => {
  it('renames the first workspace tab without keeping the old label', async () => {
    const source = await readStateSource();

    expect(source).toContain("label: 'Log-API-Event'");
    expect(source).not.toContain("label: 'Logs/APIs'");
  });

  it('shows APIs and Event actions without the idle Ready badge', async () => {
    const source = await readWorkspaceRenderSource();

    expect(source).toContain('data-action="open-app-apis"');
    expect(source).toContain('data-action="open-app-events"');
    expect(source).not.toContain('app-log-state is-idle');
    expect(source).not.toContain('>Ready<');
  });

  it('routes the Event action to the Event viewer prototype', async () => {
    const source = await readQuickSelectionSource();

    expect(source).toContain('saptools.openEventMesh');
    expect(source).toContain('./variants/events-webview.html');
  });

  it('keeps app rows fixed while making APIs and Event hover targets taller', async () => {
    const source = await readLogsStylesSource();

    expect(source).toMatch(/\.app-log-item\s*\{[\s\S]*?padding:\s*8px 10px;/);
    expect(source).toMatch(/\.app-log-apis-btn\s*\{[\s\S]*?min-height:\s*20px;/);
    expect(source).toMatch(/\.app-log-apis-btn\s*\{[\s\S]*?line-height:\s*1\.2;/);
    expect(source).toMatch(/\.app-log-apis-btn\s*\{[\s\S]*?box-sizing:\s*border-box;/);
  });

  it('uses multi-binding state for the Event viewer (Add Binding workflow)', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain('selectedBindingIndexes');
    expect(source).toContain('topicsByBinding');
    expect(source).toContain('em-add-binding');
    expect(source).toContain("'sapTools.events.addTopics'");
  });

  it('sends multi-binding start requests with per-binding topics', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain("'sapTools.events.startListening'");
    expect(source).toContain('bindings: requests');
  });

  it('renders results inline below setup instead of replacing the screen', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain('event-setup');
    expect(source).toContain('event-results');
    expect(source).toContain('renderReady');
  });

  it('prototype fixture handles multiple bindings for search-based Add Binding workflow', async () => {
    const source = await readEventVariantSource();

    expect(source).toContain('length: 100');
    expect(source).toContain("'sapTools.events.startListening'");
    expect(source).toContain("'sapTools.events.addTopics'");
  });

  it('has a standalone Event viewer variant for Playwright prototype checks', async () => {
    const source = await readEventVariantSource();

    expect(source).toContain('id="event-mesh-app"');
    expect(source).toContain('../assets/prototype.css');
    expect(source).toContain('../assets/events-webview.js');
  });

  it('does not add non-zero letter spacing to the Event viewer styles', async () => {
    const source = await readEventStylesSource();
    const values = Array.from(source.matchAll(/letter-spacing:\s*([^;]+);/g)).map((match) =>
      match[1]?.trim()
    );

    expect(values).toEqual(values.map(() => '0'));
  });

  it('includes Simple, Advance, and Publish tabs with Simple as the default', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain("activeTab = 'subscribe-simple'");
    expect(source).toContain('em-switch-tab');
    expect(source).toContain('activeTab');
    expect(source).toContain('Subscribe Simple');
    expect(source).toContain('Subscribe Advance');
    expect(source).toContain('data-tab="publish"');
    expect(source).toContain('data-tab="subscribe-simple"');
    expect(source).toContain('data-tab="subscribe-advance"');
  });

  it('does not duplicate the binding count below the Event viewer tabs', async () => {
    const source = await readEventWebviewSource();

    expect(source).not.toContain('event-header-meta');
  });

  it('renders a grouped Simple subscribe tree with one-click group and child selection', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain('normalizeSimpleBindingGroupName');
    expect(source).toContain('buildSimpleBindingTree');
    expect(source).toContain('renderSimpleSubscribeView');
    expect(source).toContain('collectSimpleStartRequests');
    expect(source).toContain('em-toggle-simple-group');
    expect(source).toContain('em-toggle-simple-binding');
    expect(source).toContain('Client Binding Groups');
  });

  it('expands Simple groups from the group row while keeping checkbox selection separate', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain('class="event-simple-group-row" data-action="em-expand-simple-group"');
    expect(source).toContain('class="event-simple-check" data-action="em-toggle-simple-group"');
  });

  it('keeps Simple subscribe interactive while streaming and adds bindings without resetting results', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain("state.status === 'listening' || state.status === 'starting'");
    expect(source).toContain('const selectableBindings = simpleSelectableBindings(group);');
    expect(source).not.toContain("return streaming || topicStateFor(binding.index).status === 'listening';");
    expect(source).not.toContain('if (group === null || streaming) return;');
    expect(source).toContain("type: 'sapTools.events.startBinding'");
    expect(source).toContain("type: 'sapTools.events.startListening', bindings: requests");
    expect(source).toContain("const labelSuffix = streaming ? ' More' : '';");
  });

  it('prototype fixture includes repeated client binding groups for Simple subscribe', async () => {
    const source = await readEventVariantSource();

    expect(source).toContain("name: 'orders-client'");
    expect(source).toContain("name: 'billing-client'");
    expect(source).toContain("name: 'inventory-client'");
    expect(source).toContain("padStart(2, '0')");
    expect(source).toContain('bindingName = `${group.name}-${suffix}`');
  });

  it('exposes the Event Mesh viewer variant from the prototype gallery index', async () => {
    const gallery = await readGallerySource();
    const index = await readPrototypeIndexSource();

    expect(index).toContain('value="event-mesh"');
    expect(gallery).toContain("id: 'event-mesh'");
    expect(gallery).toContain('./variants/events-webview.html');
  });

  it('sends sapTools.events.publishEvent message and handles publishResult response', async () => {
    const source = await readEventWebviewSource();

    expect(source).toContain("'sapTools.events.publishEvent'");
    expect(source).toContain("'sapTools.events.publishResult'");
    expect(source).toContain('postPublishEvent');
  });

  it('prototype fixture handles publishEvent message with mock result', async () => {
    const source = await readEventVariantSource();

    expect(source).toContain("'sapTools.events.publishEvent'");
    expect(source).toContain("'sapTools.events.publishResult'");
    expect(source).toContain('status: 204');
  });
});

describe('prototype S/4HANA SQL Workbench table refresh', () => {
  it('treats refresh-hana-tables as an in-place SQL-only action so the service list is not re-rendered', async () => {
    const topology = await readFile(
      new URL('../docs/designs/prototypes/src/02-topology.js', import.meta.url),
      'utf8'
    );
    // Must be in the SQL-only set, otherwise the click falls through to a full
    // renderPrototype() that rebuilds the service list and resets its scroll.
    expect(topology).toMatch(/isSqlOnlyAction[\s\S]*?'refresh-hana-tables'/);

    const events = await readEventsSource();
    // Pin refresh-hana-tables INTO the in-place branch (alongside
    // select-hana-service → refreshMountedSqlWorkbench), not merely present
    // somewhere — otherwise routing it to the else branch would still pass.
    expect(events).toMatch(
      /action === 'select-hana-service' \|\| action === 'refresh-hana-tables'\)[\s\S]*?refreshMountedSqlWorkbench\(\)/
    );
  });
});

describe('prototype S/4HANA SQL Workbench tunnel indicator', () => {
  it('shows a single tunnel badge beside the workbench title, not a per-row badge or count', async () => {
    const source = await readSqlRenderSource();

    // One presence badge in the header.
    expect(source).toContain('data-role="hana-tunnel-indicator"');
    expect(source).toContain('anyHanaTunnelActive');
    // No per-row badge, no count label.
    expect(source).not.toContain('hana-service-tunnel-badge');
    expect(source).not.toContain('hana-tunnel-count');
    expect(source).not.toContain('countActiveHanaTunnels');
    expect(source).not.toContain('formatHanaTunnelCountLabel');
  });
});
