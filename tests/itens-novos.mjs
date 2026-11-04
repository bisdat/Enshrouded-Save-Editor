import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'items.json'), 'utf8'));

const fonte = fs.readFileSync(path.join(RAIZ, 'src', 'gamedata.js'), 'utf8')
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/i18n\.js';$/gm,
    "const campoDeNome = () => 'pt';\nconst localeAtual = () => 'pt-BR';")
  .replace(/^import\s+(\w+)\s+from\s+'\.\.\/data\/([\w.-]+)\.json';$/gm,
    (_, nome, arq) => `const ${nome} = ${fs.readFileSync(path.join(RAIZ, 'data', `${arq}.json`), 'utf8')};`);
const tmp = path.join(RAIZ, `.gamedata-teste-${process.pid}.mjs`);
fs.writeFileSync(tmp, fonte);
let newEntry;
try {
  ({ newEntry } = await import(pathToFileURL(tmp).href));
} finally {
  fs.unlinkSync(tmp);
}

const flagsDe = (e) => (e.level !== undefined ? 0x01 : 0) | (e.durability !== undefined ? 0x02 : 0)
  | (e.liquid !== undefined ? 0x04 : 0) | (e.appearance !== undefined ? 0x08 : 0)
  | (e.upgrades !== undefined ? 0x10 : 0) | (e.socket !== undefined ? 0x20 : 0);

const CASOS = {
  'Joia da Queimadura': 0x01,
  'Joia da Mania de Batalha': 0x01,
  'Joia das Correntezas': 0x01,
  'Picareta de Aço': 0x13,
  Ancinho: 0x03,
  'Baú Enorme': 0x00,
  'Poço de Água': 0x00,
  'Planador Fantasma': 0x00,
  'Arpéu Melhorado': 0x00,
  'Mochila grande': 0x00,
  "Bolsa d'Água": 0x04,
  'Flecha Ardente Eterna I': 0x11,
  'Cura em Cadeia Eterna II': 0x11,
  'Machado de Aço': 0x13,
  'Anel de Vigor Excepcional': 0x11,
  'Protetor Prismático': 0x13,
};

let ok = 0;
let ruim = 0;
for (const [nome, esperado] of Object.entries(CASOS)) {
  const id = Object.keys(items).find((k) => items[k].pt === nome);
  if (!id) {
    console.log(`ERRO ${nome}: nao esta no catalogo`);
    ruim += 1;
    continue;
  }
  const e = newEntry(Number(id), 0, 1);
  const f = flagsDe(e);
  const bate = f === esperado;
  if (bate) ok += 1; else ruim += 1;
  console.log(`${bate ? 'ok  ' : 'ERRO'} ${nome.padEnd(28)} flags 0x${f.toString(16).padStart(2, '0')}`
    + ` (esperado 0x${esperado.toString(16).padStart(2, '0')})`);
}

console.log(`itens novos: ${ok} certos, ${ruim} errados`);
process.exit(ruim ? 1 : 0);
