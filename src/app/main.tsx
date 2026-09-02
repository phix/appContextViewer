import { render } from 'preact';
// The sample Catalog is imported into the bundle, never fetched (issue #14, docs/architecture.md).
import demoCatalog from '../../samples/catalog.demo.json';
import { App } from './App';

const mount = document.getElementById('app');
if (!mount) {
  throw new Error('index.html has no #app mount point');
}
render(<App catalog={demoCatalog} />, mount);
// Stamps what the bundle rendered, so the browser suite can tell it from the file:// guard.
mount.dataset.renderedBy = 'bundle';
