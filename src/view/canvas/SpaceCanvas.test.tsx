import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { SpaceCanvas } from './SpaceCanvas';

vi.mock('./space-layout', async (original) => ({
  ...(await original<typeof import('./space-layout')>()),
  createSpaceScene: async () => ({
    setGraph: vi.fn(),
    setStyle: vi.fn(),
    drawn: () => ({ nodes: 1, edges: 0 }),
    paintedNodes: () => 1,
    positions: () => new Map(),
    screenPoint: () => null,
    focus: () => false,
    settled: () => false,
    autoRotating: () => false,
    stepRotation: () => false,
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}));

describe('SpaceCanvas', () => {
  it('provides the labelled, render-owned 3D canvas host', () => {
    render(
      <SpaceCanvas
        graph={{ nodes: [], edges: [] }}
        style={{ nodeColour: () => '#fff', nodeSize: () => 1, linkColour: () => '#fff' }}
        reducedMotion={false}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByTestId('space-canvas').getAttribute('aria-label')).toContain(
      'Three-dimensional',
    );
  });
});
