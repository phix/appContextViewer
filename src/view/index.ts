/**
 * view: the Preact components that render `@/state`'s view models (docs/architecture.md, "view").
 * Components take view models and call actions; they contain no graph traversal and no layout
 * calls. This index is the module's whole interface — biome's import rules refuse a deeper path
 * from outside the folder, so every new component is exported here.
 *
 * The app-shell slice (#24) landed `Header`, `Picker`, `Report` and `RankedTable`. The board slice
 * (#25) landed `ImpactBoard`, `CenterCard`, `Search` and `ChannelCard`, and deleted the placeholder
 * `CenterPanel` the shell had put above the table. The Overview slice (#27) landed `Overview`,
 * `GroupByMenu` and `canvas/OverviewCanvas`. `NeighborhoodPane` arrives with its own slice.
 *
 * The Tags slice (#43) landed `Tag`, the Highlight and `app.css` — the repository's first
 * stylesheet, imported HERE so the module's own interface pulls it in and no shell file has to
 * remember to (docs/tags.md, "What a first stylesheet has to settle").
 */
import './app.css';

export {
  attributeText,
  boardMarkdown,
  breaksBadge,
  CenterCard,
  type CenterCardProps,
  centerTags,
  kindText,
  named,
} from './CenterCard';
export { ChannelCard, type ChannelCardProps } from './ChannelCard';
export { ANIMATION_MS } from './canvas/OverviewCanvas';
export { GROUP_BY_FALLBACK, GroupByMenu, type GroupByMenuProps, groupByLabel } from './GroupByMenu';
export { DEPTH_OPTIONS, depthLabel, depthValue, Header, type HeaderProps } from './Header';
export {
  clearHighlight,
  currentHighlight,
  HIGHLIGHT_MARK,
  HIGHLIGHT_MEASURE,
  type Highlight,
  highlightRules,
  onHighlight,
  resetHighlight,
  setHighlight,
} from './highlight';
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
export {
  NeighborhoodPane,
  type NeighborhoodPaneProps,
  PANE_LAYOUT_MARK,
  PANE_PAINT_MARK,
  PANE_PAINT_MEASURE,
  paneRenderOf,
} from './NeighborhoodPane';
export {
  CANCELLED_NOTE,
  COLLAPSED_HEIGHT,
  COLLAPSED_WIDTH,
  expandAllTooltip,
  LABEL_HEIGHT,
  LABEL_WIDTH,
  MEMBER_HEIGHT,
  MEMBER_WIDTH,
  nodeIdOf,
  OVERVIEW_ELK_MEASURE,
  OVERVIEW_LAID_OUT_MARK,
  OVERVIEW_LAYOUT_MARK,
  OVERVIEW_MEASURE,
  OVERVIEW_PAINT_MARK,
  Overview,
  OverviewControls,
  type OverviewControlsProps,
  type OverviewProps,
  type OverviewRender,
  overviewRenderOf,
} from './Overview';
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
export { Space, type SpaceProps, spaceGraphOf, spaceStyleOf } from './Space';
export { Tag, type TagProps, tagLabel } from './Tag';
