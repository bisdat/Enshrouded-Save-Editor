// New-version notice: one request to GitHub for the latest release of the editor, on start. Only reads;
// nothing is downloaded or sent. Shown as a card in the sidebar until dismissed (per version).
// ?update=1 in the address forces a fake newer version, to preview the card.
import React, { useEffect, useState } from 'react';
import { t } from './i18n.js';
import { api } from './platform.js';
import pkg from '../package.json';

const REPO = 'nicolasferreiraxn/Enshrouded-Save-Editor';
const PAGINA = `https://github.com/${REPO}/releases/latest`;
const CHAVE = 'enshrouded-save-editor:atualizacao-dispensada';

const numeros = (v) => v.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
function maisNova(tag, atual) {
  const [a, b] = [numeros(tag), numeros(atual)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

async function ultimaVersao() {
  if (new URLSearchParams(location.search).has('update')) return 'v1.1.0';
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    return r.ok ? (await r.json()).tag_name ?? null : null;
  } catch {
    return null;
  }
}

export default function Atualizacao() {
  const [tag, setTag] = useState(null);
  useEffect(() => {
    ultimaVersao().then((v) => {
      let dispensada = null;
      try { dispensada = localStorage.getItem(CHAVE); } catch { /* no storage */ }
      if (v && maisNova(v, pkg.version) && v !== dispensada) setTag(v);
    });
  }, []);
  if (!tag) return null;
  const dispensar = () => { try { localStorage.setItem(CHAVE, tag); } catch { /* no storage */ } setTag(null); };
  return (
    <div className="b-atual" role="status">
      <svg className="b-atual-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3v9M6 8.5 10 12.5 14 8.5M4 15.5h12" />
      </svg>
      <div className="b-atual-txt">
        <b>{t('Nova versão {v}', { v: tag })}</b>
        <span>{t('Você tem a v{v}.', { v: pkg.version })}</span>
      </div>
      <div className="b-atual-botoes">
        {/* the WebView can't open a browser by itself: Tauri asks Windows to open the releases page */}
        <button onClick={() => (api?.openReleases ? api.openReleases() : window.open(PAGINA, '_blank', 'noopener'))}>{t('Ver novidades')}</button>
        <button className="sec" onClick={dispensar}>{t('Dispensar')}</button>
      </div>
    </div>
  );
}
