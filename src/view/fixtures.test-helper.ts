/**
 * Test-only: the demo Catalog's real view models, so the board tests render exactly what the app
 * renders rather than a hand-written approximation of it (docs/architecture.md, "Test strategy":
 * "view models built from the demo Catalog"). Not exported from the module index.
 */
import { validateCatalog } from '@/catalog';
import type { BoardModel, Center, ChannelCardModel, Store } from '@/state';
import { createStore } from '@/state';
import demoCatalog from '../../samples/catalog.demo.json';

/** A store over the bundled demo Catalog, as the app starts. */
export function demoStore(): Store {
  const result = validateCatalog(demoCatalog);
  if (result.catalog === undefined) {
    throw new Error('the bundled demo Catalog must validate');
  }
  return createStore({ catalog: result.catalog, warnings: result.warnings });
}

/** The `BoardModel` the store derives for a Center at a Depth. */
export function boardOf(center: Center, depth = 2, store = demoStore()): BoardModel {
  store.actions.setDepth(depth);
  store.actions.select(center);
  const board = store.derived.board.value;
  if (board === null) {
    throw new Error(`no board for ${center.kind} ${center.id}`);
  }
  return board;
}

/** The `ChannelCardModel` the store derives for a Channel. */
export function channelCardOf(name: string, store = demoStore()): ChannelCardModel {
  store.actions.openChannel(name);
  const model = store.derived.channelCardModel.value;
  if (model === null) {
    throw new Error(`no Channel card for ${name}`);
  }
  return model;
}
