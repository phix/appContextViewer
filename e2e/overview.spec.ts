import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { budget } from './budget.ts';

/**
 * The Overview in a real browser (issue #27), and budgets 9, 10, 11 and 12 from
 * docs/performance-budgets.md. The element mapping, the menu and the disabled states are pinned by
 * `src/view/*.test.tsx`; Cytoscape cannot mount in jsdom, so what is proved here is the drawing, the
 * interactions through the real store and URL, and the four budgets, which only a browser can show.
 *
 * `e2e/budget.ts` scales every ceiling by BUDGET_FACTOR, which CI sets to 4. Each timed assertion
 * below fails with a small factor (`BUDGET_FACTOR=0.00001 npx playwright test e2e/overview.spec.ts`),
 * which is what says it is measuring something rather than passing vacuously.
 */

/** Budgets 9, 10 and 11: a new element set handed to elk, to the frame after the canvas painted it. */
const OVERVIEW_MEASURE = 'acv:overview-layout-to-paint';
/** The elk half of the same stopwatch, so a miss says which half missed. */
const ELK_MEASURE = 'acv:overview-elk';

/**
 * Budgets 9, 10 and 11 are real assertions here, and the Overview cap (#44, ruling on #41) is what
 * makes budget 9 one. elk's cost is superlinear in the EDGE count, and the collapsed Overview used
 * to hand it every Group Dependency over 123 Groups (1,308 in the current fixture), costing seconds. It now
 * draws the heaviest 700 and says how many it did not, which is a legibility decision first
 * (docs/performance-budgets.md, "Overview cap").
 *
 * The cap is 700 and was briefly 800, which is worth knowing before anyone rounds it back up: the
 * curve 800 was read off measured an ARBITRARY subset of the edges, while the rule adopted keeps the
 * HEAVIEST. Heaviest-first concentrates edges on hub Groups and costs more at the same count, so at
 * 800 the elk half alone was 764 ms -- over this whole budget before any paint.
 *
 * There is deliberately NO regression guard on the elk half any more. The one that used to sit here
 * was a timing bound pinned at the day's cost, and it was intermittently red in a full-suite run
 * while passing when this file ran alone -- a budget with no headroom measures the load on the
 * machine, not the code. The three ceilings below are the specified ones and have headroom; the
 * drawn EDGE COUNT beside them is the deterministic assertion that actually holds the cap.
 */

/**
 * How long to WAIT for a layout, which is not the same thing as what a budget allows. Expand all
 * takes seconds here and about four times that on a CI runner (BUDGET_FACTOR=4), far past
 * Playwright's 5 s default, so a locator that waits on a finished layout needs a ceiling of its own.
 * The budgets are read from the `performance` measures below and never from how long a locator took
 * to settle, so making these generous cannot make a slow Overview pass: it only stops a slow runner
 * reporting "element not found" for a layout that was still running.
 */
const LAID_OUT = { timeout: budget(1500) + 15_000 };
const EXPANDED = { timeout: budget(10_000) + 30_000 };

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const generator = path.join(repoRoot, 'samples', 'generate.mjs');
/** e2e/server.mjs mounts e2e/.fixtures/ at /fixtures/; the ticket's `test-results/` is not served. */
const fixtureDir = path.join(repoRoot, 'e2e', '.fixtures', 'overview');

const THOUSAND = '/?src=/samples/catalog-1000.json';
const OVER_EXPAND_ALL = '/?src=/fixtures/overview/catalog-1001.json';
const OVER_OVERVIEW = '/?src=/fixtures/overview/catalog-3001.json';
const OVERVIEW = '#view=overview';

/** The 123 Repositories of samples/catalog-1000.json (samples/README.md, docs/performance-budgets.md). */
const THOUSAND_GROUPS = '123';

function canvas(page: Page) {
  return page.getByTestId('overview-canvas');
}

/**
 * The 76 Team Groups of samples/catalog-1000.json when grouped by team -- 75 distinct team
 * values plus the 'No team' Group the 70 team-less Applications form (CONTEXT.md, Group). The
 * other grouping the warm runs below bounce off.
 */
const THOUSAND_TEAMS = '76';

/**
 * Waits for the Overview to be genuinely idle: no run in flight, and the canvas has finished the
 * `data-animation-ms` move it publishes. Reading a measure before that settles can catch a run still
 * painting, which is exactly how the first draft of `medianCollapsedMs` reported ~965 ms for work
 * that takes ~590: it cleared the timings while the previous layout was still in flight, so a sample
 * spanned two runs. A grouping's own collapsed count is what proves its layout actually landed,
 * which is why the caller waits on 123 or 75 and not on the progress state alone.
 */
async function overviewIdle(page: Page): Promise<void> {
  await expect(page.getByTestId('overview-progress')).toHaveCount(0, LAID_OUT);
  const animation = Number((await canvas(page).getAttribute('data-animation-ms')) ?? Number.NaN);
  expect(Number.isFinite(animation), 'the canvas must publish its animation duration').toBe(true);
  await page.waitForTimeout(animation + 150);
}

/**
 * Budget 9 as a MEDIAN OF WARM RUNS -- budget 4's method in `e2e/pane.spec.ts`, applied here for the
 * reason docs/performance-budgets.md gives for budget 4: fix the measurement before touching the
 * number. The ceiling does NOT move; it is the specified 750 ms.
 *
 * What a first load measures that budget 9 does not name: the elk chunk's fetch and the worker's
 * boot. That is **budget 14's** row -- "the layout engine loaded on first expand" -- so charging it
 * to budget 9 bills one cost to two budgets. At the 700-edge cap on the reference machine the first
 * load is 872 ms while nine warm runs are 569-620 ms (median 588); the ~284 ms difference is that
 * chunk and boot. Budget 9 is "laid out (elk in a worker) and painted", and this measures that.
 *
 * Each pass re-groups to Team and back, because re-selecting the grouping already shown changes no
 * model and so lays nothing out. Only the Repository runs are timed: each layout is settled to its
 * own collapsed count first, and the timings are cleared between them.
 */
async function medianCollapsedMs(page: Page, runs = 5): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    await page.getByTestId('groupby-select').selectOption('team');
    await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_TEAMS, LAID_OUT);
    await overviewIdle(page);

    await clearTimings(page);
    await page.getByTestId('groupby-select').selectOption('repository');
    await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS, LAID_OUT);
    await overviewIdle(page);
    samples.push(await longestMs(page, OVERVIEW_MEASURE));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] as number;
}

async function clearTimings(page: Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });
}

/** The longest measure of that name, or NaN when none was written (`NaN <= x` is false). */
async function longestMs(page: Page, name: string): Promise<number> {
  return page.evaluate((measure) => {
    const entries = performance.getEntriesByName(measure);
    return entries.length === 0 ? Number.NaN : Math.max(...entries.map((entry) => entry.duration));
  }, name);
}

/**
 * The bits of Cytoscape's API the assertions below use, spelled out here because `cytoscape` may
 * only be imported under src/view/canvas/ (biome.json, docs/architecture.md, import rules). The
 * canvas publishes its live instance on its container as `__cy`, which is how these read it.
 */
interface CyCollection {
  readonly length: number;
  map<T>(fn: (element: CyElement) => T): T[];
  filter(fn: (element: CyElement) => boolean): CyCollection;
  first(): CyElement;
}
interface CyElement extends CyCollection {
  id(): string;
  data(key: string): string;
  position(axis: 'x' | 'y'): number;
  renderedPosition(): { x: number; y: number };
}
interface Cy {
  nodes(selector?: string): CyCollection;
  edges(selector?: string): CyCollection;
  fit(eles: CyCollection, padding: number): void;
}
type CanvasHost = HTMLElement & { __cy: Cy };
const CANVAS_SELECTOR = '[data-testid="overview-canvas"]';

/** Every node's id and x position, rounded: what "the previous positions" means concretely. */
async function nodePositions(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector) as CanvasHost | null;
    if (host?.__cy === undefined) {
      throw new Error('the Overview canvas has no Cytoscape instance');
    }
    return host.__cy.nodes().map((node) => `${node.id()}@${Math.round(node.position('x'))}`);
  }, CANVAS_SELECTOR);
}

/**
 * Clicks a node the way a user does: a real mouse click on the pixels the browser drew it at. The
 * node is fitted to the canvas first, so the target is a large, unambiguous area whatever the zoom
 * the Overview happens to be at — at 123 Groups fitted to one viewport a node is only a few pixels
 * wide, and a click computed from that is a coin toss. Every clickable thing in the Overview is a
 * leaf, the open Group's label chip included, so there is no compound hit area to worry about.
 *
 * The wait is not padding. A canvas update animates its nodes for `data-animation-ms` and refits the
 * viewport when that finishes, and `data-open` flips at the start of all that — so a click computed
 * the instant the attribute changes races both the moving nodes and the refit, and lands on empty
 * space perhaps one time in five. Waiting out the duration the canvas publishes settles both.
 */
async function clickNode(page: Page, selector: string): Promise<string> {
  // No run in flight, so the click cannot land on a drawing that is about to be replaced.
  await expect(page.getByTestId('overview-progress')).toHaveCount(0, LAID_OUT);
  const animation = Number((await canvas(page).getAttribute('data-animation-ms')) ?? Number.NaN);
  expect(Number.isFinite(animation), 'the canvas must publish its animation duration').toBe(true);
  await page.waitForTimeout(animation + 150);
  const target = await page.evaluate(
    ([host, sel]) => {
      const container = document.querySelector(host) as CanvasHost | null;
      if (container?.__cy === undefined) {
        throw new Error('the Overview canvas has no Cytoscape instance');
      }
      const cy = container.__cy;
      const node = cy.nodes(sel).first();
      if (node.length === 0) {
        throw new Error(`no node matches ${sel}`);
      }
      cy.fit(node, 30);
      const point = node.renderedPosition();
      return { x: point.x, y: point.y, id: String(node.data('sourceId')) };
    },
    [CANVAS_SELECTOR, selector] as const,
  );
  // Playwright scrolls the canvas into view and resolves the point against its own box, so the
  // click cannot drift the way page-level mouse coordinates do on a page taller than the viewport.
  await page.getByTestId('overview-canvas').click({ position: { x: target.x, y: target.y } });
  return target.id;
}

// Every test here waits on at least one elk run, and the heavier ones on four.
test.describe.configure({ timeout: budget(10_000) + 120_000 });

test.beforeAll(() => {
  mkdirSync(fixtureDir, { recursive: true });
  for (const apps of [1001, 3001]) {
    execFileSync(
      process.execPath,
      [generator, '--apps', String(apps), '--out', path.join(fixtureDir, `catalog-${apps}.json`)],
      { stdio: 'ignore' },
    );
  }
});

test('budget 9: the collapsed Overview paints 123 Groups and the 700 heaviest Group Dependencies in 750 ms', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');

  // One node per Group, no members, and the collapsed Groups' intra-Group edges are not drawn.
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS, LAID_OUT);
  await expect(canvas(page)).toHaveAttribute('data-open', '0');
  await expect(canvas(page)).toHaveAttribute('data-members', '0');
  await expect(page.getByTestId('overview-groups')).toHaveText('123 Groups by repository');

  const drawn = await page.evaluate((selector) => {
    const cy = (document.querySelector(selector) as CanvasHost).__cy;
    return {
      nodes: cy.nodes().length,
      groupEdges: cy.edges('[kind = "group"]').length,
      memberEdges: cy.edges('[kind = "member"]').length,
      // Every Group Dependency carries the count it stands for.
      unlabelled: cy.edges('[kind = "group"]').filter((edge) => !/^\d+$/.test(edge.data('label')))
        .length,
      // One directed edge per ordered pair.
      pairs: new Set(cy.edges().map((edge) => `${edge.data('source')}->${edge.data('target')}`))
        .size,
    };
  }, CANVAS_SELECTOR);
  expect(drawn.nodes).toBe(123);
  expect(drawn.memberEdges).toBe(0);
  expect(drawn.unlabelled).toBe(0);
  expect(drawn.pairs).toBe(drawn.groupEdges);
  /**
   * The cap, drawn. This is the assertion that holds the constant rather than the timing below: the
   * Catalog offers 1,308 Group Dependencies, so moving `OVERVIEW_DEPENDENCY_CAP` by one in either
   * direction changes this number and turns this test red. A timing bound could not: 699 and 701
   * edges lay out in indistinguishable time.
   */
  expect(drawn.groupEdges).toBe(700);
  // And the notice names the rest, in the pane cap notice's shape and vocabulary.
  await expect(page.getByTestId('overview-cap-notice')).toHaveText(
    'Showing the heaviest 700 Group Dependencies of 1,308; 608 not drawn',
  );

  // The first load, reported but NOT asserted: it carries budget 14's chunk fetch and worker boot.
  // Kept in the report so that cost can never grow unnoticed behind a green budget 9.
  const cold = await longestMs(page, OVERVIEW_MEASURE);
  const coldElk = await longestMs(page, ELK_MEASURE);

  // Budget 9: elk in the worker plus the paint of what it produced, median of five warm runs.
  const median = await medianCollapsedMs(page);
  expect(median).toBeLessThanOrEqual(budget(750));
  test.info().annotations.push({
    type: 'budget 9',
    description: `750 ms allowed; warm median ${Math.round(median)} ms over ${drawn.groupEdges} Group Dependencies. First load ${Math.round(cold)} ms (elk ${Math.round(coldElk)} ms), which includes budget 14's chunk fetch and worker boot.`,
  });
});

test('budget 12: the animation duration the canvas is configured with is the fixed 300 ms', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  // Read, not timed: the ticket asks for the configured duration.
  await expect(canvas(page)).toHaveAttribute('data-animation-ms', '300', LAID_OUT);
});

test('budget 10: opening a Group re-lays out and draws its members and their Dependencies in 1.5 s', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS, LAID_OUT);
  await clearTimings(page);

  const opened = await clickNode(page, '[kind = "collapsed"]');
  await expect(canvas(page)).toHaveAttribute('data-open', '1', LAID_OUT);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', String(Number(THOUSAND_GROUPS) - 1));
  const opening = await longestMs(page, OVERVIEW_MEASURE);
  expect(opening).toBeLessThanOrEqual(budget(1500));

  // The Group's intra-Group Dependencies came back with it, inside its own box.
  const inside = await page.evaluate((selector) => {
    const cy = (document.querySelector(selector) as CanvasHost).__cy;
    const members = new Set(cy.nodes('[kind = "member"]').map((node) => node.id()));
    return {
      members: members.size,
      memberEdges: cy.edges('[kind = "member"]').length,
      strays: cy
        .edges('[kind = "member"]')
        .filter((edge) => !members.has(edge.data('source')) || !members.has(edge.data('target')))
        .length,
    };
  }, CANVAS_SELECTOR);
  expect(inside.members).toBeGreaterThan(0);
  expect(inside.strays).toBe(0);

  // Clicking the open Group's box collapses it again, and the members go away.
  await clearTimings(page);
  const collapsed = await clickNode(page, '[kind = "label"]');
  expect(collapsed).toBe(opened);
  await expect(canvas(page)).toHaveAttribute('data-open', '0', LAID_OUT);
  await expect(canvas(page)).toHaveAttribute('data-members', '0');
  const closing = await longestMs(page, OVERVIEW_MEASURE);
  expect(closing).toBeLessThanOrEqual(budget(1500));
  test.info().annotations.push({
    type: 'budget 10',
    description: `1.5 s allowed; opening ${Math.round(opening)} ms, closing ${Math.round(closing)} ms`,
  });
});

test('budget 11: Expand all lays out in 10 s, with progress, cancel and a live main thread', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS, LAID_OUT);
  await clearTimings(page);

  await page.getByTestId('expand-all').click();
  await expect(page.getByTestId('overview-progress')).toBeVisible();
  await expect(page.getByTestId('overview-cancel')).toBeVisible();

  // The main thread stays interactive: a header control answers while elk is still working.
  await page.getByTestId('depth-select').selectOption('3');
  await expect(page.getByTestId('depth-select')).toHaveValue('3');
  await expect(page.getByTestId('overview-progress')).toBeVisible();

  await expect(canvas(page)).toHaveAttribute('data-members', '1000', EXPANDED);
  await expect(canvas(page)).toHaveAttribute('data-open', THOUSAND_GROUPS);
  // The input that blows budget 11, pinned beside the members it belongs to (#41).
  await expect(canvas(page)).toHaveAttribute('data-edges', '4258');
  await expect(page.getByTestId('overview-progress')).toHaveCount(0);

  const total = await longestMs(page, OVERVIEW_MEASURE);
  const elk = await longestMs(page, ELK_MEASURE);
  // 1,000 members and 123 compound parents paint in well under a second; elk is the whole cost.
  expect(total).toBeLessThanOrEqual(budget(10_000));
  test.info().annotations.push({
    type: 'budget 11',
    description: `10 s allowed; ${Math.round(total)} ms total, of which elk ${Math.round(elk)} ms, over 1,000 members and 4,395 Dependencies`,
  });
});

test('cancelling Expand all aborts the run and keeps the previous positions', async ({ page }) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS, LAID_OUT);
  const before = await nodePositions(page);

  await page.getByTestId('expand-all').click();
  await expect(page.getByTestId('overview-progress')).toBeVisible();
  await page.getByTestId('overview-cancel').click();

  await expect(page.getByTestId('overview-cancelled')).toBeVisible();
  await expect(page.getByTestId('overview-progress')).toHaveCount(0);
  // The request stands at every Group open; the drawing is still the collapsed one it had.
  await expect(page.getByTestId('overview')).toHaveAttribute('data-open-groups', THOUSAND_GROUPS);
  await expect(page.getByTestId('overview')).toHaveAttribute('data-drawn-groups', '0');
  // The previous drawing is untouched: same nodes, same positions.
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
  await expect(canvas(page)).toHaveAttribute('data-members', '0');
  expect(await nodePositions(page)).toEqual(before);
});

const BILLING = 'repository=billing';
const BILLING_CHIP = `[sourceId = "${BILLING}"][kind = "label"]`;

test('an Application Centre auto-opens its Group, which cannot be collapsed, and members select', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}#app=billing/auth-service&view=overview`);
  await expect(page.getByTestId('center-id')).toHaveText('billing/auth-service');
  await expect(canvas(page)).toHaveAttribute('data-open', '1', LAID_OUT);

  const highlighted = await page.evaluate(
    (selector) =>
      (document.querySelector(selector) as CanvasHost).__cy
        .nodes('[kind = "open"][highlighted = "true"]')
        .map((node) => String(node.data('sourceId'))),
    CANVAS_SELECTOR,
  );
  expect(highlighted).toEqual([BILLING]);

  // Its label chip refuses the click, because the Group holds the Centre. On its own that would
  // pass just as well if the click had missed, so the next test clicks this very chip with the
  // Centre elsewhere and requires it to close — same node, same click path, different lock.
  const locked = await clickNode(page, BILLING_CHIP);
  expect(locked).toBe(BILLING);
  // The REQUEST, not the drawing: a toggle changes the store at once, while the canvas only
  // changes when elk answers seconds later, so asserting on the canvas alone would pass simply
  // because it had not caught up. `data-open-groups` moving to 0 is what a broken lock looks like.
  await expect(page.getByTestId('overview')).toHaveAttribute('data-open-groups', '1');
  await expect(canvas(page)).toHaveAttribute('data-open', '1', LAID_OUT);

  // Clicking a member selects it, and the board follows.
  const member = await clickNode(page, '[kind = "member"]');
  await expect(page.getByTestId('center-id')).toHaveText(member);
  await expect.poll(() => new URL(page.url()).hash).toContain(`app=${member}`);
});

test('the same Group closes from the same chip once it no longer holds the Centre', async ({
  page,
}) => {
  // An External Centre locks nothing, so billing is an ordinary Group here.
  await page.goto(`${THOUSAND}#external=postgres-main&view=overview`);
  await expect(canvas(page)).toHaveAttribute('data-open', '0', LAID_OUT);

  const opened = await clickNode(page, `[sourceId = "${BILLING}"][kind = "collapsed"]`);
  expect(opened).toBe(BILLING);
  await expect(canvas(page)).toHaveAttribute('data-open', '1', LAID_OUT);

  const closed = await clickNode(page, BILLING_CHIP);
  expect(closed).toBe(BILLING);
  await expect(page.getByTestId('overview')).toHaveAttribute('data-open-groups', '0');
  await expect(canvas(page)).toHaveAttribute('data-open', '0', LAID_OUT);
});

test('an External Centre highlights its Dependents’ Groups, collapsed, and opens none', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}#external=postgres-main&view=overview`);
  await expect(page.getByTestId('center-id')).toHaveText('postgres-main');
  await expect(canvas(page)).toHaveAttribute('data-open', '0', LAID_OUT);

  const highlighted = await page.evaluate((selector) => {
    const cy = (document.querySelector(selector) as CanvasHost).__cy;
    return {
      count: cy.nodes('[highlighted = "true"]').length,
      open: cy.nodes('[highlighted = "true"][kind = "open"]').length,
      // The External itself is never drawn.
      external: cy.nodes().filter((node) => node.data('sourceId') === 'postgres-main').length,
    };
  }, CANVAS_SELECTOR);
  expect(highlighted.count).toBeGreaterThan(1);
  expect(highlighted.open).toBe(0);
  expect(highlighted.external).toBe(0);
});

test('the group-by menu regroups the canvas, and None says it falls back to Repository', async ({
  page,
}) => {
  await page.goto(`/${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', '10', LAID_OUT);

  const options = await page
    .getByTestId('groupby-select')
    .locator('option')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(options.slice(0, 4)).toEqual(['None', 'Repository', 'Team', 'Kind']);
  expect(options.length).toBeGreaterThan(4);

  await page.getByTestId('groupby-select').selectOption('team');
  await expect(page.getByTestId('overview-groups')).toContainText('by team');
  await expect(page.getByTestId('groupby-fallback')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toContain('group=team');

  await page.getByTestId('groupby-select').selectOption('none');
  await expect(page.getByTestId('groupby-fallback')).toBeVisible();
  await expect(page.getByTestId('groupby-select')).toHaveAttribute('data-effective', 'repository');
  await expect(page.getByTestId('overview-groups')).toContainText('by repository');
});

test('the Expand-canvas button opens and closes the Overview', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('overview')).toHaveCount(0);
  await expect(page.getByTestId('expand-canvas')).toBeEnabled();

  await page.getByTestId('expand-canvas').click();
  await expect(canvas(page)).toBeVisible(LAID_OUT);
  await expect.poll(() => new URL(page.url()).hash).toContain('view=overview');

  await page.getByTestId('expand-canvas').click();
  await expect(page.getByTestId('overview')).toHaveCount(0);
});

test('above 1,000 Applications Expand all is disabled, and single Groups still open', async ({
  page,
}) => {
  await page.goto(`${OVER_EXPAND_ALL}${OVERVIEW}`);
  await expect(page.getByTestId('header-counts')).toHaveText('1,001 Applications, 25 Externals');

  const expandAll = page.getByTestId('expand-all');
  await expect(expandAll).toBeDisabled();
  await expect(expandAll).toHaveAttribute(
    'title',
    'Expand all is disabled above 1,000 Applications; this Catalog has 1,001.',
  );

  // The collapsed Overview and opening single Groups remain.
  await expect(canvas(page)).toHaveAttribute('data-open', '0', LAID_OUT);
  const before = Number(await canvas(page).getAttribute('data-collapsed'));
  expect(before).toBeGreaterThan(0);
  await clickNode(page, '[kind = "collapsed"]');
  await expect(canvas(page)).toHaveAttribute('data-open', '1', LAID_OUT);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', String(before - 1));
});

test('above 3,000 Applications the Overview is disabled, with a notice naming the counts', async ({
  page,
}) => {
  await page.goto(`${OVER_OVERVIEW}${OVERVIEW}`);
  await expect(page.getByTestId('header-counts')).toHaveText('3,001 Applications, 75 Externals');

  await expect(page.getByTestId('expand-canvas')).toBeDisabled();
  await expect(page.getByTestId('overview')).toHaveCount(0);
  await expect(page.getByTestId('overview-canvas')).toHaveCount(0);

  const notice = await page.getByTestId('overview-notice').textContent();
  expect(notice).toContain('3,001 Applications');
  expect(notice).toContain('3,000-Application limit');
  expect(notice).toMatch(/[\d,]+ Dependencies/);

  // Nothing else is refused for the Catalog's size: the ranked table is on screen.
  await expect(page.getByTestId('ranked-link').first()).toBeVisible();
});
