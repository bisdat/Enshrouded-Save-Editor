import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parseCharacter, buildCharacter } = await import(pathToFileURL(path.join(RAIZ, 'shared', 'character.mjs')).href);
const items = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'items.json'), 'utf8'));
const skills = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'skills.json'), 'utf8'));

const CAB = 14;
const isItem = (id) => Object.prototype.hasOwnProperty.call(items, id);
const isSkill = (id) => Object.prototype.hasOwnProperty.call(skills.nodes, id);
const ESPACOS = new Set(['Armour_Head', 'Armour_UpperBody', 'Armour_Arms', 'Armour_LowerBody',
  'Armour_Feet', 'Armour_Ring', 'Shield', 'HookShot', 'Glider', 'Backpack']);
const ehEquipavel = (id) => ESPACOS.has(items[id]?.slot);

let ok = 0;
let ruim = 0;
const conferir = (certo, descricao) => {
  if (certo) ok += 1; else ruim += 1;
  console.log(`${certo ? 'ok  ' : 'ERRO'} ${descricao}`);
};

function personagemSintetico() {
  const equipaveis = Object.keys(items).filter((id) => ehEquipavel(id)).slice(0, 6).map(Number);
  const quaisquer = Object.keys(items).slice(0, 9).map(Number);
  const nos = Object.keys(skills.nodes).slice(0, 3).map(Number);
  if (equipaveis.length < 6 || quaisquer.length < 9 || nos.length < 3) {
    throw new Error('data/items.json ou data/skills.json pequenos demais para montar o caso');
  }

  const variacoes = [
    {},
    { level: 1 },
    { level: 40, durability: 1200, maxDurability: 1600 },
    { level: 55, appearance: 'deadbeef', maxUpgrades: 5, upgrades: 5 },
    { liquid: 3, maxLiquid: 10 },
    { level: 90, durability: 10, maxDurability: 1600, appearance: '01020304', maxUpgrades: 4, upgrades: 2, socket: 'c2b4bcda69' },
  ];

  const equipment = equipaveis.map((itemId, i) => ({
    slot: i, itemId, count: 1, flags: 0, ...variacoes[i % variacoes.length],
  }));
  const main = quaisquer.slice(0, 5).map((itemId, i) => ({
    slot: i, itemId, count: 1 + i * 7, flags: 0, ...variacoes[(i + 2) % variacoes.length],
  }));
  const extra = quaisquer.slice(5, 8).map((itemId, i) => ({
    slot: i, itemId, count: 99, flags: 0, ...variacoes[(i + 4) % variacoes.length],
  }));

  const mask = 0xff;
  const free = 1;

  return {
    level: 35,
    xp: 123456,
    skills: nos.map((id, i) => ({ id, level: i + 1 })),
    equipment,
    main,
    extra,
    _equipCount: equipment.length,
    _equipMask: mask,
    _equipFree: free,
    _raw: {
      head: Buffer.alloc(0x3a, 0xa7),
      mid: (() => { const b = Buffer.alloc(4); b.writeUInt32LE(mask, 0); return b; })(),
      between: Buffer.from([free & 0xff, free >> 8, 0x05, main.length, 0x04, extra.length]),
      tail: Buffer.alloc(16, 0x5c),
    },
  };
}

function casoSintetico() {
  const dentro = personagemSintetico();
  const original = buildCharacter(dentro);

  let lido;
  try {
    lido = parseCharacter(original, isItem, isSkill, ehEquipavel);
  } catch (e) {
    conferir(false, `sintético: o leitor recusou o bloco que o escritor gerou: ${e.message}`);
    return;
  }

  const refeito = buildCharacter(lido);
  conferir(Buffer.compare(refeito, original) === 0,
    `sintético: remontou idêntico (${original.length} bytes)`);

  conferir(lido.level === dentro.level && lido.xp === dentro.xp,
    `sintético: nível ${lido.level} e xp ${lido.xp}`);
  conferir(JSON.stringify(lido.skills) === JSON.stringify(dentro.skills),
    `sintético: ${lido.skills.length} nós de habilidade`);
  conferir(lido._equipMask === dentro._equipMask && lido._equipFree === dentro._equipFree,
    `sintético: máscara 0x${lido._equipMask.toString(16)} e ${lido._equipFree} espaços livres`);

  for (const [nome, esperado] of [['equipment', dentro.equipment], ['main', dentro.main], ['extra', dentro.extra]]) {
    const veio = lido[nome];
    if (veio.length !== esperado.length) {
      conferir(false, `sintético: ${nome} veio com ${veio.length} entradas, esperava ${esperado.length}`);
      continue;
    }
    const semFlags = (e) => { const { flags, ...r } = e; return JSON.stringify(Object.entries(r).sort()); };
    const difere = veio.findIndex((e, i) => semFlags(e) !== semFlags(esperado[i]));
    conferir(difere === -1, difere === -1
      ? `sintético: ${nome} com ${veio.length} entradas, todos os campos de volta`
      : `sintético: ${nome}[${difere}] voltou diferente: ${JSON.stringify(veio[difere])}`);
  }

  const tirandoUma = { ...lido, equipment: lido.equipment.slice(0, -1).map((e, i) => ({ ...e, slot: i })) };
  try {
    const menor = buildCharacter(tirandoUma);
    const relido = parseCharacter(menor, isItem, isSkill, ehEquipavel);
    conferir(relido.equipment.length === lido.equipment.length - 1
      && relido._equipFree === lido._equipFree + 1
      && relido._equipMask === (lido._equipMask & ~(1 << 5)) >>> 0,
      `sintético: ao tirar uma peça, ${relido.equipment.length} peças, ${relido._equipFree} livres, máscara 0x${relido._equipMask.toString(16)}`);
  } catch (e) {
    conferir(false, `sintético: tirar uma peça falhou: ${e.message}`);
  }
}

casoSintetico();

function* acha(alvo, profundidade = 0) {
  let st;
  try { st = fs.statSync(alvo); } catch { return; }
  if (st.isFile()) {
    yield alvo;
    return;
  }
  if (profundidade > 5) return;
  for (const e of fs.readdirSync(alvo, { withFileTypes: true })) {
    const p = path.join(alvo, e.name);
    if (e.isDirectory()) yield* acha(p, profundidade + 1);
    else if (e.name === 'A.bin') yield p;
  }
}

const arquivos = [...new Set(process.argv.slice(2).flatMap((a) => [...acha(a)]))];
if (arquivos.length === 0) {
  console.log('saves reais: nenhuma pasta informada; só o caso sintético rodou');
} else {
  let iguais = 0;
  let quebrados = 0;
  for (const f of arquivos) {
    const A = Buffer.from(fs.readFileSync(f));
    if (A.length < CAB || A.toString('latin1', 0, 4) !== 'S2BH') {
      console.log(`pula ${f}: nao e um bloco de personagem`);
      continue;
    }
    try {
      const c = parseCharacter(A.subarray(CAB), isItem, isSkill, ehEquipavel);
      const refeito = buildCharacter(c);
      if (Buffer.compare(refeito, A.subarray(CAB)) === 0) iguais += 1;
      else {
        quebrados += 1;
        console.log(`ERRO ${f}: remontou com ${refeito.length} bytes, original tem ${A.length - CAB}`);
      }
    } catch (e) {
      quebrados += 1;
      console.log(`ERRO ${f}: ${e.message}`);
    }
  }
  conferir(quebrados === 0, `saves reais: ${iguais} idênticos, ${quebrados} com problema`);
}

console.log(`ida e volta: ${ok} certos, ${ruim} errados`);
process.exit(ruim ? 1 : 0);
