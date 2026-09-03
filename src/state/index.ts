/**
 * state: one store, derived view models, a URL seam (docs/architecture.md, "state").
 *
 *   createStore({ catalog, source?, warnings?, loadDeps? }) -> Store   // signals, `actions`, `derived`
 *   readUrl(hash) -> ViewState; writeUrl(state) -> hash; bindUrl(store, window) -> unbind
 *
 * Invariants: `load` never replaces `catalog` until the new one validates; the Center is always in
 * the Graph or null, with the missing-Center notice otherwise; `groupBy` never holds a key the graph
 * module would refuse; the URL is the source of truth for view state once bound. Runs in Node.
 */
export type {
  BoardBand,
  BoardModel,
  BoardNode,
  CenterCard,
  ChannelCardModel,
  Derived,
  OverviewModel,
  PaneGroup,
  PaneModel,
  PaneNode,
  RankedModel,
  TagsModel,
} from './derived';
export { EXTERNAL_NEEDS_NOTE, paneNotice } from './derived';
export type {
  Actions,
  Center,
  Notice,
  Report,
  Source,
  Store,
  StoreInit,
  StoreSignals,
  ViewState,
} from './store';
export {
  createStore,
  DEFAULT_DEPTH,
  DEFAULT_GROUP,
  EXPAND_ALL_LIMIT,
  NO_GROUPING,
  OVERVIEW_LIMIT,
} from './store';
export type { UrlHistory, UrlLocation, UrlWindow } from './url';
export { bindUrl, readUrl, URL_KEYS, writeUrl } from './url';
