// App frame ("Oficina" layout, 1.1.0): a calm desktop-tool frame around the game screens. Navigation, toolbar and status
// live outside the stage at real pixel size (always legible at any window size); the stage keeps the game's
// own screens, textures, icons and fonts, fitted into the remaining area.
import React, { useRef, useState } from 'react';
import Telas, { TelasFluidas, FLUIDAS } from './telas.jsx';
import Atualizacao from './Atualizacao.jsx';
import { ttex } from './ui.js';
import { api } from './platform.js';
import { t, IDIOMAS, idiomaAtual, definirIdioma, assinarIdioma } from './i18n.js';
import { useEditor, useStageFit, TABS, W, H, quando, nAlt } from './nucleo.jsx';
import './quadro.css';
import './tipografia.css';

export default function App() {
  const ed = useEditor();
  const area = useRef(null);
  const stage = useStageFit(area, { top: 100, bottom: 96 });
  const [lista, setLista] = useState(false);
  const [, redesenhar] = useState(0);
  React.useEffect(() => assinarIdioma(() => redesenhar((n) => n + 1)), []);
  const { model, tab, setTab, saves, status } = ed;
  const servidor = !!model?.servidor;
  const rotulo = Object.fromEntries(TABS.map(([k, r]) => [k, r]));

  return (
    <div className={`viewport b-raiz ${servidor ? 'modo-servidor' : ''}`}>
      <aside className="b-lado">
        <div className="b-marca"><img src={ttex('level_badge_gold')} alt="" />{t('Editor de save')}</div>
        <button className="b-perso" onClick={() => ed.setShowSaves((v) => !v)} aria-haspopup="true" aria-expanded={ed.showSaves}>
          <span className="b-badge"><img src={ttex('level_badge_gold')} alt="" /><b>{model?.level ?? '—'}</b></span>
          <span className="b-perso-txt">
            <b>{model ? (model.jogador ?? model.name) : '—'}</b>
            <span className={`b-fonte ${servidor ? 'srv' : ''} ${servidor && model.online ? 'online' : ''}`} title={servidor ? (model.online ? t('Cópia do servidor · jogador na sessão') : t('Cópia do servidor · jogador fora')) : undefined}>{servidor ? t('Servidor') : t('Save local')}</span>
          </span>
          <span className="b-chev">▾</span>
        </button>
        {ed.showSaves && (
          <div className="b-menu">
            <div className="b-grupo">{t('Saves locais')}</div>
            {saves.filter((s) => !s.servidor).map((s) => (
              <button key={s.path} className={model?.path === s.path ? 'on' : ''} onClick={() => ed.open(s.path)}><b>{s.name}</b><small>{s.file} · {t('nível {n}', { n: s.level })}</small></button>
            ))}
            <div className="b-grupo">{t('Cópias no servidor')}</div>
            {saves.filter((s) => s.servidor).map((s) => (
              <button key={s.path} className={model?.path === s.path ? 'on' : ''} onClick={() => ed.open(s.path)}><b>{s.jogador ?? s.name}{s.online ? ` · ${t('na sessão')}` : ''}</b><small>{s.steamid} · {t('nível {n}', { n: s.level })}</small></button>
            ))}
            <button onClick={async () => { const f = await api.browseSave(); if (f) ed.open(f); }}><b>{t('Abrir arquivo…')}</b></button>
          </div>
        )}
        <nav className="b-nav" aria-label={t('Seções')}>
          {TABS.map(([k, r, key, ico]) => (
            <React.Fragment key={k}>
              {k === 'srv' && <div className="b-sep">{t('Servidor dedicado')}</div>}
              <button className={`${tab === k ? 'on' : ''} ${k === 'fog' && servidor ? 'bloq' : ''}`} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
                <img src={ttex(`${ico}_${tab === k ? 'gold' : 'light'}`)} alt="" />
                <span>{t(r)}</span>
                {ed.abasSujas.has(k) && <i className="b-sujo" title={t('Alterações não gravadas')} />}
                {k === 'fog' && servidor && <small>{t('só local')}</small>}
                <kbd>{key}</kbd>
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="b-rodape">
          <Atualizacao />
          <span className={`b-estado ${(servidor ? model.online : ed.running) ? 'on' : ''}`}>
            {servidor ? (model.online ? t('Jogador na sessão') : t('Jogador fora')) : (ed.running ? t('Jogo aberto: feche para salvar') : t('Jogo fechado'))}
          </span>
          <select value={idiomaAtual()} onChange={(e) => definirIdioma(e.target.value)} aria-label={t('Idioma')}>
            {IDIOMAS.map((i) => <option key={i.codigo} value={i.codigo}>{i.nome}</option>)}
          </select>
        </div>
      </aside>

      <header className="b-barra">
        <div className="b-trilha"><span>{model ? (model.jogador ?? model.name) : ''}</span> / <b>{t(rotulo[tab])}</b></div>
        {servidor && <span className="b-aviso-srv">{t('Editando a cópia de outro jogador no servidor')}</span>}
        <div className="b-acoes">
          <button className="b-ico" onClick={ed.undo} disabled={!ed.hist.passado.length} title={t('Desfazer (Ctrl+Z)')} aria-label={t('Desfazer')}>↶</button>
          <button className="b-ico" onClick={ed.redo} disabled={!ed.hist.futuro.length} title={t('Refazer (Ctrl+Y)')} aria-label={t('Refazer')}>↷</button>
          <button className={`b-conta ${ed.dirty ? 'sujo' : ''}`} onClick={() => setLista((v) => !v)} aria-expanded={lista}>{ed.dirty ? nAlt(ed.mudancas.length || 1) : t('Nada a gravar')}</button>
          {!servidor && <button className="b-btn" onClick={() => ed.setShowBackups(true)}>{t('Backups')}</button>}
          <button className={`b-btn b-salvar ${ed.dirty && !ed.travado ? '' : 'off'}`} onClick={ed.save}>{servidor ? t('Gravar no servidor…') : t('Salvar')}<kbd>Ctrl+S</kbd></button>
        </div>
        {lista && (
          <div className="b-lista">
            {!ed.mudancas.length && <div className="b-vazio">{t('Nenhuma alteração pendente.')}</div>}
            {ed.hist.passado.map((e, i) => (
              <div key={i} className="b-linha"><span>{t(rotulo[e.rotulo.aba] || 'Outro')}</span><b>{e.rotulo.texto}</b><button onClick={() => ed.hist.voltarPara(i)}>{t('Desfazer até aqui')}</button></div>
            ))}
            {ed.fogDirty && <div className="b-linha"><span>{t('Névoa')}</span><b>{t('Névoa de guerra alterada')}</b><span /></div>}
          </div>
        )}
      </header>

      <main className={`b-area ${FLUIDAS.has(tab) ? 'fluida' : ''}`} ref={area}>
        {FLUIDAS.has(tab) && <TelasFluidas ed={ed} />}
        <div className="stage" style={{ width: W, height: H, transform: `translate(${stage.x}px, ${stage.y}px) scale(${stage.scale})` }}>
          <div className="world-bg" />
          <Telas ed={ed} stageInfo={{ w: W, h: H, scale: stage.scale }} />
        </div>
      </main>

      <footer className={`b-status ${status?.kind ?? ''}`} role="status">
        {status && <><span className="b-st-ico">{status.kind === 'error' || status.kind === 'warn' ? '!' : status.kind === 'busy' ? '…' : '✓'}</span><span className="b-st-txt">{typeof status.text === 'function' ? status.text() : status.text}</span><span className="b-st-hora">{quando(status)}</span></>}
      </footer>
      {ed.dialogoEl}
    </div>
  );
}
