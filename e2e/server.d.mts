// Types for e2e/server.mjs, so a TypeScript spec can start its own instance.
// tsconfig sets neither allowJs nor checkJs, so importing the .mjs directly is TS7016;
// this declaration is the narrow fix (PR #36 escalation 1).
import type * as http from 'node:http';

export interface StaticMount {
  /** URL prefix, for example '/samples/'. */
  readonly prefix: string;
  /** Directory served under that prefix. */
  readonly dir: string;
}

export interface StaticServerOptions {
  /** Defaults to dist/ at /, samples/ at /samples/, e2e/.fixtures/ at /fixtures/. */
  readonly mounts?: readonly StaticMount[];
  /** Send `Access-Control-Allow-Origin: *`. Pass false to test a host that refuses CORS. */
  readonly cors?: boolean;
}

export declare const defaultMounts: readonly StaticMount[];
export declare function createStaticServer(options?: StaticServerOptions): http.Server;
