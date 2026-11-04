// Safety layer:
// undo/redo history with readable labels, confirmation dialogs, the unsaved-changes guard.
import React, { useEffect, useRef, useState } from 'react';
import { itemName, skillName } from './gamedata.js';
import { GameButton } from './components.jsx';
import { t } from './i18n.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const LIMITE = 100;

// ---- what changed between two models, in words (feeds the history, the ledger and the dialogs)
function difItens(a = [], b = [], onde) {
  const k = (e) => `${e.slot}`;
  const A = new Map(a.map((e) => [k(e), e])), B = new Map(b.map((e) => [k(e), e]));
  const mud = [];
  for (const s of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(s), y = B.get(s);
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    mud.push({ x, y });
  }
  if (!mud.length) return null;
  const sai = mud.filter((m) => m.x && !m.y), entra = mud.filter((m) => !m.x && m.y), muda = mud.filter((m) => m.x && m.y);
  if (sai.length === 1 && entra.length === 1 && sai[0].x.itemId === entra[0].y.itemId) return { chave: `mov:${onde}`, texto: t('Movido: {item}', { item: itemName(sai[0].x.itemId) }) };
  if (mud.length === 1 && sai.length) return { chave: `rem:${onde}`, texto: t('Removido: {item}', { item: itemName(sai[0].x.itemId) }) };
  if (mud.length === 1 && entra.length) return { chave: `add:${onde}`, texto: t('Adicionado: {item}', { item: itemName(entra[0].y.itemId) }) };
  if (mud.length === 1 && muda.length) {
    const { x, y } = muda[0], n = itemName(y.itemId);
    if (x.itemId !== y.itemId) return { chave: `troca:${onde}:${y.slot}`, texto: t('Trocado: {a} → {b}', { a: itemName(x.itemId), b: n }) };
    if (x.level !== y.level) return { chave: `lv:${onde}:${y.slot}`, texto: t('{item}: nível {a} → {b}', { item: n, a: x.level, b: y.level }), de: x.level };
    if (x.count !== y.count) return { chave: `qt:${onde}:${y.slot}`, texto: t('{item}: quantidade {a} → {b}', { item: n, a: x.count, b: y.count }), de: x.count };
    if (x.durability !== y.durability) return { chave: `dur:${onde}:${y.slot}`, texto: t('{item}: durabilidade', { item: n }) };
    if (x.maxUpgrades !== y.maxUpgrades) return { chave: `rar:${onde}:${y.slot}`, texto: t('{item}: raridade', { item: n }) };
    return { chave: `ed:${onde}:${y.slot}`, texto: t('{item} alterado', { item: n }) };
  }
  return { chave: `var:${onde}`, texto: t('{n} espaços alterados', { n: mud.length }) };
}

export function descrever(a, b) {
  if (a.level !== b.level) return { aba: 'char', chave: 'level', texto: t('Nível {a} → {b}', { a: a.level, b: b.level }), de: a.level, para: b.level, fmt: 'Nível {a} → {b}' };
  if (a.xp !== b.xp) return { aba: 'char', chave: 'xp', texto: t('XP {a} → {b}', { a: a.xp, b: b.xp }), de: a.xp, para: b.xp, fmt: 'XP {a} → {b}' };
  const eq = difItens(a.equipment, b.equipment, 'eq'); if (eq) return { aba: 'char', ...eq };
  const mo = difItens([...a.main, ...a.extra.map((e) => ({ ...e, slot: `x${e.slot}` }))], [...b.main, ...b.extra.map((e) => ({ ...e, slot: `x${e.slot}` }))], 'inv'); if (mo) return { aba: 'inv', ...mo };
  if (JSON.stringify(a.skills) !== JSON.stringify(b.skills)) {
    const A = new Map(a.skills.map((s) => [s.id, s.level]));
    const mud = b.skills.filter((s) => (A.get(s.id) ?? 0) !== s.level);
    if (mud.length === 1) { const s = mud[0]; return { aba: 'skills', chave: `sk:${s.id}`, texto: t('{no}: {a} → {b}', { no: skillName(s.id), a: A.get(s.id) ?? 0, b: s.level }) }; }
    return { aba: 'skills', chave: 'sk', texto: t('Árvore de habilidades alterada') };
  }
  if (JSON.stringify(a.knowledge) !== JSON.stringify(b.knowledge)) {
    const n = (a.knowledge?.length ?? 0) - (b.knowledge?.length ?? 0);
    return { aba: 'know', chave: 'kn', texto: n > 0 ? t('Conhecimento: {n} entradas removidas', { n }) : t('Conhecimento alterado') };
  }
  return { aba: null, chave: 'outro', texto: t('Alteração') };
}

// ---- history: every setModel from the screens goes through here
export function useHistorico(model, setModelRaw) {
  const [passado, setPassado] = useState([]); // [{ antes, depois, rotulo }]
  const [futuro, setFuturo] = useState([]);
  const ultimo = useRef(0);
  const setModel = (next) => {
    if (!model || JSON.stringify(next) === JSON.stringify(model)) { setModelRaw(next); return; }
    const r = descrever(model, next), agora = Date.now();
    setPassado((p) => {
      const top = p[p.length - 1];
      // repeated stepper clicks on the same field become one entry ("Level 47 -> 50")
      if (top && top.rotulo.chave === r.chave && agora - ultimo.current < 1500) {
        const junta = descrever(top.antes, next);
        return [...p.slice(0, -1), { antes: top.antes, depois: clone(next), rotulo: { ...junta, quando: agora } }];
      }
      return [...p.slice(-(LIMITE - 1)), { antes: clone(model), depois: clone(next), rotulo: { ...r, quando: agora } }];
    });
    ultimo.current = agora;
    setFuturo([]);
    setModelRaw(next);
  };
  const desfazer = () => {
    const e = passado[passado.length - 1]; if (!e) return null;
    setPassado((p) => p.slice(0, -1)); setFuturo((f) => [...f, e]); setModelRaw(clone(e.antes)); ultimo.current = 0;
    return e.rotulo;
  };
  const refazer = () => {
    const e = futuro[futuro.length - 1]; if (!e) return null;
    setFuturo((f) => f.slice(0, -1)); setPassado((p) => [...p, e]); setModelRaw(clone(e.depois)); ultimo.current = 0;
    return e.rotulo;
  };
  // go back to just before entry i (it and everything after move to redo)
  const voltarPara = (i) => {
    const e = passado[i]; if (!e) return;
    setFuturo((f) => [...f, ...passado.slice(i).reverse()]); setPassado((p) => p.slice(0, i)); setModelRaw(clone(e.antes)); ultimo.current = 0;
  };
  const zerar = () => { setPassado([]); setFuturo([]); ultimo.current = 0; };
  return { setModel, desfazer, refazer, voltarPara, zerar, passado, futuro };
}

// ---- dialog built from the game's own pieces (GameButton textures, panel colours from quadro.css)
export function Dialogo({ d, fechar }) {
  const [ok, setOk] = useState(!d.confirmar);
  const caixa = useRef(null);
  useEffect(() => {
    caixa.current?.querySelector('.dlg-cancelar button')?.focus();
    const k = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="dlg-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className={`dlg tom-${d.tom || 'local'}`} role="dialog" aria-modal="true" aria-labelledby="dlg-titulo" ref={caixa}>
        {d.kicker && <div className="dlg-kicker">{d.kicker}</div>}
        <div className="dlg-titulo" id="dlg-titulo">{d.titulo}</div>
        {d.texto && <div className="dlg-texto">{d.texto}</div>}
        {d.linhas?.length > 0 && (
          <ul className="dlg-linhas">
            {d.linhas.slice(0, 8).map((l, i) => <li key={i}><span>{l[0]}</span><b>{l[1]}</b></li>)}
            {d.linhas.length > 8 && <li><span>…</span><b>{t('e mais {n}', { n: d.linhas.length - 8 })}</b></li>}
          </ul>
        )}
        {d.aviso && <div className="dlg-aviso"><b>!</b><span>{d.aviso}</span></div>}
        {d.confirmar && <label className="dlg-ack"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {d.confirmar}</label>}
        <div className="dlg-botoes">
          <span className="dlg-cancelar"><GameButton onClick={fechar}>{d.cancelar ?? t('Cancelar')}</GameButton></span>
          {d.alt && <GameButton onClick={() => { fechar(); d.onAlt(); }}>{d.alt}</GameButton>}
          {d.ok && <span className={`dlg-ok ${d.perigo ? 'perigo' : ''}`}><GameButton danger={d.perigo} disabled={!ok} onClick={() => { fechar(); d.onOk(); }}>{d.ok}</GameButton></span>}
        </div>
      </div>
    </div>
  );
}

export const ABAS = { char: 'Personagem', inv: 'Mochila', skills: 'Habilidades', know: 'Conhecimento', fog: 'Névoa', srv: 'Servidor' };
// the list of pending changes for dialogs and the ledger: [tab label, change]
export const linhasDe = (passado, fogDirty) => [
  ...passado.map((e) => [t(ABAS[e.rotulo.aba] || 'Outro'), e.rotulo.texto]),
  ...(fogDirty ? [[t('Névoa'), t('Névoa de guerra alterada')]] : []),
];
