// A chave de tradução é o próprio texto em português: o que não for traduzido aparece em
// português em vez de virar "menu.botao.salvar" na tela. O preço é que mudar o texto quebra a
// chave. Como contribuir com um idioma está no README.

import en from './i18n/en.json';
import es from './i18n/es.json';
import de from './i18n/de.json';
import zhCN from './i18n/zh-CN.json';

// Same languages, order and names as the Interactive Map.
export const IDIOMAS = [
  { codigo: 'pt-BR', nome: 'Português', locale: 'pt-BR', dicionario: null },
  { codigo: 'en', nome: 'English', locale: 'en-US', dicionario: en },
  { codigo: 'es', nome: 'Español', locale: 'es-ES', dicionario: es },
  { codigo: 'de', nome: 'Deutsch', locale: 'de-DE', dicionario: de },
  { codigo: 'zh-CN', nome: '简体中文', locale: 'zh-CN', dicionario: zhCN },
];

const CHAVE_GUARDADA = 'enshrouded-save-editor:idioma';

function inicial() {
  try {
    const salvo = localStorage.getItem(CHAVE_GUARDADA);
    if (salvo && IDIOMAS.some((i) => i.codigo === salvo)) return salvo;
  } catch { /* navegador sem armazenamento: segue no padrão */ }
  // no saved choice: match the system language by its prefix (pt-PT -> pt-BR, zh-TW -> zh-CN, de-AT -> de);
  // a language we don't have falls back to English
  const sistema = ((typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '').toLowerCase();
  const prefixo = sistema.split('-')[0];
  return IDIOMAS.find((i) => i.codigo.toLowerCase().split('-')[0] === prefixo)?.codigo ?? 'en';
}

let atual = inicial();
const ouvintes = new Set();

export const idiomaAtual = () => atual;
export const localeAtual = () => IDIOMAS.find((i) => i.codigo === atual)?.locale ?? 'pt-BR';
// 0.2573 -> "25,7%" / "25.7%"
export const fmtPct = (v) => `${(v * 100).toLocaleString(localeAtual(), { maximumFractionDigits: 1 })}%`;

// Item and skill names are not translated here: they come from the game's own localization, stored per entry in
// data/items.json and data/skills.json (`pt`, `en`, and `es`, `de`, `zh` from tools/nomes-oficiais.mjs).
// This says which field to read; gamedata.js falls back to `en`, then `pt`.
const CAMPO_NOME = { 'pt-BR': 'pt', en: 'en', es: 'es', de: 'de', 'zh-CN': 'zh' };
export const campoDeNome = () => CAMPO_NOME[atual] ?? 'en';

// o `lang` do documento guia leitor de tela, hifenização e correção ortográfica dos campos
function marcarNoDocumento() {
  if (typeof document !== 'undefined') document.documentElement.lang = localeAtual();
}
marcarNoDocumento();

export function definirIdioma(codigo) {
  if (!IDIOMAS.some((i) => i.codigo === codigo) || codigo === atual) return;
  atual = codigo;
  try { localStorage.setItem(CHAVE_GUARDADA, codigo); } catch { /* sem armazenamento: vale só nesta sessão */ }
  marcarNoDocumento();
  for (const f of ouvintes) f(codigo);
}

export function assinarIdioma(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** t('nível {n}', { n: 5 }). Missing in the chosen language: English, then the Portuguese key itself. */
export function t(texto, vars) {
  const dic = IDIOMAS.find((i) => i.codigo === atual)?.dicionario;
  let s = (dic && dic[texto]) || (dic && en[texto]) || texto;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export const dataHora = (ms) => new Date(ms).toLocaleString(localeAtual());
export const hora = (ms) => new Date(ms).toLocaleTimeString(localeAtual());
