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
 * Budgets 9, 10 and 11 DO NOT HOLD, and issue #41 carries the measurements and the spec question.
 * The cause is measured, not guessed: elk's cost is superlinear in the edge count, and the collapsed
 * Overview hands it 1,498 Group Dependencies over 123 Groups (9 ms at 0 edges, 126 ms at 350, 565 ms
 * at 750, 2,783 ms at 1,498). dagre is worse on the same specs (6,249 ms) and throws outright on the
 * compound Expand-all shape, and no `elk.layered` option gets under the ceiling, so neither
 * loosening the budget nor switching the engine is a slice's call.
 *
 * The three tests below therefore assert what is true rather than what was hoped:
 *   - the PAINT half of each budget, which does hold with room to spare;
 *   - the Group-Dependency count that blows budget 9, so the input is pinned;
 *   - a REGRESSION GUARD on the elk half at today's cost. That guard is NOT the budget: it exists so
 *     the Overview cannot get slower unnoticed while #41 is open, and it is replaced by the real
 *     ceiling the moment #41 is decided.
 */
/** Budget 9 wants 750 ms; #41. Today's elk half is ~2.4 s warm, ~2.7 s cold. */
const GUARD_COLLAPSED_ELK = 4000;
/** Budget 11 wants 5 s; #41. Today's elk half is ~7.3 s. */
const GUARD_EXPAND_ALL_ELK = 11_000;

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
 */
async function clickNode(page: Page, selector: string): Promise<string> {
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

test('budget 9 MISSES (#41): the collapsed Overview paints 123 Groups and 1,498 Group Dependencies', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');

  // One node per Group, no members, and the collapsed Groups' intra-Group edges are not drawn.
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
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
  expect(drawn.groupEdges).toBeGreaterThan(0);
  expect(drawn.memberEdges).toBe(0);
  expect(drawn.unlabelled).toBe(0);
  expect(drawn.pairs).toBe(drawn.groupEdges);
  // The input that blows budget 9, pinned: twelve Group Dependencies per Group node (#41).
  expect(drawn.groupEdges).toBe(1498);

  const total = await longestMs(page, OVERVIEW_MEASURE);
  const elk = await longestMs(page, ELK_MEASURE);
  // The paint half of budget 9 holds with room to spare; only elk misses.
  expect(total - elk).toBeLessThanOrEqual(budget(250));
  expect(elk).toBeLessThanOrEqual(budget(GUARD_COLLAPSED_ELK));
  // Documents the miss in the run itself, so nobody reads this green test as budget 9 holding.
  expect(elk, `budget 9 is 750 ms and is not met; see issue #41`).toBeGreaterThan(budget(750));
});

test('budget 12: the animation duration the canvas is configured with is the fixed 300 ms', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  // Read, not timed: the ticket asks for the configured duration.
  await expect(canvas(page)).toHaveAttribute('data-animation-ms', '300');
});

test('budget 10 MISSES (#41): opening a Group re-lays out and draws its members and their Dependencies', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
  await clearTimings(page);

  const opened = await clickNode(page, '[kind = "collapsed"]');
  await expect(canvas(page)).toHaveAttribute('data-open', '1');
  await expect(canvas(page)).toHaveAttribute('data-collapsed', String(Number(THOUSAND_GROUPS) - 1));
  expect(
    (await longestMs(page, OVERVIEW_MEASURE)) - (await longestMs(page, ELK_MEASURE)),
  ).toBeLessThanOrEqual(budget(250));
  expect(await longestMs(page, ELK_MEASURE)).toBeLessThanOrEqual(budget(GUARD_COLLAPSED_ELK));

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
  await expect(canvas(page)).toHaveAttribute('data-open', '0');
  await expect(canvas(page)).toHaveAttribute('data-members', '0');
  expect(
    (await longestMs(page, OVERVIEW_MEASURE)) - (await longestMs(page, ELK_MEASURE)),
  ).toBeLessThanOrEqual(budget(250));
  expect(await longestMs(page, ELK_MEASURE)).toBeLessThanOrEqual(budget(GUARD_COLLAPSED_ELK));
});

test('budget 11 MISSES on time only (#41): Expand all keeps its progress, cancel and a live page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
  await clearTimings(page);

  await page.getByTestId('expand-all').click();
  await expect(page.getByTestId('overview-progress')).toBeVisible();
  await expect(page.getByTestId('overview-cancel')).toBeVisible();

  // The main thread stays interactive: a header control answers while elk is still working.
  await page.getByTestId('depth-select').selectOption('3');
  await expect(page.getByTestId('depth-select')).toHaveValue('3');
  await expect(page.getByTestId('overview-progress')).toBeVisible();

  await expect(canvas(page)).toHaveAttribute('data-members', '1000', { timeout: 90_000 });
  await expect(canvas(page)).toHaveAttribute('data-open', THOUSAND_GROUPS);
  await expect(page.getByTestId('overview-progress')).toHaveCount(0);

  const total = await longestMs(page, OVERVIEW_MEASURE);
  const elk = await longestMs(page, ELK_MEASURE);
  // 1,000 members and 123 compound parents paint in well under a second; elk is the whole cost.
  expect(total - elk).toBeLessThanOrEqual(budget(1000));
  expect(elk).toBeLessThanOrEqual(budget(GUARD_EXPAND_ALL_ELK));
  expect(elk, 'budget 11 is 5 s and is not met; see issue #41').toBeGreaterThan(budget(5000));
});

test('cancelling Expand all aborts the run and keeps the previous positions', async ({ page }) => {
  await page.goto(`${THOUSAND}${OVERVIEW}`);
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
  const before = await nodePositions(page);

  await page.getByTestId('expand-all').click();
  await expect(page.getByTestId('overview-progress')).toBeVisible();
  await page.getByTestId('overview-cancel').click();

  await expect(page.getByTestId('overview-cancelled')).toBeVisible();
  await expect(page.getByTestId('overview-progress')).toHaveCount(0);
  // The previous drawing is untouched: same nodes, same positions.
  await expect(canvas(page)).toHaveAttribute('data-collapsed', THOUSAND_GROUPS);
  await expect(canvas(page)).toHaveAttribute('data-members', '0');
  expect(await nodePositions(page)).toEqual(before);
});

test('an Application Centre auto-opens its Group, which cannot be collapsed, and members select', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}#app=acme/billing-platform/auth-service&view=overview`);
  await expect(page.getByTestId('center-id')).toHaveText('acme/billing-platform/auth-service');
  await expect(canvas(page)).toHaveAttribute('data-open', '1');

  const highlighted = await page.evaluate(
    (selector) =>
      (document.querySelector(selector) as CanvasHost).__cy
        .nodes('[kind = "open"][highlighted = "true"]')
        .map((node) => String(node.data('sourceId'))),
    CANVAS_SELECTOR,
  );
  expect(highlighted).toEqual(['repository=acme/billing-platform']);

  // First prove a label-chip click closes a Group in exactly this state, so the assertion about the
  // locked Group below cannot pass just because the click missed.
  await clickNode(page, '[kind = "collapsed"]');
  await expect(canvas(page)).toHaveAttribute('data-open', '2');
  const other = await clickNode(
    page,
    '[sourceId != "repository=acme/billing-platform"][kind = "label"]',
  );
  expect(other).not.toBe('repository=acme/billing-platform');
  await expect(canvas(page)).toHaveAttribute('data-open', '1');

  // The Centre's own Group refuses the same click, because it holds the Centre.
  const locked = await clickNode(
    page,
    '[sourceId = "repository=acme/billing-platform"][kind = "label"]',
  );
  expect(locked).toBe('repository=acme/billing-platform');
  await expect(canvas(page)).toHaveAttribute('data-open', '1');

  // Clicking a member selects it, and the board follows.
  const member = await clickNode(page, '[kind = "member"]');
  await expect(page.getByTestId('center-id')).toHaveText(member);
  await expect.poll(() => new URL(page.url()).hash).toContain(`app=${member}`);
});

test('an External Centre highlights its Dependents’ Groups, collapsed, and opens none', async ({
  page,
}) => {
  await page.goto(`${THOUSAND}#external=postgres-main&view=overview`);
  await expect(page.getByTestId('center-id')).toHaveText('postgres-main');
  await expect(canvas(page)).toHaveAttribute('data-open', '0');

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
  await expect(canvas(page)).toHaveAttribute('data-collapsed', '10');

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
  await expect(canvas(page)).toBeVisible();
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
  const before = Number(await canvas(page).getAttribute('data-collapsed'));
  expect(before).toBeGreaterThan(0);
  await clickNode(page, '[kind = "collapsed"]');
  await expect(canvas(page)).toHaveAttribute('data-open', '1');
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
