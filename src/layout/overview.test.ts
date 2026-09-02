import { describe, expect, it, vi } from 'vitest';
import { createOverviewLayout, type ElkWorkerLike, type LayoutSpec } from './index';
import { NODE_HEIGHT, NODE_WIDTH } from './sample-specs';

type Message = { id: number; cmd: string; graph?: ElkGraph; algorithms?: string[] };
type ElkGraph = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkGraph[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
};

/** A worker that records what it is sent and answers only when the test says so. */
class FakeWorker implements ElkWorkerLike {
  posted: Message[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage(message: unknown) {
    this.posted.push(message as Message);
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  /** The last layout request, once it has been posted. */
  async layoutRequest(): Promise<Message> {
    for (let i = 0; i < 50; i++) {
      const request = [...this.posted].reverse().find((message) => message.cmd === 'layout');
      if (request) {
        return request;
      }
      await tick();
    }
    throw new Error('no layout request was posted');
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Lays the graph out the way elk would report it: children stacked, coordinates parent-relative. */
function laidOut(graph: ElkGraph): ElkGraph {
  let y = 0;
  const children = (graph.children ?? []).map((child) => {
    const done = laidOut(child);
    const height = done.height ?? 0;
    const placed = { ...done, x: 5, y };
    y += height + 10;
    return placed;
  });
  const isGroup = (graph.children?.length ?? 0) > 0;
  const width = isGroup ? Math.max(...children.map((c) => (c.width ?? 0) + 10)) : graph.width;
  const height = isGroup ? y : graph.height;
  return { ...graph, children, width, height };
}

function harness() {
  const workers: FakeWorker[] = [];
  const createWorker = vi.fn(async () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, createWorker, layout: createOverviewLayout({ createWorker }) };
}

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

describe('createOverviewLayout with a worker factory (the browser adapter, faked)', () => {
  it('registers layered, posts one layout request per run and resolves absolute centres', async () => {
    const { workers, layout } = harness();
    const running = layout.run(spec);
    await tick();
    const worker = workers[0] as FakeWorker;
    const request = await worker.layoutRequest();
    expect(worker.posted[0]).toMatchObject({ cmd: 'register', algorithms: ['layered'] });
    expect(request).toMatchObject({
      cmd: 'layout',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      },
    });
    const graph = request?.graph as ElkGraph;
    expect(graph.children?.map((child) => child.id)).toEqual(['c', 'g']);
    expect(graph.children?.[1]?.children?.map((child) => child.id)).toEqual(['a', 'b']);
    expect(graph.edges).toHaveLength(2);

    worker?.reply({ id: request?.id, data: laidOut(graph) });
    const positions = await running;
    // Root children stack: c at (5, 0), then g at (5, 40). Inside g: a at (5, 0), b at (5, 40).
    // Parent-relative corners become absolute centres: a is (5 + 5 + 60, 40 + 0 + 15).
    expect(positions.get('c')).toEqual({ x: 65, y: 15 });
    expect(positions.get('a')).toEqual({ x: 70, y: 55 });
    expect(positions.get('b')).toEqual({ x: 70, y: 95 });
    expect(positions.get('g')).toEqual({ x: 70, y: 80, width: 130, height: 80 });
  });

  it('an abort terminates the worker, rejects with the reason and starts a fresh worker', async () => {
    const { workers, createWorker, layout } = harness();
    const controller = new AbortController();
    const running = layout.run(spec, controller.signal);
    await tick();
    const first = workers[0] as FakeWorker;
    await first.layoutRequest();

    controller.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(first.terminate).toHaveBeenCalledTimes(1);

    // Recreated eagerly, registered, and the next run goes to the new worker.
    await tick();
    expect(createWorker).toHaveBeenCalledTimes(2);
    const second = workers[1] as FakeWorker;
    expect(second.posted[0]).toMatchObject({ cmd: 'register' });
    const next = layout.run(spec);
    const request = await second.layoutRequest();
    second.reply({ id: request.id, data: laidOut(request.graph as ElkGraph) });
    expect((await next).size).toBe(4);
    expect(first.posted.filter((message) => message.cmd === 'layout')).toHaveLength(1);
  });

  it('rejects with the given abort reason and every run in flight at once', async () => {
    const { workers, layout } = harness();
    const controller = new AbortController();
    const one = layout.run(spec, controller.signal);
    const two = layout.run(spec);
    await tick();
    await (workers[0] as FakeWorker).layoutRequest();
    const reason = new Error('user navigated away');
    controller.abort(reason);
    await expect(one).rejects.toBe(reason);
    await expect(two).rejects.toBe(reason);
  });

  it('a signal aborted before run rejects without creating a worker', async () => {
    const { createWorker, layout } = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(layout.run(spec, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("an error reply rejects that run with an Error carrying elk's message", async () => {
    const { workers, layout } = harness();
    const running = layout.run(spec);
    await tick();
    const worker = workers[0] as FakeWorker;
    const request = await worker.layoutRequest();
    worker.reply({ id: request.id, error: { message: 'Layout option not supported' } });
    await expect(running).rejects.toThrow('Layout option not supported');
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('a reply for an unknown id is ignored and the run still resolves later', async () => {
    const { workers, layout } = harness();
    const running = layout.run(spec);
    await tick();
    const worker = workers[0] as FakeWorker;
    const request = await worker.layoutRequest();
    worker.reply({ id: 999, data: {} });
    worker.reply({ id: request.id, data: laidOut(request.graph as ElkGraph) });
    expect((await running).size).toBe(4);
  });

  it('dispose terminates the worker, rejects runs in flight and refuses new ones', async () => {
    const { workers, createWorker, layout } = harness();
    const running = layout.run(spec);
    await tick();
    const worker = workers[0] as FakeWorker;
    await worker.layoutRequest();
    layout.dispose();
    await expect(running).rejects.toThrow('disposed');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(layout.run(spec)).rejects.toThrow('disposed');
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('a worker factory that fails rejects the run and is retried on the next run', async () => {
    let attempts = 0;
    const layout = createOverviewLayout({
      createWorker: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('no Worker here');
        }
        return new FakeWorker();
      },
    });
    await expect(layout.run(spec)).rejects.toThrow('no Worker here');
    const running = layout.run(spec);
    await tick();
    expect(attempts).toBe(2);
    layout.dispose();
    await expect(running).rejects.toThrow('disposed');
  });
});
