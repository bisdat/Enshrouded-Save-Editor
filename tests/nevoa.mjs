import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sv2c = await import(pathToFileURL(path.join(RAIZ, 'shared', 'sv2c-web.mjs')).href);

const arquivo = process.argv[2];
if (!arquivo) { console.log('nevoa: no save given, skipped'); process.exit(0); }
if (typeof zlib.zstdCompressSync !== 'function') { console.log('nevoa: this Node has no zstd, skipped'); process.exit(0); }

const N = 1280, HEADER = 13;
const decompress = async (b) => new Uint8Array(zlib.zstdDecompressSync(b));
const compress = async (b) => new Uint8Array(zlib.zstdCompressSync(b));
const falha = (m) => { console.error(`FAIL: ${m}`); process.exit(1); };

await sv2c.init();
const todos = ['character_data', 'player_character', 'player_knowledge', 'fogofwar'];
const original = await sv2c.parse(fs.readFileSync(arquivo), decompress, todos);
const fog = original.blocks.find((b) => b.name === 'fogofwar');
if (!fog) falha('save has no fogofwar block');
if (fog.payload.length !== HEADER + N * N) falha(`fog payload is ${fog.payload.length} bytes`);
if (fog.payload.toString('latin1', 8, 12) !== 'FGOW') falha('fog magic is not FGOW');

const novo = Buffer.from(fog.payload);
let pintadas = 0;
for (let y = 590; y < 690; y++) for (let x = 590; x < 690; x++) {
  const i = HEADER + y * N + x, v = novo[i] > 127 ? 0 : 255;
  if (novo[i] !== v) pintadas++;
  novo[i] = v;
}
const blocks = original.blocks.map((b) => (b.name === 'fogofwar' ? { ...b, payload: novo, changed: true } : b));
const data = await sv2c.build({ header: original.header, blocks }, compress);

const relido = await sv2c.parse(data, decompress, todos);
const fog2 = relido.blocks.find((b) => b.name === 'fogofwar');
if (!fog2.payload.subarray(0, HEADER).equals(fog.payload.subarray(0, HEADER))) falha('fog header changed');
let diferentes = 0;
for (let i = 0; i < fog2.payload.length; i++) if (fog2.payload[i] !== fog.payload[i]) diferentes++;
if (diferentes !== pintadas) falha(`${diferentes} fog bytes changed, expected ${pintadas}`);
for (const b of relido.blocks) {
  if (b.name === 'fogofwar') continue;
  const o = original.blocks.find((x) => x.name === b.name);
  if (!o || !b.raw.equals(o.raw)) falha(`block ${b.name} changed`);
}
if (relido.blocks.map((b) => b.name).join() !== original.blocks.map((b) => b.name).join()) falha('block order changed');
if (process.argv[3]) fs.writeFileSync(process.argv[3], data);
console.log(`nevoa: ok — ${pintadas} cells painted, header kept, ${relido.blocks.length - 1} other blocks identical`);
