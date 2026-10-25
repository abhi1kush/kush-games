// Builds each game's Rust crate (wasm/<crate>) into src/wasm/<crate>/ with wasm-pack (target web; wasm-opt -Oz runs
// as part of wasm-pack's release profile, see each Cargo.toml). Prints raw and gzipped .wasm sizes.
// Usage: node scripts/build-wasm.mjs [crate…]
// The built output in src/wasm/ is committed, so a machine without the Rust toolchain can still build the site:
// if wasm-pack isn't installed this prints a warning and keeps the committed files (set REQUIRE_WASM_PACK=1 to fail instead).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const crates = process.argv.slice(2).length ? process.argv.slice(2) : ['breakout', 'connect_four', 'checkers', 'kush_jump', 'jungle_strike', 'antariksh_defenders', 'mithai_match', 'ludo', 'snakes_ladders', 'fleet_clash', 'carrom', 'jal_path', 'paani_pour'];
let hasWasmPack = true;
try { execFileSync('wasm-pack', ['--version'], { stdio: 'ignore' }); } catch { hasWasmPack = false; }
if (!hasWasmPack) {
  const missing = crates.filter(crate => !existsSync(`src/wasm/${crate}/${crate}_bg.wasm`));
  if (process.env.REQUIRE_WASM_PACK || missing.length) {
    console.error(`wasm-pack not found${missing.length ? ` and no committed build for: ${missing.join(', ')}` : ''}. Install the toolchain (see README → Rust/WebAssembly).`);
    process.exit(1);
  }
  console.warn('wasm-pack not found: using the committed builds in src/wasm/ (install the Rust toolchain to rebuild them).');
  process.exit(0);
}
for (const crate of crates) {
  const outDirectory = `src/wasm/${crate}`;
  execFileSync('wasm-pack', ['build', `wasm/${crate}`, '--release', '--target', 'web', '--out-dir', `../../${outDirectory}`, '--out-name', crate, '--no-pack'],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  for (const extra of ['.gitignore', 'package.json', 'README.md']) if (existsSync(`${outDirectory}/${extra}`)) rmSync(`${outDirectory}/${extra}`);
  const bytes = readFileSync(`${outDirectory}/${crate}_bg.wasm`);
  console.log(`${crate}_bg.wasm: ${(bytes.length / 1024).toFixed(1)} KB raw, ${(gzipSync(bytes, { level: 9 }).length / 1024).toFixed(1)} KB gzipped`);
}
