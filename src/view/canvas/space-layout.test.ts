import { describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND,
  createSpaceScene,
  type EngineEdge,
  type EngineNode,
  FOCUS_STANDOFF,
  FOG_DENSITY,
  SETTLE_TICKS,
  type SpaceEngineInstance,
  WARMUP_TICKS,
} from './space-layout';

function fake() {
  let data: { nodes: EngineNode[]; links: EngineEdge[] } = { nodes: [], links: [] };
  let stop: () => void = () => undefined;
  let click: (node: EngineNode) => void = () => undefined;
  let camera = { x: 0, y: 0, z: 100 };
  const threeScene = { fog: null as unknown, traverse: () => undefined };
  const engine: SpaceEngineInstance = {
    graphData(next?: typeof data) {
      if (next) data = next;
      return data;
    },
    nodeId: vi.fn(),
    linkSource: vi.fn(),
    linkTarget: vi.fn(),
    nodeRelSize: vi.fn(),
    nodeVal: vi.fn(),
    nodeColor: vi.fn(),
    nodeLabel: vi.fn(),
    nodeOpacity: vi.fn(),
    nodeResolution: vi.fn(),
    linkColor: vi.fn(),
    linkOpacity: vi.fn(),
    linkWidth: vi.fn(),
    backgroundColor: vi.fn(),
    showNavInfo: vi.fn(),
    enableNodeDrag: vi.fn(),
    warmupTicks: vi.fn(),
    cooldownTicks: vi.fn(),
    onNodeClick(fn) {
      click = fn;
    },
    onEngineStop(fn) {
      stop = fn;
    },
    cameraPosition(next?: Partial<{ x: number; y: number; z: number }>) {
      if (next) camera = { ...camera, ...next };
      return camera;
    },
    zoomToFit: vi.fn(),
    width: vi.fn(),
    height: vi.fn(),
    scene: () => threeScene,
    graph2ScreenCoords: (x, y) => ({ x, y, z: 0 }),
    _destructor: vi.fn(),
  } as SpaceEngineInstance;
  return { engine, stop: () => stop(), click: (node: EngineNode) => click(node) };
}

describe('createSpaceScene', () => {
  it('configures a yielding 3D scene, selects nodes, pins settled positions, and never relayouts on restyle', async () => {
    const f = fake();
    const selected = vi.fn();
    const scene = await createSpaceScene({
      container: document.createElement('div'),
      reducedMotion: true,
      onSelect: selected,
      load: async () => ({
        create: () => f.engine,
        createFog: (colour, density) => ({ colour, density }),
      }),
    });
    expect(f.engine.backgroundColor).toHaveBeenCalledWith(BACKGROUND);
    expect(f.engine.warmupTicks).toHaveBeenCalledWith(WARMUP_TICKS);
    expect(f.engine.cooldownTicks).toHaveBeenCalledWith(SETTLE_TICKS);
    scene.setGraph({
      nodes: [
        { id: 'application:a/b', sourceId: 'a/b', kind: 'application', label: 'b', group: '' },
      ],
      edges: [],
    });
    const held = f.engine.graphData().nodes[0];
    held.x = 1;
    held.y = 2;
    held.z = 3;
    f.stop();
    expect(scene.settled()).toBe(true);
    expect(held).toMatchObject({ fx: 1, fy: 2, fz: 3 });
    expect(f.engine.zoomToFit).toHaveBeenCalledWith(0, 40);
    expect(scene.autoRotating()).toBe(false);
    f.click(held);
    expect(selected).toHaveBeenCalledWith({ kind: 'application', id: 'a/b' });
    const before = f.engine.graphData();
    scene.setStyle({ nodeColour: () => '#f00', nodeSize: () => 2, linkColour: () => '#fff' });
    expect(f.engine.graphData()).toBe(before);
    expect(scene.screenPoint('application:a/b')).toEqual({ x: 1, y: 2 });
    expect(f.engine.scene().fog).toEqual({ colour: BACKGROUND, density: FOG_DENSITY });
  });

  it('focus centres the camera on a drawn node and reports nodes it never drew', async () => {
    const f = fake();
    const scene = await createSpaceScene({
      container: document.createElement('div'),
      reducedMotion: true,
      onSelect: vi.fn(),
      load: async () => ({
        create: () => f.engine,
        createFog: () => null,
      }),
    });
    scene.setGraph({
      nodes: [
        { id: 'application:a/b', sourceId: 'a/b', kind: 'application', label: 'b', group: '' },
      ],
      edges: [],
    });
    const held = f.engine.graphData().nodes[0];
    held.x = 10;
    held.y = 20;
    held.z = 30;

    expect(scene.focus('application:missing')).toBe(false);
    expect(scene.focus('application:a/b')).toBe(true);
    expect(f.engine.cameraPosition()).toEqual({ x: 10, y: 20, z: 30 + FOCUS_STANDOFF });
  });
});
