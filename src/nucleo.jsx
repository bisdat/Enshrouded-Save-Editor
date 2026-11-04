// Editor logic behind the app frame: open/save, server-copy polling, keyboard, plus the safety layer
// (history, confirmations, unsaved-changes guard). App.jsx only decides the layout.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { api } from './platform.js';
import { checkTree, pointsUsed } from './treecheck.js';
import { t, dataHora, hora } from './i18n.js';
import { useHistorico, Dialogo, linhasDe } from './seguranca.jsx';

export const W = 2560, H = 1440;
// keys 1-6 are real shortcuts now (audit A1); icons are the game's own crafting-category textures
export const TABS = [
  ['char', 'Personagem', '1', 'recipe_category_armor'], ['inv', 'Mochila', '2', 'recipe_category_supplies'],
  ['skills', 'Habilidades', '3', 'recipe_category_magical'], ['know', 'Conhecimento', '4', 'recipe_category_upgrade'],
  ['fog', 'Névoa', '5', 'recipe_category_survival'], ['srv', 'Servidor', '6', 'recipe_category_blocks'],
];
const clone = (o) => JSON.parse(JSON.stringify(o));
export const nAlt = (n) => (n === 1 ? t('1 alteração') : t('{n} alterações', { n }));

// Fit the 2560x1440 stage into a box. crop = stage rows hidden at the top/bottom, because the app frame
// draws its own header/footer outside the stage.
export function useStageFit(ref, crop = { top: 0, bottom: 0 }) {
  const [s, setS] = useState({ scale: 1, x: 0, y: 0 });
  useLayoutEffect(() => {
    const fit = () => {
      const r = ref ? ref.current?.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
      if (!r) return;
      const vis = H - crop.top - crop.bottom;
      const scale = Math.min(r.width / W, r.height / vis);
      setS({ scale, x: (r.width - W * scale) / 2, y: (r.height - vis * scale) / 2 - crop.top * scale });
    };
    fit(); addEventListener('resize', fit);
    const ro = ref?.current ? new ResizeObserver(fit) : null; if (ro) ro.observe(ref.current);
    return () => { removeEventListener('resize', fit); ro?.disconnect(); };
  }, []);
  return s;
}

export function useEditor() {
  const [saves, setSaves] = useState([]);
  const [model, setModelRaw] = useState(null);
  const [orig, setOrig] = useState(null);
  const [tab, setTab] = useState('inv');
  const [status, setStatusRaw] = useState(null);
  const [running, setRunning] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [showSaves, setShowSaves] = useState(false);
  const [showServidor, setShowServidor] = useState(false);
  const [fogDirty, setFogDirty] = useState(false);
  const [fogKey, setFogKey] = useState(0);
  const [dialogo, setDialogo] = useState(null);
  const hist = useHistorico(model, setModelRaw);
  // `text` may be a function: it is called at render time, so the message follows a language switch
  const setStatus = (s) => setStatusRaw(s && { ...s, quando: Date.now() });

  const refresh = () => api.listSaves().then((l) => { setSaves(l); return l; });
  const abrir = async (file) => {
    try {
      const m = await api.openSave(file);
      setModelRaw(m); setOrig(clone(m)); setShowSaves(false); setFogDirty(false); setFogKey((k) => k + 1); hist.zerar();
      setStatus(m.error ? { kind: 'warn', text: () => t('Somente leitura: {erro}', { erro: m.error }) }
        : { kind: 'ok', text: m.servidor ? () => t('Cópia do servidor aberta: {nome}', { nome: m.jogador ?? m.name }) : () => t('Save aberto: {nome}, nível {n}', { nome: m.name, n: m.level }) });
    } catch (e) { setStatus({ kind: 'error', text: e.message }); }
  };
  const dirty = !!(model && orig && (fogDirty || JSON.stringify(model) !== JSON.stringify(orig)));
  const mudancas = linhasDe(hist.passado, fogDirty);

  // guard: switching save never drops edits silently (audit E2)
  const open = (file) => {
    if (!dirty || file === model?.path) return abrir(file);
    setShowSaves(false);
    setDialogo({ tom: 'aviso', kicker: t('Alterações não gravadas'), titulo: t('Você tem {alt} não gravadas', { alt: nAlt(mudancas.length || 1) }),
      texto: t('Trocar de personagem descarta essas alterações. Grave antes, ou descarte e troque.'), linhas: mudancas,
      ok: t('Descartar e trocar'), perigo: true, onOk: () => abrir(file), alt: t('Gravar antes'), onAlt: () => save() });
  };
  useEffect(() => {
    // ?open=<path> opens a given save on start (as before); otherwise the most recent readable one
    const forced = new URLSearchParams(location.search).get('open');
    refresh().then((l) => { if (forced) return abrir(forced); const best = [...l].filter((s) => !s.error).sort((a, b) => b.modified - a.modified)[0]; if (best) abrir(best.path); });
    const timer = setInterval(() => api.gameRunning().then(setRunning), 3000);
    api.gameRunning().then(setRunning);
    return () => clearInterval(timer);
  }, []);

  // discard is a history step too, so it can be undone (audit E1)
  const descartar = () => {
    if (hist.passado.length) hist.voltarPara(0);
    if (model) api.setFog?.(model.path, null);
    setFogDirty(false); setFogKey((k) => k + 1);
    setStatus({ kind: 'ok', text: () => t('Alterações descartadas. Ctrl+Y refaz.') });
  };
  const travado = running && !model?.servidor;

  useEffect(() => {
    if (!model?.servidor) return;
    let carimbo = null, vivo = true;
    const olhar = async () => {
      const c = await api.serverStamp(model.path);
      if (!vivo || !c) return;
      if (carimbo === null) { carimbo = c; return; }
      if (c === carimbo) return;
      carimbo = c;
      if (dirty) setStatus({ kind: 'warn', text: () => t('A cópia no servidor mudou (o jogador continua jogando). Grave ou descarte: recarregar agora perderia sua edição.') });
      else abrir(model.path).then(() => setStatus({ kind: 'ok', text: ((h) => () => t('Cópia atualizada do servidor às {hora}', { hora: h }))(hora(Date.now())) }));
    };
    olhar();
    const timer = setInterval(olhar, 10000);
    return () => { vivo = false; clearInterval(timer); };
  }, [model?.path, model?.servidor, dirty]);

  const gravar = async () => {
    try {
      setStatus({ kind: 'busy', text: model.servidor ? () => t('Gravando no servidor…') : () => t('Gravando…') });
      const { backupDir, model: m } = await api.writeSave(model.path, model);
      setModelRaw(m); setOrig(clone(m)); setFogDirty(false); setFogKey((k) => k + 1); hist.zerar();
      setStatus({ kind: 'ok', text: model.servidor
        ? () => t('Gravado na cópia do servidor. Expulse o jogador: ele volta com esta versão. Backup em {pasta}', { pasta: backupDir })
        : () => t('Salvo. Backup em {pasta}', { pasta: backupDir }) });
      refresh();
    } catch (e) { setStatus({ kind: 'error', text: e.message }); }
  };
  const save = () => {
    if (!model || model.readOnly) return;
    if (!dirty) { setStatus({ kind: 'ok', text: () => t('Nada para gravar.') }); return; }
    if (travado) {
      setDialogo({ tom: 'aviso', kicker: t('Gravação bloqueada'), titulo: t('Feche o Enshrouded primeiro'),
        texto: t('O jogo regrava o save enquanto está aberto e apagaria a sua edição. Feche o jogo e grave de novo: as alterações continuam aqui.'), cancelar: t('Entendi') });
      return;
    }
    if (JSON.stringify(model.skills) !== JSON.stringify(orig.skills)) {
      const { problems, used, total } = checkTree(model);
      if (total === null && used > pointsUsed(orig.skills)) {
        problems.push(t('Você aumentou os pontos em uso ({antes} → {depois}). Informe o total de pontos na aba Habilidades para o editor conferir; acima do total, o jogo zera a árvore.', { antes: pointsUsed(orig.skills), depois: used }));
      }
      if (problems.length) {
        setDialogo({ tom: 'perigo', kicker: t('Não gravado'), titulo: t('A árvore de habilidades seria recusada pelo jogo'),
          texto: t('Com a árvore assim, o jogo devolve todos os pontos ao carregar.'), linhas: problems.map((p) => ['!', p]),
          ok: t('Ir para Habilidades'), onOk: () => setTab('skills') });
        return;
      }
    }
    if (model.servidor) {
      setDialogo({ tom: 'servidor', kicker: t('Cópia do servidor · personagem de outro jogador'),
        titulo: t('Gravar na cópia de {nome} no servidor?', { nome: model.jogador ?? model.name }),
        texto: t('O guardião aplica esta cópia na próxima entrada do jogador. A cópia atual do servidor é guardada antes.'),
        linhas: mudancas,
        aviso: model.online ? t('{nome} está na sessão. O servidor sobrescreve a cópia a cada ~30 s enquanto ele joga: expulse-o (ou peça para sair) antes de gravar.', { nome: model.jogador ?? model.name }) : null,
        confirmar: model.online ? t('O jogador está fora do servidor ou foi expulso.') : null,
        ok: t('Gravar no servidor'), onOk: gravar });
      return;
    }
    const arquivo = model.path.split(/[\\/]/).pop();
    setDialogo({ tom: 'local', kicker: t('Salvar no arquivo'), titulo: t('Gravar {alt} em {arquivo}?', { alt: nAlt(mudancas.length || 1), arquivo }),
      texto: t('Antes de gravar, o editor copia o save atual para a pasta de backups; dá para restaurar em Backups.'),
      linhas: mudancas, ok: t('Gravar'), onOk: gravar });
  };

  const undo = () => { const r = hist.desfazer(); if (r) setStatus({ kind: 'ok', text: () => t('Desfeito: {o}', { o: r.texto }) }); };
  const redo = () => { const r = hist.refazer(); if (r) setStatus({ kind: 'ok', text: () => t('Refeito: {o}', { o: r.texto }) }); };
  useEffect(() => {
    const k = (e) => {
      if (dialogo) return;
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      // the fog tab keeps its own stroke undo on Ctrl+Z
      if (e.ctrlKey && e.key.toLowerCase() === 'z' && tab !== 'fog') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const n = TABS.findIndex((x) => x[2] === e.key); if (n >= 0) setTab(TABS[n][0]);
      if ((e.key === 'b' || e.key === 'B') && model && !model.servidor) setShowBackups((v) => !v);
      if (e.key === 'q' || e.key === 'Q') setTab((a) => TABS[(TABS.findIndex((x) => x[0] === a) + TABS.length - 1) % TABS.length][0]);
      if (e.key === 'e' || e.key === 'E') setTab((a) => TABS[(TABS.findIndex((x) => x[0] === a) + 1) % TABS.length][0]);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const abasSujas = new Set([...hist.passado.map((e) => e.rotulo.aba), ...(fogDirty ? ['fog'] : [])]);
  const dialogoEl = dialogo && <Dialogo key={dialogo.titulo} d={dialogo} fechar={() => setDialogo(null)} />;
  return {
    saves, model, setModel: hist.setModel, orig, tab, setTab, status, setStatus, running, travado, dirty, mudancas, abasSujas,
    showBackups, setShowBackups, showSaves, setShowSaves, showServidor, setShowServidor,
    fogDirty, setFogDirty, fogKey, refresh, open, abrir, save, descartar, undo, redo, hist, dialogoEl,
  };
}

export const quando = (s) => (s?.quando ? hora(s.quando) : '');
export { dataHora };
