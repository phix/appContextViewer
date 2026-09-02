import { describe, expect, it, vi } from 'vitest';
import { expectComplete, expectMembersInsideGroups } from './check-positions';
import {
  type LayoutSpec,
  LayoutSpecError,
  layoutNeighborhood,
  layoutWithFallback,
  type Positions,
} from './index';
import { NODE_HEIGHT, NODE_WIDTH } from './sample-specs';

const node = (id: string) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT });
const spec: LayoutSpec = {
  nodes: [node('a'), node('b'), node('c')],
  edges: [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ],
  parents: new Map([
    ['a', 'g'],
    ['b', 'g'],
  ]),
};
const canned: Positions = new Map([['a', { x: 1, y: 2 }]]);

describe('spec validation', () => {
  const cases: [string, LayoutSpec][] = [
    ['a duplicate node id', { nodes: [node('a'), node('a')], edges: [] }],
    ['an edge to an unknown id', { nodes: [node('a')], edges: [{ source: 'a', target: 'x' }] }],
    ['a NaN size', { nodes: [{ id: 'a', width: Number.NaN, height: 1 }], edges: [] }],
    ['a negative size', { nodes: [{ id: 'a', width: -1, height: 1 }], edges: [] }],
    [
      'an id that is both a node and a Group',
      { nodes: [node('a'), node('b')], edges: [], parents: new Map([['b', 'a']]) },
    ],
    [
      'a parent map naming an unknown member',
      { nodes: [node('a')], edges: [], parents: new Map([['x', 'g']]) },
    ],
    [
      'a Group nested inside itself',
      {
        nodes: [node('a')],
        edges: [],
        parents: new Map([
          ['a', 'g'],
          ['g', 'h'],
          ['h', 'g'],
        ]),
      },
    ],
  ];
  for (const [name, bad] of cases) {
    it(`rejects ${name} with LayoutSpecError`, async () => {
      expect(() => layoutNeighborhood(bad)).toThrow(LayoutSpecError);
      const dagre = vi.fn();
      await expect(layoutWithFallback(bad, { engines: { dagre } })).rejects.toThrow(
        LayoutSpecError,
      );
      expect(dagre).not.toHaveBeenCalled();
    });
  }
});

describe('layoutWithFallback', () => {
  it('answers with dagre when dagre succeeds', async () => {
    const result = await layoutWithFallback(spec);
    expect(result.engine).toBe('dagre');
    expect(result.failures).toEqual([]);
    expectComplete(result.positions, spec);
  });

  it('falls to elk when dagre throws, carrying the failure', async () => {
    const dagreError = new Error('Not possible to find intersection inside of the rectangle');
    const elk = vi.fn(async () => canned);
    const result = await layoutWithFallback(spec, {
      engines: {
        dagre: () => {
          throw dagreError;
        },
        elk,
      },
    });
    expect(result.engine).toBe('elk');
    expect(result.positions).toBe(canned);
    expect(result.failures).toEqual([{ engine: 'dagre', error: dagreError }]);
    expect(elk).toHaveBeenCalledWith(spec, undefined);
  });

  it('falls to breadthfirst when dagre throws and elk rejects', async () => {
    const elkError = new Error('elk failed');
    const result = await layoutWithFallback(spec, {
      engines: {
        dagre: () => {
          throw new Error('dagre');
        },
        elk: () => Promise.reject(elkError),
      },
    });
    expect(result.engine).toBe('breadthfirst');
    expect(result.failures.map((failure) => failure.engine)).toEqual(['dagre', 'elk']);
    expect(result.failures[1]?.error).toBe(elkError);
    expectComplete(result.positions, spec);
    expectMembersInsideGroups(result.positions, spec);
  });

  it('rejects with the last error when every engine fails', async () => {
    await expect(
      layoutWithFallback(spec, {
        engines: {
          dagre: () => {
            throw new Error('dagre');
          },
          elk: () => Promise.reject(new Error('elk')),
          breadthfirst: () => {
            throw new Error('breadthfirst');
          },
        },
      }),
    ).rejects.toThrow('breadthfirst');
  });

  it('really reaches elk when dagre is made to fail, and elk lays the spec out', async () => {
    const result = await layoutWithFallback(spec, {
      engines: {
        dagre: () => {
          throw new Error('dagre');
        },
      },
    });
    expect(result.engine).toBe('elk');
    expectComplete(result.positions, spec);
    expectMembersInsideGroups(result.positions, spec);
  });

  it('rejects with the abort reason instead of running any engine', async () => {
    const controller = new AbortController();
    const reason = new Error('gone');
    controller.abort(reason);
    const dagre = vi.fn();
    await expect(
      layoutWithFallback(spec, { signal: controller.signal, engines: { dagre } }),
    ).rejects.toBe(reason);
    expect(dagre).not.toHaveBeenCalled();
  });

  it('passes the signal to elk and stops the chain when elk was aborted', async () => {
    const controller = new AbortController();
    const breadthfirst = vi.fn();
    const elk = vi.fn((_spec: LayoutSpec, signal?: AbortSignal) => {
      controller.abort();
      return Promise.reject(signal?.reason);
    });
    await expect(
      layoutWithFallback(spec, {
        signal: controller.signal,
        engines: {
          dagre: () => {
            throw new Error('dagre');
          },
          elk,
          breadthfirst,
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(breadthfirst).not.toHaveBeenCalled();
  });
});
