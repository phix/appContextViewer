// elkjs ships no declaration for its worker build (lib/elk-worker.d.ts covers lib/elk-worker.js only);
// elk.ts treats the module as unknown and finds the Worker class at runtime.
declare module 'elkjs/lib/elk-worker.min.js';
