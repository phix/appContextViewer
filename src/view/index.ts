/**
 * view: the Preact components that render `@/state`'s view models (docs/architecture.md, "view").
 * Components take view models and call actions; they contain no graph traversal and no layout
 * calls. This index is the module's whole interface — biome's import rules refuse a deeper path
 * from outside the folder, so every new component is exported here.
 *
 * The app-shell slice (#24) landed `Header`, `Picker`, `Report`, `RankedTable` and `CenterPanel`.
 * `ImpactBoard`, `NeighborhoodPane`, `Overview` and `canvas/` arrive with their own slices.
 */
export { CenterPanel, type CenterPanelProps } from './CenterPanel';
export { DEPTH_OPTIONS, depthLabel, depthValue, Header, type HeaderProps } from './Header';
export { Picker, type PickerProps } from './Picker';
export { chipText, FIRST_PAGE, RankedTable, type RankedTableProps } from './RankedTable';
export {
  GROUP_FOLD,
  groupFindings,
  isApplicationId,
  Report,
  type ReportProps,
  reportMarkdown,
  summarize,
  UNKNOWN_KEY_IDS,
} from './Report';
