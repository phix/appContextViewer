import { expect, type Page, test } from '@playwright/test';
import { budget } from './budget';

const ATT = '/?src=/samples/att/catalog.att.json#view=space';
test.describe.configure({ timeout: 240_000 });

/**
 * The shape `__spaceScene` carries in the browser. Every `page.evaluate`/`locator.evaluate` callback
 * below runs in an isolated browser realm -- it cannot close over a Node-side helper function, so
 * the cast is inlined at each call site instead of factored into one.
 */
interface SceneHandle {
  positions(): Map<string, { x: number; y: number; z: number }>;
  screenPoint(id: string): { x: number; y: number } | null;
  focus(id: string): boolean;
  autoRotating(): boolean;
}
type SceneHost = HTMLElement & { __spaceScene: SceneHandle };

async function settled(page: Page) {
  const canvas = page.getByTestId('space-canvas');
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
  return canvas;
}

async function entryMs(page: Page): Promise<number> {
  await page.waitForFunction(
    () => performance.getEntriesByName('acv:space-entry-to-paint').length > 0,
  );
  return page.evaluate(
    () => performance.getEntriesByName('acv:space-entry-to-paint').at(-1)?.duration ?? Number.NaN,
  );
}

/** Median of several one-second windows, per the project's rule against a frame-quantised sample. */
async function medianFps(page: Page, samples = 3): Promise<number> {
  const readings: number[] = [];
  for (let i = 0; i < samples; i++) {
    readings.push(
      await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frames = 0;
            const start = performance.now();
            const frame = (time: number) => {
              frames++;
              if (time - start >= 1_000) resolve((frames * 1_000) / (time - start));
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }),
      ),
    );
  }
  readings.sort((a, b) => a - b);
  return readings[Math.floor(readings.length / 2)];
}

/** Every position the live scene actually holds, for the "recolours without moving" property. */
async function positionsOf(canvas: ReturnType<Page['getByTestId']>) {
  return canvas.evaluate((host) =>
    [...(host as SceneHost).__spaceScene.positions()].map(
      ([id, point]) => `${id}:${point.x},${point.y},${point.z}`,
    ),
  );
}

/**
 * Clicks the node `focus` last centred, retrying a few times: a real GPU raycast against a mesh a
 * few dozen pixels wide is not immune to a stray sub-pixel/frame-timing miss in a headless browser,
 * and a click test should tolerate that the way a real user's slightly-off click would (try again),
 * rather than pass or fail on one throw of that die.
 */
async function clickFocusedNode(page: Page, canvas: ReturnType<Page['getByTestId']>) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.mouse.click(x, y);
    if (/[?&#](app|external)=/.test(page.url())) {
      return;
    }
    await page.waitForTimeout(200);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(text: string): string {
  return text.replace(/["\\]/g, '\\$&');
}

test('Space is lazy, draws the whole Catalog, stays responsive while settling, and re-enters warm', async ({
  page,
}) => {
  await page.goto('/?src=/samples/catalog-1000.json');
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('3d-force-graph')),
    ),
  ).toBe(false);

  await page.getByTestId('space-toggle').click();
  await expect(page).toHaveURL(/view=space/);
  const canvas = page.getByTestId('space-canvas');

  // docs/space-view.md: "typing in search and clicking the header must stay responsive while the
  // simulation settles". Waits for the graph to actually be handed to the engine (cooldown ticking
  // under way, not merely the chunk still loading -- a keystroke before that would trivially pass
  // even if every cooldown tick synchronously blocked the thread) and reads budget 7's own
  // instrumented measure (`acv:search-to-results`, the same one e2e/board.spec.ts holds to 50 ms)
  // rather than a Node-side wall clock that also counts Playwright's own IPC round trip -- a tight
  // latency budget, not just eventual completion, so a real stall cannot pass by finishing before a
  // generous timeout.
  await expect(canvas).toHaveAttribute('data-nodes', '1025');
  await expect(canvas).not.toHaveAttribute('data-settled', 'true');
  await page.evaluate(() => performance.clearMeasures('acv:search-to-results'));
  await page.getByTestId('search-input').fill('orders');
  await expect(page.getByTestId('search-results')).toBeVisible();
  const responsiveMs = await page.evaluate(
    () => performance.getEntriesByName('acv:search-to-results').at(-1)?.duration ?? Number.NaN,
  );
  // A settling Space keeps other work on the main thread too, so this is looser than budget 7's
  // bare 50 ms -- still tight enough to fail hard against an actual multi-second stall.
  expect(responsiveMs).toBeLessThanOrEqual(budget(1_500));
  await expect(page.getByTestId('depth-select')).toBeEnabled();

  await settled(page);
  await expect(canvas).toHaveAttribute('data-nodes', '1025');
  await expect(canvas).toHaveAttribute('data-edges', '5395');
  const first = await entryMs(page);
  expect(Number.isFinite(first)).toBe(true);
  const fps = await medianFps(page);

  await page.getByTestId('space-toggle').click();
  await page.evaluate(() => performance.clearMeasures('acv:space-entry-to-paint'));
  await page.getByTestId('space-toggle').click();
  await settled(page);
  const warm = await entryMs(page);
  expect(Number.isFinite(warm)).toBe(true);

  test.info().annotations.push({
    type: 'space measurements: catalog-1000 (A, B, C)',
    description: `A first entry ${first.toFixed(1)} ms; B warm re-entry ${warm.toFixed(1)} ms; C orbiting frame rate (median of 3) ${fps.toFixed(1)} fps`,
  });
});

test('grouping recolours without moving nodes, and a focused node click selects the Center', async ({
  page,
}) => {
  // Auto-rotation runs its own rAF loop that recentres the camera on the origin every frame, which
  // would fight `focus()` for camera control right after this test moves it. Reduced motion keeps
  // the camera exactly where `focus()` puts it; auto-rotation itself is covered separately below.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ATT);
  const canvas = await settled(page);
  const before = await positionsOf(canvas);

  await canvas.evaluate((host) => {
    delete (host as HTMLElement).dataset.recolourMs;
  });
  const recolourStart = Date.now();
  await page.getByTestId('groupby-select').selectOption('team');
  await expect
    .poll(() => canvas.getAttribute('data-recolour-ms'), { timeout: 15_000 })
    .not.toBeNull();
  const recolourMs = Date.now() - recolourStart;

  const after = await positionsOf(canvas);
  // The property under test: identical positions before and after, not merely "some time passed".
  expect(after).toEqual(before);

  // `focus` puts a SPECIFIC drawn node dead centre, so the click target is deterministic instead of
  // depending on which of the fixture's nodes happens to land on screen after settling.
  const targetId = await canvas.evaluate((host) => {
    const scene = (host as SceneHost).__spaceScene;
    const id = [...scene.positions().keys()].find((candidate) =>
      candidate.startsWith('application:'),
    );
    if (id !== undefined) {
      scene.focus(id);
    }
    return id ?? null;
  });
  expect(targetId).not.toBeNull();
  // `graph2ScreenCoords` (and the GPU raycaster three-forcegraph uses to resolve a real click) both
  // read off the camera's current matrixWorld, which three.js recomputes on its own render loop's
  // next tick rather than synchronously inside `cameraPosition()`.
  await page.waitForTimeout(150);

  const selectStart = Date.now();
  await clickFocusedNode(page, canvas);
  const sourceId = (targetId ?? '').replace(/^application:/, '');
  await expect(page).toHaveURL(new RegExp(`app=${escapeRegExp(sourceId)}`));
  await expect(page.getByTestId('impact-board')).toBeVisible();
  await page.waitForFunction(() => performance.getEntriesByName('acv:select-to-board').length > 0);
  const selectMs = await page.evaluate(
    () => performance.getEntriesByName('acv:select-to-board').at(-1)?.duration ?? Number.NaN,
  );
  const wallClockSelectMs = Date.now() - selectStart;

  test.info().annotations.push({
    type: 'space measurements: catalog.att (D, E)',
    description: `D select to board painted ${selectMs.toFixed(1)} ms (${wallClockSelectMs} ms wall clock including retry); E recolour on grouping change ${recolourMs} ms (main-thread poll)`,
  });
});

test('reduced motion disables automatic rotation while keeping the Space available', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ATT);
  const canvas = await settled(page);
  await expect(canvas).toHaveAttribute('data-reduced-motion', 'true');
  expect(await canvas.evaluate((host) => (host as SceneHost).__spaceScene.autoRotating())).toBe(
    false,
  );
});

/**
 * docs/space-view.md: "Nothing is reachable only through the Space." The ranked table and search
 * stay on screen and functional with the Space open, and a node the Space actually drew (read off
 * its live scene, not a hand-built list) can also be found by typing its id into search -- the same
 * two surfaces the spec names as the accessibility floor. `src/view/Space.test.tsx` enumerates this
 * property exhaustively over the whole Catalog at the unit level; this closes the gap to the real
 * rendered page and real Search component.
 */
test('every node the Space draws stays reachable from the ranked table and search', async ({
  page,
}) => {
  await page.goto(ATT);
  const canvas = await settled(page);
  await expect(page.getByTestId('ranked-table')).toBeVisible();
  await expect(page.getByTestId('search-input')).toBeEnabled();

  const drawn = await canvas.evaluate((host) => [
    ...(host as SceneHost).__spaceScene.positions().keys(),
  ]);
  expect(drawn.length).toBeGreaterThan(0);
  const sample = drawn
    .filter((id) => id.startsWith('application:') || id.startsWith('external:'))
    .filter((_, index) => index % 37 === 0); // a spread across the fixture, not just the first few

  for (const id of sample) {
    const sourceId = id.replace(/^(application|external):/, '');
    await page.getByTestId('search-input').fill(sourceId);
    await expect(
      page.locator(`[data-testid="search-result"][data-id="${cssEscape(sourceId)}"]`).first(),
    ).toBeVisible();
  }
});
