// The screens: most render inside the scaled 2560x1440 stage; the ones in FLUIDAS render at real css px.
import React from 'react';
import Backpack from './Backpack.jsx';
import SkillTree from './SkillTree.jsx';
import Character from './Character.jsx';
import Servidor from './Servidor.jsx';
import Jogadores from './Jogadores.jsx';
import Conhecimento from './Conhecimento.jsx';
import Nevoa from './Nevoa.jsx';
import Backups from './Backups.jsx';
import JogadoresB from './JogadoresB.jsx';
import PersonagemB from './PersonagemB.jsx';
import { t } from './i18n.js';

// Screens rendered at real css px (fluid, responsive) instead of inside the scaled 2560x1440 stage.
export const FLUIDAS = new Set(['srv', 'char']);

// fluid screens, drawn in the work area
export function TelasFluidas({ ed }) {
  const { model, tab, setTab, saves } = ed;
  return (
    <div className="b-fluida">
      {tab === 'char' && model && !model.readOnly && <PersonagemB model={model} setModel={ed.setModel} />}
      {tab === 'char' && model?.readOnly && <div className="center-msg">{t('Este save não pôde ser interpretado para edição.')}</div>}
      {tab === 'srv' && <JogadoresB saves={saves} atual={model?.path} onRefresh={ed.refresh} onOpen={(p) => { ed.open(p); setTab('inv'); }} onConfig={() => ed.setShowServidor(true)} />}
    </div>
  );
}

export default function Telas({ ed, stageInfo }) {
  const { model, tab, setTab, saves } = ed;
  const ok = model && !model.readOnly;
  return (
    <>
      {FLUIDAS.has(tab) ? null : <>
      {ok && tab === 'inv' && <Backpack model={model} setModel={ed.setModel} />}
      {ok && tab === 'skills' && <SkillTree model={model} setModel={ed.setModel} stage={stageInfo} />}
      {ok && tab === 'char' && <Character model={model} setModel={ed.setModel} />}
      {ok && tab === 'know' && <Conhecimento model={model} setModel={ed.setModel} />}
      {ok && tab === 'fog' && <Nevoa key={ed.fogKey} model={model} onDirty={ed.setFogDirty} />}
      {tab === 'srv' && <Jogadores saves={saves} atual={model?.path} onRefresh={ed.refresh} onOpen={(p) => { ed.open(p); setTab('inv'); }} onConfig={() => ed.setShowServidor(true)} />}
      {model?.readOnly && tab !== 'srv' && <div className="center-msg">{t('Este save não pôde ser interpretado para edição.')}</div>}
      </>}
      {ed.showBackups && model && !model.servidor && <Backups model={model} onClose={() => ed.setShowBackups(false)} onRestored={() => ed.abrir(model.path)} />}
      {ed.showServidor && <Servidor onClose={() => ed.setShowServidor(false)} onChanged={ed.refresh} />}
    </>
  );
}
