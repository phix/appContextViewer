import { describe, expect, it } from 'vitest';
import { ANIMATION_MS, overviewStyle } from './OverviewCanvas';

/**
 * Cytoscape cannot mount in jsdom ("Could not create canvas of type 2d"), so the renderer itself is
 * covered by e2e/overview.spec.ts in a real browser, exactly as the pane's Canvas is. What is worth
 * asserting here is what the browser cannot: that the configured animation duration is the constant
 * budget 12 fixes, pinned to its literal so moving the constant turns this red rather than agreeing
 * with itself.
 */
describe('OverviewCanvas constants', () => {
  it('animates over the 300 ms budget 12 fixes', () => {
    expect(ANIMATION_MS).toBe(300);
  });

  it('styles collapsed Groups, open Groups, members and both edge kinds', () => {
    const selectors = overviewStyle.map((rule) => rule.selector);
    expect(selectors).toContain('node[kind = "collapsed"]');
    expect(selectors).toContain('node[kind = "open"]');
    expect(selectors).toContain('node[kind = "member"]');
    expect(selectors).toContain('edge[kind = "member"]');
    expect(selectors).toContain('node[highlighted = "true"]');
    expect(selectors).toContain('edge[highlighted = "true"]');
  });

  it('labels every edge, so a Group Dependency can carry its count', () => {
    const edge = overviewStyle.find((rule) => rule.selector === 'edge');
    expect(edge !== undefined && 'style' in edge ? edge.style : undefined).toMatchObject({
      label: 'data(label)',
    });
  });
});
