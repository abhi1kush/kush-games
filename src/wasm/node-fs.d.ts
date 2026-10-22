// The wasm integration test reads .wasm files from disk under vitest (Node); this is the only Node API the app's
// TypeScript sees, so declare just that instead of pulling in all of @types/node.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array<ArrayBuffer>;
}
