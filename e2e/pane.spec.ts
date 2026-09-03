import { expect, type Page, test } from '@playwright/test';
import { budget } from './budget.ts';

const THOUSAND = '/?src=/samples/catalog-1000.json';
const TYPICAL = 'acme/video/inference'; // 23 pane nodes at Depth 2
const EDGE_CAP_CASE = 'acme/video/config-service'; // 111 nodes, 325 Dependencies
const DEPTH_FALLBACK = 'acme/billing-platform/auth-service';

const PANE_MEASURE = 'acv:pane-layout-to-paint';
const HOVER_MEASURE = 'acv:pane-hover-to-paint';

function rankedLink(page: Page, id: string) {
  return page.getByTestId('ranked-link').filter({ hasText: id }).first();
}

async function clearTimings(page: Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });
}

async function longestMs(page: Page, name: string): Promise<number> {
  return page.evaluate((measure) => {
    const entries = performance.getEntriesByName(measure);
    return entries.length === 0 ? Number.NaN : Math.max(...entries.map((entry) => entry.duration));
  }, name);
}

async function select(page: Page, id: string): Promise<void> {
  await rankedLink(page, id).click();
  await expect(page.getByTestId('center-id')).toHaveText(id);
  await expect(page.locator('[data-testid="canvas"][data-ready="true"]')).toBeVisible();
}

test('budget 4: a typical Application Neighborhood lays out and paints under 100 ms', async ({
  page,
}) => {
  await page.goto(THOUSAND);
  await clearTimings(page);

  await select(page, TYPICAL);

  await expect(page.getByTestId('canvas')).toHaveAttribute('data-nodes', '23');
  await expect.poll(() => longestMs(page, PANE_MEASURE)).toBeLessThanOrEqual(budget(100));
});

test('budget 3: an edge-dense pane near the Dependency cap paints under 500 ms', async ({
  page,
}) => {
  await page.goto(THOUSAND);
  await clearTimings(page);

  await select(page, EDGE_CAP_CASE);

  // The 350-Dependency cap now binds before the legacy 150-node case in this fixture.
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-nodes', '111');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-edges', '325');
  await expect.poll(() => longestMs(page, PANE_MEASURE)).toBeLessThanOrEqual(budget(500));
});

test('the two cap notices use the Overview and Breaks escape hatches', async ({ page }) => {
  await page.goto(THOUSAND);

  await select(page, DEPTH_FALLBACK);
  await expect(page.getByTestId('pane-notice')).toHaveText(
    'Showing Depth 1 of 2; 544 more in the Overview, and 20 Externals not drawn',
  );
  await page.getByTestId('pane-overview-link').click();
  await expect.poll(() => new URL(page.url()).hash).toContain('view=overview');

  await page.getByTestId('depth-select').selectOption('1');
  await select(page, 'mysql-legacy');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-nodes', '1');
  await expect(page.getByTestId('pane-notice')).toHaveText(
    '197 Dependents, more than the pane can draw; see the Breaks column',
  );
});

test('budget 8: hover highlights a node and its edges; click selects it and the board follows', async ({
  page,
}) => {
  await page.goto(THOUSAND);
  await select(page, TYPICAL);
  await page.getByTestId('canvas').scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  await clearTimings(page);

  const target = await page.getByTestId('canvas').evaluate((element) => {
    const cy = (element as HTMLDivElement & { __cy?: import('cytoscape').Core }).__cy;
    if (cy === undefined) throw new Error('the pane has no Cytoscape core');
    const center = cy.nodes('[center = "true"]');
    const node = cy
      .nodes('[kind = "application"]')
      .not(center)
      .first() as unknown as import('cytoscape').NodeSingular;
    const position = node.renderedPosition();
    return { id: String(node.data('sourceId')), x: position.x, y: position.y };
  });
  const box = await page.getByTestId('canvas').boundingBox();
  if (box === null) throw new Error('the pane has no bounding box');

  await page.mouse.move(box.x + target.x, box.y + target.y);
  await expect
    .poll(() =>
      page.getByTestId('canvas').evaluate((element, id) => {
        const cy = (element as HTMLDivElement & { __cy?: import('cytoscape').Core }).__cy;
        const node = cy
          ?.nodes()
          .filter((candidate) => candidate.data('sourceId') === id)
          .first() as unknown as import('cytoscape').NodeSingular | undefined;
        return Boolean(
          node?.hasClass('is-hovered') &&
            node
              .connectedEdges()
              .every((edge) =>
                (edge as unknown as import('cytoscape').EdgeSingular).hasClass('is-hovered'),
              ),
        );
      }, target.id),
    )
    .toBe(true);
  await expect.poll(() => longestMs(page, HOVER_MEASURE)).toBeLessThanOrEqual(budget(50));

  await page.mouse.click(box.x + target.x, box.y + target.y);
  await expect(page.getByTestId('center-id')).toHaveText(target.id);
  await expect(page.getByTestId('impact-board')).toBeVisible();
});
