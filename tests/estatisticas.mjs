import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function carregar(campo) {
  const fonte = fs.readFileSync(path.join(RAIZ, 'src', 'itemstats.js'), 'utf8')
    .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/i18n\.js';$/gm,
      `const campoDeNome = () => '${campo}';
const localeAtual = () => '${campo === 'pt' ? 'pt-BR' : 'en-US'}';`)
    .replace(/^import\s+(\w+)\s+from\s+'\.\.\/data\/([\w.-]+)\.json';$/gm,
      (_, nome, arq) => `const ${nome} = ${fs.readFileSync(path.join(RAIZ, 'data', `${arq}.json`), 'utf8')};`);
  const tmp = path.join(RAIZ, `.itemstats-${campo}-${process.pid}.mjs`);
  fs.writeFileSync(tmp, fonte);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.unlinkSync(tmp);
  }
}

const ANEL = 1234854024;

const ESPERADO = {
  en: {
    atributos: [
      ['+20', 'Health'],
      ['+4', 'Stamina Regeneration'],
      ['+5%', 'Damage against Fell'],
    ],
    melhorias: [
      [0, '+1', 'Backstab Mastery', 1311628529],
      [1, '+1', 'Thrust', 2506510512],
      [2, '+1', 'Dagger Mastery', 770186136],
      [3, '+3', 'Health Leech', null],
      [4, '+1', 'Fatal Precision', 3005573120],
    ],
  },
  pt: {
    atributos: [
      ['+20', 'Saúde'],
      ['+4', 'Regeneração de Vigor'],
      ['+5%', 'Dano contra Caído'],
    ],
    melhorias: [
      [0, '+1', 'Golpe nas Costas Magistral', 1311628529],
      [1, '+1', 'Ímpeto', 2506510512],
      [2, '+1', 'Domínio de Adagas', 770186136],
      [3, '+3', 'Roubo de vida', null],
      [4, '+1', 'Precisão Fatal', 3005573120],
    ],
  },
};

let ok = 0;
let ruim = 0;
const conferir = (certo, descricao) => {
  if (certo) ok += 1; else ruim += 1;
  console.log(`${certo ? 'ok  ' : 'ERRO'} ${descricao}`);
};

for (const campo of ['pt', 'en']) {
  const m = await carregar(campo);
  const esperado = ESPERADO[campo];

  const atributos = m.atributosDe(ANEL, 4);
  conferir(atributos.length === esperado.atributos.length,
    `${campo}: ${atributos.length} linhas de atributo`);
  esperado.atributos.forEach(([valor, nome], i) => {
    const veio = atributos[i] || {};
    conferir(veio.valor === valor && veio.nome === nome,
      `${campo}: atributo ${i} = ${veio.valor} ${veio.nome}`);
  });

  const melhorias = m.melhoriasDe(ANEL, 4, 5);
  conferir(melhorias.length === esperado.melhorias.length,
    `${campo}: ${melhorias.length} melhorias`);
  esperado.melhorias.forEach(([nivel, valor, nome, no], i) => {
    const veio = melhorias[i] || {};
    const l = (veio.linhas || [])[0] || {};
    conferir(veio.nivel === nivel && l.valor === valor && l.nome === nome && veio.no === no && veio.aplicada,
      `${campo}: nível ${veio.nivel} = ${l.valor} ${l.nome}${veio.no ? ` (nó ${veio.no})` : ''}`);
  });
}

const m = await carregar('en');
const parciais = m.melhoriasDe(ANEL, 2, 2);
conferir(parciais.filter((x) => x.aplicada).length === 2,
  `com 2 melhorias aplicadas, ${parciais.filter((x) => x.aplicada).length} marcadas`);

const BOTAS = 749923180;

{
  const mod = await carregar('pt');
  const arm = mod.armaduraDe(BOTAS, 255);
  conferir(arm?.fisica === 231 && arm?.magica === 231,
    `botas em 255: armadura ${arm?.fisica}/${arm?.magica} (o jogo mostra 231/231)`);
  conferir(mod.armaduraDe(BOTAS, 45)?.fisica === 42,
    `botas no nível nominal 45: ${mod.armaduraDe(BOTAS, 45)?.fisica}`);

  const esperado = [
    ['+21', 'Regeneração de Vigor'],
    ['-0,5s', 'Atraso na regeneração da resistência'],
    ['1:30 m', 'Redução de Duração de Molhado'],
    ['+2', 'Resistência a gelo'],
  ];
  const linhas = mod.atributosDe(BOTAS, 255);
  conferir(linhas.length === esperado.length,
    `botas: ${linhas.length} linhas de atributo (o jogo mostra ${esperado.length}; "Nível do Item" fica no cabeçalho)`);
  esperado.forEach(([valor, nome], i) => {
    conferir(linhas[i]?.valor === valor && linhas[i]?.nome === nome,
      `botas: ${linhas[i]?.valor} ${linhas[i]?.nome}`);
  });

  const esperadasM = [
    [251, '+114', 'Armadura Contra Corte'],
    [252, '+114', 'Armadura Contra Perfuração'],
    [253, '+1', 'Corrida'],
    [254, '+21', 'Regeneração de Vigor'],
    [255, '+1', 'Corrida'],
  ];
  const ms = mod.melhoriasDe(BOTAS, 255, 5);
  conferir(ms.length === 5, `botas: ${ms.length} melhorias`);
  esperadasM.forEach(([nivel, valor, nome], i) => {
    const m = ms[i] || {};
    const efeito = m.armadura ? { valor: `+${m.armadura.valor}`, nome: m.armadura.nome } : (m.linhas || [])[0] || {};
    conferir(m.nivel === nivel && efeito.valor === valor && efeito.nome === nome && m.ganho?.fisica === 1,
      `botas: nível ${m.nivel} | +${m.ganho?.fisica}/+${m.ganho?.magica} | ${efeito.valor} ${efeito.nome}`);
  });
}

const MACHADO = 246967425;
const ANEL_VIGOR = 4079983357;

for (const [campo, velocidade, decimal] of [
  ['pt', '0,8s', 'vírgula'],
  ['en', '0.8s', 'ponto'],
]) {
  const mod = await carregar(campo);
  const axe = mod.atributosDe(MACHADO, 11);
  const vel = axe.find((l) => /Velocidade|Attack Speed/.test(l.nome));
  conferir(vel?.valor === velocidade, `${campo}: velocidade de ataque = ${vel?.valor} (decimal com ${decimal})`);
  conferir(!axe.some((l) => /Nível do Item|Item Level/.test(l.nome)),
    `${campo}: "Nível do Item" não aparece na lista`);

  const anel = mod.atributosDe(ANEL_VIGOR, 255);
  const seco = anel.find((l) => /Molhado|Wet/.test(l.nome));
  conferir(seco?.valor === '1:00 m', `${campo}: 60000 ms viram ${seco?.valor}`);
  const vigor = anel.find((l) => /^Vigor$|^Stamina$/.test(l.nome));
  conferir(vigor?.valor === '+9', `${campo}: anel em 255 continua ${vigor?.valor} Vigor, como no jogo`);
}

{
  const mod = await carregar('pt');
  const CALCAS = 9501187;
  const porRaridade = (r, upgrades = 0) => mod.melhoriasDe(CALCAS, 56 + upgrades, upgrades).filter((x) => x.pos < r);

  for (const [raridade, quantas] of [[1, 1], [3, 3], [5, 5]]) {
    conferir(porRaridade(raridade).length === quantas,
      `raridade ${raridade}: ${porRaridade(raridade).length} melhorias`);
  }
  conferir(porRaridade(5).every((x, i) => x.pos === i), 'as posições seguem o vetor do jogo');

  const r3 = porRaridade(5, 3);
  conferir(r3.filter((x) => x.aplicada).length === 3 && r3.slice(0, 3).every((x) => x.aplicada),
    `com 3 melhorias, ${r3.filter((x) => x.aplicada).length} marcadas e as três primeiras`);
}

conferir(m.temEstatisticas(999999999) === false, 'id desconhecido não tem estatísticas');
conferir(m.atributosDe(999999999, 1).length === 0, 'id desconhecido não produz linhas');

const escaladas = Object.entries(JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'item-stats.json'), 'utf8')).itens)
  .filter(([, v]) => (v.a || []).some((l) => l.e));
conferir(escaladas.every(([id]) => m.atributosDe(Number(id), 40).some((l) => l.valor === null || !l.variaComNivel)),
  `${escaladas.length} itens com linha que escala, nenhum com número inventado`);

console.log(`estatísticas: ${ok} certos, ${ruim} errados`);
process.exit(ruim ? 1 : 0);
