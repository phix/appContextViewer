/**
 * Mounts the shell and bootstraps the load path.
 *
 * Order, per docs/url-state.md rule 7: the bundled sample Catalog is validated and put in the
 * store, `?src=` loads first (a failure leaves the sample and shows the report over it,
 * docs/validation-surfacing.md decision 3), then the hash is applied to whatever Catalog is
 * current. `bindUrl` is therefore called once the initial `?src=` load has settled.
 *
 * The sample is imported into the bundle, never fetched (issue #14, docs/architecture.md). The raw
 * import types `schemaVersion` as `number`, so it goes through `validateCatalog` to narrow to
 * `Catalog` — which also produces the warnings the header badge counts.
 */

import { render } from 'preact';
import { validateCatalog } from '@/catalog';
import { bindUrl, createStore, type Source } from '@/state';
// The sample Catalog is imported into the bundle, never fetched (issue #14, docs/architecture.md).
import demoCatalog from '../../samples/catalog.demo.json';
import { App, markLoadStart } from './App';

const SAMPLE_SOURCE: Source = { kind: 'sample', name: 'sample Catalog (demo)' };

const mount = document.getElementById('app');
if (!mount) {
  throw new Error('index.html has no #app mount point');
}

const sample = validateCatalog(demoCatalog);
if (sample.catalog === undefined) {
  // The bundled sample is committed and covered by the catalog module's tests; if it ever stops
  // validating the build is broken, and failing loudly beats rendering an empty viewer.
  throw new Error(
    `the bundled sample Catalog does not validate: ${sample.errors.map((e) => e.code).join(', ')}`,
  );
}

const store = createStore({
  catalog: sample.catalog,
  source: SAMPLE_SOURCE,
  warnings: sample.warnings,
});

render(<App store={store} />, mount);
// Stamps what the bundle rendered, so the browser suite can tell it from the file:// guard.
mount.dataset.renderedBy = 'bundle';

// `?src=` names the data, the hash names the view (docs/url-state.md). A relative value resolves
// against the page; the store passes `location.href` as the base on an http(s) page.
const src = new URLSearchParams(location.search).get('src');

async function bootstrap(): Promise<void> {
  if (src !== null && src !== '') {
    markLoadStart();
    await store.actions.load(src);
  }
  bindUrl(store, window);
  mount?.setAttribute('data-bootstrapped', 'true');
}

void bootstrap();
