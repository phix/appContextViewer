import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api';
import {
  assertFinite,
  type Id,
  type IndexedSpec,
  indexSpec,
  type OverviewSpec,
  type Positions,
} from './spec';

/**
 * elk `layered` through elkjs's own worker protocol, with the worker behind a factory: in the
 * browser `createOverviewLayout()` creates elk.worker.ts through Vite's `?worker` import; in Node it
 * creates the in-process "fake worker" class elkjs ships in the same file (elk-worker.min.js), so
 * the tests and the fallback chain run elk directly. One code path, two adapters (docs/architecture.md).
 *
 * Protocol (node_modules/elkjs/lib/elk-api.js, PromisedWorker): post `{ id, cmd: 'register',
 * algorithms }` once, then `{ id, cmd: 'layout', graph, layoutOptions, options }` per run; the worker
 * answers `{ id }`, `{ id, data: graph }` or `{ id, error }`. Positions in the answer are relative to
 * the parent node's top-left corner (ELK JSON format); toPositions makes them absolute centres.
 */

/** From the layout research: top-down layered, Groups laid out with their children in one pass. */
export const ELK_ROOT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.spacing.nodeNode': '30',
  'elk.spacing.componentComponent': '40',
};

/** Room for a Group label above its members. */
export const ELK_GROUP_OPTIONS: LayoutOptions = {
  'elk.padding': '[top=30,left=12,bottom=12,right=12]',
};

/** What the adapter needs from a Worker; a real `Worker` satisfies it, so does elkjs's in-process one. */
export type ElkWorkerLike = {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  terminate?: () => void;
};

export type WorkerFactory = () => ElkWorkerLike | Promise<ElkWorkerLike>;

export type OverviewLayout = {
  /**
   * Lays out `spec` on the current worker. Rejects with `LayoutSpecError` for an invalid spec, with
   * the worker's error when elk fails, and with `signal.reason` when `signal` aborts; an abort
   * terminates the worker (every other run in flight rejects with the same reason) and starts a
   * fresh one so the next run does not pay for the termination.
   */
  run(spec: OverviewSpec, signal?: AbortSignal): Promise<Positions>;
  /** Terminates the worker; every run in flight rejects and later runs reject too. */
  dispose(): void;
};

type Pending = { resolve: (graph: ElkNode) => void; reject: (reason: unknown) => void };
type Session = { worker: ElkWorkerLike; pending: Map<number, Pending> };
type Reply = { id: number; data?: ElkNode; error?: unknown };

/** In the browser: elk.worker.ts as a Web Worker, its chunk loaded on first use. */
export const browserWorker: WorkerFactory = async () => {
  const { default: ElkWorker } = await import('./elk.worker.ts?worker');
  return new ElkWorker();
};

/** Anywhere: elkjs's in-process worker, its chunk loaded on first use. Runs on the calling thread. */
export const directWorker: WorkerFactory = async () => {
  const module: unknown = await import('elkjs/lib/elk-worker.min.js');
  return new (fakeWorkerClass(module))();
};

function fakeWorkerClass(module: unknown): new () => ElkWorkerLike {
  // elk-worker.min.js is CommonJS (`module.exports = { default: Worker, Worker }`); depending on
  // who loaded it the class sits on `.Worker`, on `.default.Worker`, or is `.default` itself.
  const candidates = [module, (module as { default?: unknown }).default];
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate as new () => ElkWorkerLike;
    }
    const worker = (candidate as { Worker?: unknown } | undefined)?.Worker;
    if (typeof worker === 'function') {
      return worker as new () => ElkWorkerLike;
    }
  }
  throw new Error('elkjs/lib/elk-worker.min.js did not export its Worker class');
}

export function createOverviewLayout(deps: { createWorker?: WorkerFactory } = {}): OverviewLayout {
  const createWorker =
    deps.createWorker ?? (typeof Worker === 'function' ? browserWorker : directWorker);
  let session: Promise<Session> | null = null;
  let generation = 0;
  let nextId = 0;
  let disposed = false;

  const receive = (current: Session, reply: Reply) => {
    const pending = current.pending.get(reply.id);
    if (!pending) {
      return;
    }
    current.pending.delete(reply.id);
    if (reply.error !== undefined) {
      pending.reject(toError(reply.error));
    } else if (reply.data) {
      pending.resolve(reply.data);
    } else {
      pending.reject(new Error('elk answered a layout request without a graph'));
    }
  };

  const open = (): Promise<Session> => {
    if (!session) {
      const opened = generation;
      session = (async () => {
        const worker = await createWorker();
        if (opened !== generation) {
          worker.terminate?.();
          throw new Error('elk worker replaced while starting');
        }
        const current: Session = { worker, pending: new Map() };
        worker.onmessage = (event) => receive(current, event.data as Reply);
        worker.postMessage({ id: nextId++, cmd: 'register', algorithms: ['layered'] });
        return current;
      })();
      session.catch(() => {
        if (opened === generation) {
          session = null;
        }
      });
    }
    return session;
  };

  const close = (reason: unknown) => {
    const closing = session;
    session = null;
    generation++;
    closing
      ?.then((current) => {
        current.worker.terminate?.();
        for (const pending of current.pending.values()) {
          pending.reject(reason);
        }
        current.pending.clear();
      })
      .catch(() => undefined);
  };

  return {
    async run(spec, signal) {
      if (disposed) {
        throw new Error('this Overview layout is disposed');
      }
      if (signal?.aborted) {
        throw signal.reason ?? abortError();
      }
      const indexed = indexSpec(spec);
      const graph = toElkGraph(indexed);
      const current = await open();
      const laidOut = await new Promise<ElkNode>((resolve, reject) => {
        const id = nextId++;
        const onAbort = () => {
          const reason = signal?.reason ?? abortError();
          close(reason);
          if (!disposed) {
            open().catch(() => undefined);
          }
        };
        const settle =
          <T>(fn: (value: T) => void) =>
          (value: T) => {
            signal?.removeEventListener('abort', onAbort);
            fn(value);
          };
        current.pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
        signal?.addEventListener('abort', onAbort, { once: true });
        current.worker.postMessage({
          id,
          cmd: 'layout',
          graph,
          layoutOptions: ELK_ROOT_OPTIONS,
          options: {},
        });
      });
      return toPositions(laidOut, indexed);
    },
    dispose() {
      disposed = true;
      close(new Error('this Overview layout is disposed'));
    },
  };
}

/** elk directly, on the calling thread: what the fallback chain uses and what Node tests hit. */
export async function layoutWithElk(spec: OverviewSpec, signal?: AbortSignal): Promise<Positions> {
  const layout = createOverviewLayout({ createWorker: directWorker });
  try {
    return await layout.run(spec, signal);
  } finally {
    layout.dispose();
  }
}

export function toElkGraph(indexed: IndexedSpec): ElkNode {
  const ids = [...indexed.leaves.keys(), ...indexed.groups];
  let rootId = 'root';
  while (ids.some((id) => id.startsWith(rootId))) {
    rootId += '_';
  }
  const build = (id: Id): ElkNode => {
    if (indexed.groups.has(id)) {
      return {
        id,
        layoutOptions: ELK_GROUP_OPTIONS,
        children: (indexed.members.get(id) ?? []).map(build),
      };
    }
    const leaf = indexed.leaves.get(id) as { width: number; height: number };
    return { id, width: leaf.width, height: leaf.height };
  };
  const edges: ElkExtendedEdge[] = indexed.spec.edges.map((edge, i) => ({
    id: `${rootId}/e${i}`,
    sources: [edge.source],
    targets: [edge.target],
  }));
  return { id: rootId, layoutOptions: ELK_ROOT_OPTIONS, children: indexed.roots.map(build), edges };
}

export function toPositions(root: ElkNode, indexed: IndexedSpec): Positions {
  const positions: Positions = new Map();
  const walk = (node: ElkNode, offsetX: number, offsetY: number) => {
    const left = (node.x ?? Number.NaN) + offsetX;
    const top = (node.y ?? Number.NaN) + offsetY;
    const width = node.width ?? Number.NaN;
    const height = node.height ?? Number.NaN;
    assertFinite('elk', node.id, left, top, width, height);
    if (indexed.groups.has(node.id)) {
      positions.set(node.id, { x: left + width / 2, y: top + height / 2, width, height });
      for (const child of node.children ?? []) {
        walk(child, left, top);
      }
    } else {
      positions.set(node.id, { x: left + width / 2, y: top + height / 2 });
    }
  };
  for (const child of root.children ?? []) {
    walk(child, 0, 0);
  }
  for (const id of [...indexed.leaves.keys(), ...indexed.groups]) {
    if (!positions.has(id)) {
      throw new Error(`elk returned no position for "${id}"`);
    }
  }
  return positions;
}

function abortError(): Error {
  return new DOMException('The Overview layout was aborted', 'AbortError');
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return new Error(`elk failed: ${typeof message === 'string' ? message : String(error)}`);
}
