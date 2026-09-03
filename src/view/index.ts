/**
 * view: the Preact components that render `@/state`'s view models (docs/architecture.md, "view").
 * Components take view models and call actions; they contain no graph traversal and no layout
 * calls. This index is the module's whole interface — biome's import rules refuse a deeper path
 * from outside the folder, so every new component is exported here.
 *
 * The app-shell slice (#24) landed `Header`, `Picker`, `Report` and `RankedTable`. The board slice
 * (#25) landed `ImpactBoard`, `CenterCard`, `Search` and `ChannelCard`, and deleted the placeholder
 * `CenterPanel` the shell had put above the table. `NeighborhoodPane`, `Overview` and `canvas/`
 * arrive with their own slices.
 */
export {
  attributeText,
  boardMarkdown,
  breaksBadge,
  CenterCard,
  type CenterCardProps,
  kindText,
} from './CenterCard';
export { ChannelCard, type ChannelCardProps } from './ChannelCard';
export { DEPTH_OPTIONS, depthLabel, depthValue, Header, type HeaderProps } from './Header';
export {
  BOARD_MARK,
  chipsOf,
  DEPTH_MARK,
  DEPTH_MEASURE,
  ImpactBoard,
  type ImpactBoardProps,
  markDepthStart,
  markSelectStart,
  SELECT_MARK,
  SELECT_MEASURE,
} from './ImpactBoard';
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
export {
  hitChip,
  hitDetail,
  RESULTS_MARK,
  SEARCH_LIMIT,
  SEARCH_MARK,
  SEARCH_MEASURE,
  Search,
  type SearchProps,
} from './Search';
