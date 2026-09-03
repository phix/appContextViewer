import { describe, expect, it } from 'vitest';
import { demoStore, fetchServing, readSampleText } from './fixtures.test-helper';
import {
  bindUrl,
  DEFAULT_DEPTH,
  DEFAULT_GROUP,
  readUrl,
  type UrlWindow,
  type ViewState,
  writeUrl,
} from './index';

const defaults: ViewState = {
  center: null,
  depth: DEFAULT_DEPTH,
  groupBy: DEFAULT_GROUP,
  overviewExpanded: false,
  spaceExpanded: false,
};

describe('readUrl (docs/url-state.md)', () => {
  it('opens Space as the mutually exclusive canvas view', () => {
    expect(readUrl('#view=space')).toEqual({
      ...defaults,
      spaceExpanded: true,
    });
  });
  it('reads every key, with or without the leading #', () => {
    const state = readUrl('#app=acme/commerce/order-service&depth=3&group=team&view=overview');
    expect(state).toEqual({
      center: { kind: 'application', id: 'acme/commerce/order-service' },
      depth: 3,
      groupBy: 'team',
      overviewExpanded: true,
      spaceExpanded: false,
    });
    expect(readUrl('app=acme/commerce/order-service&depth=3&group=team&view=overview')).toEqual(
      state,
    );
  });

  it('applies the defaults to an empty or absent hash', () => {
    expect(readUrl('')).toEqual(defaults);
    expect(readUrl('#')).toEqual(defaults);
  });

  it('reads an External Center, and lets app win when both keys appear', () => {
    expect(readUrl('#external=redis').center).toEqual({ kind: 'external', id: 'redis' });
    expect(readUrl('#app=acme/x/y&external=redis').center).toEqual({
      kind: 'application',
      id: 'acme/x/y',
    });
    expect(readUrl('#app=&external=redis').center).toEqual({ kind: 'external', id: 'redis' });
  });

  it('accepts raw and percent-encoded slashes alike (rule 9)', () => {
    expect(readUrl('#app=acme%2Fcommerce%2Forder-service').center).toEqual({
      kind: 'application',
      id: 'acme/commerce/order-service',
    });
  });

  it('reads depth=all as unbounded', () => {
    expect(readUrl('#depth=all').depth).toBe(Number.POSITIVE_INFINITY);
  });

  it('falls an unparsable or out-of-range depth back to the default (rule 6)', () => {
    for (const bad of ['0', '-1', '1.5', 'three', '', '2x', ' 2']) {
      expect(readUrl(`#depth=${encodeURIComponent(bad)}`).depth).toBe(DEFAULT_DEPTH);
    }
    expect(readUrl('#depth=1').depth).toBe(1);
    expect(readUrl('#depth=10').depth).toBe(10);
  });

  it('passes an unknown group through for the store to map, and ignores unknown keys', () => {
    expect(readUrl('#group=links').groupBy).toBe('links');
    expect(readUrl('#group=').groupBy).toBe(DEFAULT_GROUP);
    expect(readUrl('#foo=bar&view=overview&channel=orders.placed')).toEqual({
      ...defaults,
      overviewExpanded: true,
    });
    expect(readUrl('#view=other').overviewExpanded).toBe(false);
  });
});

describe('writeUrl', () => {
  it('writes Space as the canvas view', () => {
    expect(writeUrl({ ...defaults, spaceExpanded: true })).toBe('#view=space');
  });
  it('writes the keys in the fixed order, defaults omitted, raw slashes', () => {
    expect(
      writeUrl({
        center: { kind: 'application', id: 'acme/commerce/order-service' },
        depth: 3,
        groupBy: 'team',
        overviewExpanded: true,
      }),
    ).toBe('#app=acme/commerce/order-service&depth=3&group=team&view=overview');
  });

  it('writes an empty string when everything is at its default', () => {
    expect(writeUrl(defaults)).toBe('');
  });

  it('writes external for an External Center and all for an unbounded Depth', () => {
    expect(
      writeUrl({
        ...defaults,
        center: { kind: 'external', id: 'redis' },
        depth: Number.POSITIVE_INFINITY,
      }),
    ).toBe('#external=redis&depth=all');
  });

  it('writes none as a grouping value and omits repository', () => {
    expect(writeUrl({ ...defaults, groupBy: 'none' })).toBe('#group=none');
    expect(writeUrl({ ...defaults, groupBy: 'repository' })).toBe('');
  });

  it('round-trips an id with slashes and unusual characters', () => {
    const state: ViewState = {
      ...defaults,
      center: { kind: 'application', id: 'acme/team a/svc&1' },
    };
    const hash = writeUrl(state);
    expect(hash).toBe('#app=acme/team+a/svc%261');
    expect(readUrl(hash)).toEqual(state);
  });
});

/** A window whose history updates its own location, as a browser's does. */
function fakeWindow(hash = '', search = '?src=./catalog.json') {
  const location = { hash, pathname: '/', search };
  const calls: { method: 'push' | 'replace'; url: string }[] = [];
  const listeners = new Map<string, (() => void)[]>();
  const setUrl = (url: string) => {
    const at = url.indexOf('#');
    location.hash = at === -1 ? '' : url.slice(at);
  };
  const window: UrlWindow = {
    location,
    history: {
      pushState: (_data, _unused, url) => {
        calls.push({ method: 'push', url });
        setUrl(url);
      },
      replaceState: (_data, _unused, url) => {
        calls.push({ method: 'replace', url });
        setUrl(url);
      },
    },
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type, listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l !== listener),
      );
    },
  };
  const fire = (type: 'hashchange' | 'popstate') => {
    for (const listener of listeners.get(type) ?? []) {
      listener();
    }
  };
  /** Simulates the browser's Back: sets the hash, then fires popstate and hashchange. */
  const navigate = (newHash: string) => {
    location.hash = newHash;
    fire('popstate');
    fire('hashchange');
  };
  return { window, location, calls, fire, navigate, listeners };
}

describe('bindUrl', () => {
  it('applies the hash to the store on start', () => {
    const store = demoStore();
    const { window, calls } = fakeWindow(
      '#app=acme/commerce/order-service&depth=3&group=team&view=overview',
    );
    bindUrl(store, window);
    expect(store.center.value).toEqual({ kind: 'application', id: 'acme/commerce/order-service' });
    expect(store.depth.value).toBe(3);
    expect(store.groupBy.value).toBe('team');
    expect(store.overviewExpanded.value).toBe(true);
    // The hash was already canonical, so nothing was written.
    expect(calls).toEqual([]);
  });

  it('pushes for a Center change and replaces for Depth, grouping and view', () => {
    const store = demoStore();
    const { window, calls, location } = fakeWindow();
    bindUrl(store, window);
    store.actions.select({ kind: 'application', id: 'acme/commerce/order-service' });
    expect(calls.at(-1)).toEqual({
      method: 'push',
      url: '/?src=./catalog.json#app=acme/commerce/order-service',
    });
    store.actions.setDepth(3);
    expect(calls.at(-1)).toEqual({
      method: 'replace',
      url: '/?src=./catalog.json#app=acme/commerce/order-service&depth=3',
    });
    store.actions.setGroupBy('team');
    expect(calls.at(-1)?.method).toBe('replace');
    store.actions.expandOverview(true);
    expect(calls.at(-1)).toEqual({
      method: 'replace',
      url: '/?src=./catalog.json#app=acme/commerce/order-service&depth=3&group=team&view=overview',
    });
    store.actions.select({ kind: 'external', id: 'redis' });
    expect(calls.at(-1)).toEqual({
      method: 'push',
      url: '/?src=./catalog.json#external=redis&depth=3&group=team&view=overview',
    });
    expect(location.hash).toBe('#external=redis&depth=3&group=team&view=overview');
    expect(calls.filter((call) => call.method === 'push')).toHaveLength(2);
  });

  it('removes the hash entirely when the view returns to its defaults', () => {
    const store = demoStore();
    const { window, calls } = fakeWindow();
    bindUrl(store, window);
    store.actions.setDepth(3);
    store.actions.setDepth(2);
    expect(calls.at(-1)).toEqual({ method: 'replace', url: '/?src=./catalog.json' });
  });

  it('applies the URL on popstate and hashchange without pushing again', () => {
    const store = demoStore();
    const { window, calls, navigate } = fakeWindow();
    bindUrl(store, window);
    store.actions.select({ kind: 'application', id: 'acme/commerce/order-service' });
    store.actions.select({ kind: 'external', id: 'redis' });
    const before = calls.length;
    // Back: the browser restores the previous entry and fires popstate then hashchange.
    navigate('#app=acme/commerce/order-service');
    expect(store.center.value).toEqual({ kind: 'application', id: 'acme/commerce/order-service' });
    expect(calls.length).toBe(before);
    navigate('');
    expect(store.center.value).toBeNull();
    expect(calls.length).toBe(before);
  });

  it('strips an unknown Center from the hash and raises the notice (rule 5)', () => {
    const store = demoStore();
    const { window, calls, location } = fakeWindow('#app=acme/x/y&depth=3');
    bindUrl(store, window);
    expect(store.center.value).toBeNull();
    expect(store.notice.value?.text).toBe(
      'acme/x/y is not in this Catalog. Load your Catalog to open it.',
    );
    expect(store.depth.value).toBe(3);
    expect(calls).toEqual([{ method: 'replace', url: '/?src=./catalog.json#depth=3' }]);
    expect(location.hash).toBe('#depth=3');
  });

  it('strips invalid depth and group values, unknown keys and encodings (rules 6 and 9)', () => {
    const store = demoStore();
    const { window, calls } = fakeWindow(
      '#app=acme%2Fcommerce%2Forder-service&depth=zero&group=links&foo=bar',
    );
    bindUrl(store, window);
    expect(store.depth.value).toBe(DEFAULT_DEPTH);
    expect(store.groupBy.value).toBe(DEFAULT_GROUP);
    expect(calls).toEqual([
      { method: 'replace', url: '/?src=./catalog.json#app=acme/commerce/order-service' },
    ]);
  });

  it('keeps a valid attribute grouping and none', () => {
    const store = demoStore();
    const { window } = fakeWindow('#group=tier');
    bindUrl(store, window);
    expect(store.groupBy.value).toBe('tier');
    store.actions.setGroupBy('none');
    expect(window.location.hash).toBe('#group=none');
  });

  it('follows the store when a new Catalog loses the Center (rules 5 and 7)', async () => {
    // The 200-Application fixture has no acme/commerce/order-service.
    const store = demoStore({
      loadDeps: { fetch: fetchServing(readSampleText('catalog-200.json')) },
    });
    const { window, location, calls } = fakeWindow('#app=acme/commerce/order-service&depth=3');
    bindUrl(store, window);
    expect(store.center.value).not.toBeNull();
    await store.actions.load('https://example.test/catalog-200.json');
    expect(store.center.value).toBeNull();
    expect(store.notice.value?.kind).toBe('missing-center');
    expect(location.hash).toBe('#depth=3');
    expect(calls.at(-1)?.method).toBe('replace');
  });

  it('unbinds: stops writing and listening', () => {
    const store = demoStore();
    const { window, calls, listeners } = fakeWindow();
    const unbind = bindUrl(store, window);
    unbind();
    store.actions.setDepth(5);
    expect(calls).toEqual([]);
    expect(listeners.get('hashchange')).toEqual([]);
    expect(listeners.get('popstate')).toEqual([]);
  });
});
