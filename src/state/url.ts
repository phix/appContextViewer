/**
 * The URL seam (docs/url-state.md): the hash carries the view, `readUrl` and `writeUrl` are pure,
 * and `bindUrl` wires a store to a window-like `history`, `location` and event source that tests
 * inject as fakes. The keys, in their fixed order: `app` or `external`, `depth`, `group`, `view`.
 */
import { batch, effect } from '@preact/signals';
import {
  type Center,
  DEFAULT_DEPTH,
  DEFAULT_GROUP,
  isValidDepth,
  type Store,
  type ViewState,
} from './store';

export const URL_KEYS = ['app', 'external', 'depth', 'group', 'view'] as const;

/** The fully resolved view state a hash names, defaults applied, invalid values replaced. */
export function readUrl(hash: string): ViewState {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const app = params.get('app');
  const external = params.get('external');
  let center: Center | null = null;
  if (app !== null && app !== '') {
    center = { kind: 'application', id: app };
  } else if (external !== null && external !== '') {
    center = { kind: 'external', id: external };
  }
  const depth = parseDepth(params.get('depth'));
  const group = params.get('group');
  const groupBy = group === null || group === '' ? DEFAULT_GROUP : group;
  return {
    center,
    depth,
    groupBy,
    overviewExpanded: params.get('view') === 'overview',
    spaceExpanded: params.get('view') === 'space',
  };
}

function parseDepth(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_DEPTH;
  }
  if (raw === 'all') {
    return Number.POSITIVE_INFINITY;
  }
  if (!/^\d+$/.test(raw)) {
    return DEFAULT_DEPTH;
  }
  const depth = Number(raw);
  return isValidDepth(depth) ? depth : DEFAULT_DEPTH;
}

/** The hash for a view state: `''` when everything is at its default, `#key=value&...` otherwise. */
export function writeUrl(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.center !== null) {
    params.set(state.center.kind === 'application' ? 'app' : 'external', state.center.id);
  }
  if (state.depth !== DEFAULT_DEPTH && isValidDepth(state.depth)) {
    params.set('depth', state.depth === Number.POSITIVE_INFINITY ? 'all' : String(state.depth));
  }
  if (state.groupBy !== DEFAULT_GROUP && state.groupBy !== '') {
    params.set('group', state.groupBy);
  }
  if (state.spaceExpanded) {
    params.set('view', 'space');
  } else if (state.overviewExpanded) {
    params.set('view', 'overview');
  }
  const text = params.toString().replaceAll('%2F', '/');
  return text === '' ? '' : `#${text}`;
}

/** The subset of `window` the binding uses, so tests inject fakes. */
export interface UrlHistory {
  pushState(data: unknown, unused: string, url: string): void;
  replaceState(data: unknown, unused: string, url: string): void;
}

export interface UrlLocation {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

export interface UrlWindow {
  readonly history: UrlHistory;
  readonly location: UrlLocation;
  addEventListener(type: 'hashchange' | 'popstate', listener: () => void): void;
  removeEventListener?(type: 'hashchange' | 'popstate', listener: () => void): void;
}

/**
 * Applies the hash to the store now and on every `hashchange` or `popstate`, and writes the
 * store's view state back: a change to a new Center pushes a history entry, everything else
 * (Depth, grouping, view, a cleared Center) replaces it (docs/url-state.md, rule 4). A hash the store corrects (an unknown Center, an invalid Depth or
 * grouping) is replaced with the corrected one, so invalid values are stripped (rules 5 and 6).
 * Returns the unbind function.
 */
export function bindUrl(store: Store, window: UrlWindow): () => void {
  const { history, location } = window;
  let applying = false;
  let lastWritten: string | undefined;
  let lastCenter = store.center.value;

  const current = (): ViewState => ({
    center: store.center.value,
    depth: store.depth.value,
    groupBy: store.groupBy.value,
    overviewExpanded: store.overviewExpanded.value,
    spaceExpanded: store.spaceExpanded.value,
  });

  const write = (hash: string, push: boolean): void => {
    const url = `${location.pathname}${location.search}${hash}`;
    if (push) {
      history.pushState(null, '', url);
    } else {
      history.replaceState(null, '', url);
    }
    lastWritten = hash;
  };

  const apply = (): void => {
    const state = readUrl(location.hash);
    applying = true;
    try {
      batch(() => {
        store.actions.select(state.center);
        store.actions.setDepth(state.depth);
        store.actions.setGroupBy(state.groupBy);
        store.actions.expandOverview(state.overviewExpanded);
        store.actions.expandSpace(state.spaceExpanded ?? false);
      });
    } finally {
      applying = false;
    }
    lastCenter = store.center.value;
    const canonical = writeUrl(current());
    if (canonical !== normalize(location.hash)) {
      write(canonical, false);
    }
  };

  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);
  apply();

  // Created after the first apply, so its initial run finds the store and the URL already agree.
  const dispose = effect(() => {
    const state = current();
    const hash = writeUrl(state);
    if (applying) {
      return;
    }
    // A new Center pushes, so Back returns to the previous one; clearing the Center (a load that
    // lost it, a deselect) only strips the key, so it replaces like every other change.
    const centerChanged = state.center !== null && !sameCenter(state.center, lastCenter);
    lastCenter = state.center;
    if (hash === (lastWritten ?? normalize(location.hash))) {
      return;
    }
    write(hash, centerChanged);
  });

  return () => {
    dispose();
    window.removeEventListener?.('hashchange', apply);
    window.removeEventListener?.('popstate', apply);
  };
}

/** A hash as the writer would spell it, so a raw or encoded reading compares equal; `#` alone is empty. */
function normalize(hash: string): string {
  return hash === '#' ? '' : writeUrl(readUrl(hash));
}

function sameCenter(a: Center | null, b: Center | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
}
