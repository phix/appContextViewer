/**
 * The Highlight (CONTEXT.md, **Highlight**): transient emphasis of the Group behind a pointed-at
 * Tag, across the ranked table, both impact-board columns and the Neighborhood pane's canvas at
 * once. It changes no Center, removes no row and writes nothing to the URL, so it is deliberately
 * NOT store state — nothing here is a signal and nothing here re-renders a component.
 *
 * Budget 8 (docs/performance-budgets.md; docs/tags.md, constraint 1) is why it is shaped this way.
 * A Highlight can cross 1,000 ranked rows and 150 canvas nodes inside 50 ms, so it costs ONE DOM
 * write: a single `<style>` element whose text is replaced with two rules matching the `data-groups`
 * attribute every row already carries. The cost is therefore independent of the row count, which is
 * the property `src/view/highlight.test.ts` measures by counting mutation records at two row counts
 * — a per-row implementation makes those two numbers differ and turns it red.
 *
 * The canvas cannot be reached by CSS (Cytoscape paints to a `<canvas>`), so it subscribes instead
 * and styles its own <= 150 nodes. That is the one surface where the work scales with the node
 * count, and the pane's cap is what keeps it inside the budget.
 */

/** Budget 8's start, stamped when a Tag is pointed at. */
export const HIGHLIGHT_MARK = 'acv:highlight-start';
/** Budget 8: pointing at a Tag to the Highlight painted. */
export const HIGHLIGHT_MEASURE = 'acv:highlight-to-paint';

const STYLE_ID = 'acv-highlight';

export interface Highlight {
  /** `tagToken(attribute, value)`: one word of the `data-groups` attribute on every member row. */
  readonly token: string;
  /** The Application and External ids behind the Tag; the canvas needs the set, the DOM does not. */
  readonly members: ReadonlySet<string>;
}

type Listener = (highlight: Highlight | null) => void;

let current: Highlight | null = null;
let element: HTMLStyleElement | null = null;
const listeners = new Set<Listener>();

/** The current Highlight, or null. Read by a surface that mounts while one is already up. */
export function currentHighlight(): Highlight | null {
  return current;
}

/**
 * Subscribes to Highlight changes. Only the canvas needs this; every DOM surface is reached by the
 * injected rule without re-rendering. Returns its own unsubscribe.
 */
export function onHighlight(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The two rules a Highlight injects. Non-members are de-emphasised, never removed (CONTEXT.md:
 * a Highlight is not a filter), so counts and ranking are untouched by construction — there is no
 * code path here that could remove a row.
 *
 * `~=` matches one whitespace-separated word, which is why `tagToken` percent-encodes the value:
 * `team=Billing Platform` unencoded would be two words and match the wrong rows.
 */
export function highlightRules(token: string): string {
  const quoted = cssString(token);
  return [
    // Each var() carries a literal fallback: a renamed token would otherwise make the whole
    // declaration invalid and the Highlight would silently stop being visible while every test
    // that only checks the rule text still passed.
    `[data-groups]:not([data-groups~=${quoted}]){opacity:var(--acv-dim-opacity,0.32);}`,
    `[data-groups~=${quoted}]{background:var(--acv-highlight,#fef3c7);box-shadow:inset 3px 0 0 0 var(--acv-highlight-edge,#d97706);}`,
  ].join('\n');
}

/** A CSS string literal. `tagToken` never emits a quote or a backslash; this holds if that changes. */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function styleElement(): HTMLStyleElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (element === null || !element.isConnected) {
    element = document.createElement('style');
    element.id = STYLE_ID;
    document.head.append(element);
  }
  return element;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearHighlight();
  }
}

/**
 * Points at a Tag. One assignment to one `<style>` element's text, whatever the row count; pointing
 * at the Tag that is already highlighted writes nothing at all.
 */
export function setHighlight(highlight: Highlight): void {
  if (current !== null && current.token === highlight.token) {
    return;
  }
  const style = styleElement();
  if (style === null) {
    return;
  }
  if (current === null) {
    document.addEventListener('keydown', onKeyDown);
  }
  current = highlight;
  performance.mark(HIGHLIGHT_MARK);
  // THE one DOM write. Everything the ranked table, both board columns and the Center card need is
  // in this string; adding a per-row attribute write here is what the budget test is watching for.
  style.textContent = highlightRules(highlight.token);
  notify();
  measureAfterPaint();
}

/** Clears the Highlight: the pointer or focus left, or `Escape` was pressed (docs/tags.md). */
export function clearHighlight(): void {
  if (current === null) {
    return;
  }
  current = null;
  const style = styleElement();
  if (style !== null) {
    style.textContent = '';
  }
  document.removeEventListener('keydown', onKeyDown);
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener(current);
  }
}

function measureAfterPaint(): void {
  if (typeof requestAnimationFrame !== 'function') {
    return;
  }
  // Two frames, as the board does: the first runs before the paint that shows the Highlight, the
  // second after it, so the measure spans the paint rather than stopping at the style write.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.measure(HIGHLIGHT_MEASURE, HIGHLIGHT_MARK);
    });
  });
}

/** Test-only: drops the injected element and every listener so one test cannot leak into the next. */
export function resetHighlight(): void {
  clearHighlight();
  listeners.clear();
  element?.remove();
  element = null;
}
