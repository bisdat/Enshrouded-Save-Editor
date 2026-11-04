import React, { useEffect, useRef, useState } from 'react';
import { GameButton } from './components.jsx';
import { api } from './platform.js';
import { t, fmtPct } from './i18n.js';
import mundo from './assets/mundo.webp';

// Fog of war tab: paint what the character has explored on the world map.
// The brush (reveal/hide, size, stroke interpolation) is adapted from the Enshrouded Save Editor by
// "the Enshrouded Save Editor author", MIT License — see THIRD_PARTY.md.
const N = 1280; // grid cells per side; each cell is 8 m of the 10 240 m world
const VIEW = 1180; // on-stage size of the map, in stage pixels
const UNDO = 20;

const revealed = (g) => { let n = 0; for (let i = 0; i < g.length; i++) if (g[i] > 127) n++; return n / g.length; };
const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

// fog drawn over the map: unexplored cells dark, explored cells clear (values in between stay soft)
function draw(ctx, g, x0 = 0, y0 = 0, w = N, h = N) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[(y0 + y) * N + x0 + x], o = (y * w + x) * 4;
      img.data[o] = 12; img.data[o + 1] = 12; img.data[o + 2] = 24; img.data[o + 3] = (255 - v) * 0.86;
    }
  }
  ctx.putImageData(img, x0, y0);
}

export default function Nevoa({ model, onDirty }) {
  const canvas = useRef(null);
  const fog = useRef(null); // { grid, original }
  const stroke = useRef(null); // { last: {x, y} } while painting
  const [state, setState] = useState('loading'); // loading | ok | none
  const [brush, setBrush] = useState('reveal');
  const [size, setSize] = useState(48);
  const [pct, setPct] = useState({ now: 0, orig: 0 });
  const [undo, setUndo] = useState([]);
  const [cursor, setCursor] = useState(null); // { x, y } in grid cells
  const [changed, setChanged] = useState(false);

  const sync = () => {
    const f = fog.current;
    setPct({ now: revealed(f.grid), orig: revealed(f.original) });
    const changed = !same(f.grid, f.original);
    api.setFog(model.path, changed ? f.grid : null);
    setChanged(changed);
    onDirty(changed);
  };
  const redraw = () => draw(canvas.current.getContext('2d'), fog.current.grid);

  useEffect(() => {
    let alive = true;
    setState('loading');
    api.readFog(model.path).then((f) => {
      if (!alive) return;
      if (!f) { setState('none'); return; }
      fog.current = f; setState('ok'); setUndo([]);
    }).catch(() => alive && setState('none'));
    return () => { alive = false; };
  }, [model.path]);
  useEffect(() => { if (state === 'ok') { redraw(); sync(); } }, [state]);

  const cell = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * N, y: (e.clientY - r.top) / r.height * N };
  };
  const dab = (cx, cy, val) => {
    const g = fog.current.grid, rad = size / 2;
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(N - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(N - 1, Math.ceil(cy + rad));
    if (x1 < x0 || y1 < y0) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) g[y * N + x] = val;
    draw(canvas.current.getContext('2d'), g, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  };
  const paint = (p) => {
    const last = stroke.current.last ?? p, val = brush === 'reveal' ? 255 : 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, size / 4)));
    for (let i = 1; i <= steps; i++) dab(last.x + (p.x - last.x) * i / steps, last.y + (p.y - last.y) * i / steps, val);
    stroke.current.last = p;
  };
  const remember = () => setUndo((u) => [...u.slice(-(UNDO - 1)), fog.current.grid.slice()]);

  const down = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    remember();
    stroke.current = { last: null };
    paint(cell(e));
  };
  const move = (e) => { const p = cell(e); setCursor(p); if (stroke.current) paint(p); };
  const up = () => { if (!stroke.current) return; stroke.current = null; sync(); };

  const fill = (val) => { remember(); fog.current.grid.fill(val); redraw(); sync(); };
  const revert = () => { remember(); fog.current.grid.set(fog.current.original); redraw(); sync(); };
  const back = () => {
    if (!undo.length) return;
    fog.current.grid.set(undo[undo.length - 1]);
    setUndo((u) => u.slice(0, -1));
    redraw(); sync();
  };
  useEffect(() => {
    const k = (e) => {
      if (state !== 'ok' || e.target.tagName === 'INPUT') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); back(); }
      if (e.key === '[') setSize((s) => Math.max(6, s - 6));
      if (e.key === ']') setSize((s) => Math.min(200, s + 6));
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  if (model.servidor) {
    return (
      <div className="fog-locked">
        <div className="detail-title">{t('A névoa de guerra não pode ser editada pelo servidor')}</div>
        <p>{t('É uma limitação do jogo: a névoa fica só no save de cada jogador, no computador dele, e nunca é enviada ao servidor.')}</p>
        <p>{t('Para mudá-la, o jogador abre o próprio save local neste editor, com o jogo fechado.')}</p>
      </div>
    );
  }
  if (state === 'none') return <div className="center-msg">{t('Este save não tem a névoa de guerra num formato conhecido.')}</div>;

  const ring = cursor && size / N * VIEW;
  return (
    <div className="fog">
      <div className="fog-tools">
        <div className="caps small">{t('Pincel')}</div>
        <div className="fog-seg">
          <button className={brush === 'reveal' ? 'on' : ''} onClick={() => setBrush('reveal')}>{t('Revelar')}</button>
          <button className={brush === 'hide' ? 'on' : ''} onClick={() => setBrush('hide')}>{t('Esconder')}</button>
        </div>
        <label className="fog-size">
          <span className="caps small">{t('Tamanho')} <b>{size}</b></span>
          <input type="range" min="6" max="200" value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <span className="hint">{t('Teclas [ e ] mudam o tamanho; cada unidade são 8 m do mundo.')}</span>
        </label>
        <div className="fog-actions">
          <GameButton small onClick={() => fill(255)}>{t('Revelar tudo')}</GameButton>
          <GameButton small onClick={() => fill(0)}>{t('Esconder tudo')}</GameButton>
          <GameButton small onClick={back} disabled={!undo.length}>{t('Desfazer')} (Ctrl+Z)</GameButton>
          <GameButton small onClick={revert} disabled={!changed}>{t('Voltar ao salvo')}</GameButton>
        </div>
      </div>

      <div className="fog-map" style={{ width: VIEW, height: VIEW }} onPointerLeave={() => setCursor(null)}>
        <img src={mundo} alt="" draggable="false" />
        <canvas ref={canvas} width={N} height={N} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {cursor && <div className={`fog-ring ${brush}`} style={{ width: ring, height: ring, left: cursor.x / N * VIEW - ring / 2, top: cursor.y / N * VIEW - ring / 2 }} />}
        {state === 'loading' && <div className="center-msg">{t('Lendo a névoa de guerra…')}</div>}
      </div>

      <div className="fog-info">
        <div className="caps small">{t('Mapa revelado')}</div>
        <div className="fog-pct">{fmtPct(pct.now)}</div>
        <div className="hint">{t('No save: {pct}', { pct: fmtPct(pct.orig) })}</div>
        {cursor && <div className="hint">X {Math.round(cursor.x * 8)} · Z {Math.round(10240 - cursor.y * 8)}</div>}
        <p className="hint">{t('A névoa só muda o que o personagem já viu no mapa: não cria nem remove nada no mundo.')}</p>
        <p className="hint">{t('Grave com Ctrl+S, com o jogo fechado. O editor faz um backup do save antes.')}</p>
      </div>
    </div>
  );
}
