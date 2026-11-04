// The Character screen as a fluid page (real css px), built on the type system in tipografia.css.
// Same data and behaviour as Character.jsx (level/xp, attributes, the 16 equipment slots, the item panel);
// only the layout changes. Game art stays: slot textures, item icons, level badge, ornament and medallion.
import React, { useState } from 'react';
import { items, itemName, ATRIBUTOS, atributosDaArvore } from './gamedata.js';
import { tex, ttex } from './ui.js';
import ItemEditor, { FancyPanel } from './ItemEditor.jsx';
import { SlotView, Stepper } from './components.jsx';
import { EQUIP_SLOTS } from './Character.jsx';
import { t } from './i18n.js';
import './personagem-b.css';

// EQUIP_SLOTS index = bit in the save's mask: 0-4 vanity, 5-9 armour, 10-15 accessories (see Character.jsx)
const PARTES = [['Cabeça', 5, 0], ['Tronco', 6, 1], ['Braços', 7, 2], ['Pernas', 8, 3], ['Pés', 9, 4]];
const ACESSORIOS = [10, 11, 12, 13, 14, 15];
const ORDEM = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4];
const BASE_ATRIBUTO = 10; // measured against the game, see Character.jsx

export default function PersonagemB({ model, setModel }) {
  // the save's list is dense: piece k sits in the k-th lit bit of the mask
  const acesos = [];
  for (let i = 0; i < 32; i++) if (model.equipMask & (1 << i)) acesos.push(i);
  const bySlot = new Map(model.equipment.map((e) => [acesos[e.slot] ?? e.slot, e]));
  const [sel, setSel] = useState(() => ORDEM.find((i) => bySlot.has(i)) ?? 5);
  const [aviso, setAviso] = useState(null);
  const entry = bySlot.get(sel);

  const update = (e) => setModel({ ...model, equipment: model.equipment.map((x) => (x.slot === e.slot ? e : x)) });
  const remove = (e) => {
    // taking off the worn backpack deletes its container and everything in it
    if (items[e.itemId]?.slot === 'Backpack' && model.extra.length) {
      setAviso(t('Não vou tirar a {item}: isso apagaria o contêiner dela e os {n} espaços guardados. Esvazie-o no jogo primeiro.', { item: itemName(e.itemId), n: model.extra.length }));
      return;
    }
    setAviso(null);
    setModel({ ...model, equipment: model.equipment.filter((x) => x.slot !== e.slot) });
  };

  const { daArvore, porChama } = atributosDaArvore(model.skills);
  const dependeDaChama = Object.values(porChama).some((n) => n > 0);

  const Slot = ({ i }) => {
    const e = bySlot.get(i);
    const nome = t(EQUIP_SLOTS[i].name);
    return (
      <button className={`pb-slot ${sel === i ? 'on' : ''}`} onClick={() => { setSel(i); setAviso(null); }}
        aria-pressed={sel === i} aria-label={e ? `${nome}: ${itemName(e.itemId)}` : t('{espaco} vazio', { espaco: nome })} title={e ? itemName(e.itemId) : nome}>
        <SlotView entry={e} empty={EQUIP_SLOTS[i].tex} selected={sel === i} />
      </button>
    );
  };

  return (
    <div className="pb">
      <div className="pb-grade">
        {/* portrait, level, xp, attributes */}
        <section className="pb-heroi" aria-label={t('Personagem')}>
          <div className="pb-medalhao" aria-hidden="true">
            <img className="pb-ornamento" src={tex('levelup_ornament')} alt="" />
            <img className="pb-medalha" src={tex('attribute_tabIllustration_basics')} alt="" />
            <span className="pb-badge"><img src={ttex('level_badge_gold')} alt="" /><b className="t-num">{model.level}</b></span>
          </div>
          <div className="pb-heroi-dados">
            <h1 className="t-display pb-nome">{model.name}</h1>
            <div className="pb-campos">
              {/* groups, not labels: a label forwards clicks on its text to the first button inside (the minus) */}
              <div className="pb-campo" role="group" aria-label={t('Nível')}>
                <span className="t-label">{t('Nível')}</span>
                <Stepper value={model.level} min={1} max={50} onChange={(v) => setModel({ ...model, level: v })} />
              </div>
              <div className="pb-campo" role="group" aria-label={t('XP no nível')}>
                <span className="t-label">{t('XP no nível')}</span>
                <Stepper value={model.xp} min={0} max={1e9} steps={[100, 1000]} onChange={(v) => setModel({ ...model, xp: v })} />
              </div>
            </div>
            <dl className="pb-attrs">
              {ATRIBUTOS.map((a) => (
                <div key={a}><dt className="t-label">{t(a)}</dt><dd className="t-h1 t-num">{BASE_ATRIBUTO + daArvore[a]}</dd></div>
              ))}
            </dl>
            <p className="t-small pb-nota">{t('Atributos calculados pelos nós da árvore (editáveis na aba Habilidades).')}</p>
            {dependeDaChama && <p className="t-small pb-nota aviso">{t('O jogo soma ainda os nós que dependem do nível da Chama e os bônus do equipamento; nenhum dos dois está no save do personagem.')}</p>}
          </div>
        </section>

        {/* equipment: armour and vanity side by side per body part, then accessories */}
        <section className="pb-equip" aria-label={t('Equipamento')}>
          <h2 className="t-h2">{t('Equipamento')}</h2>
          <div className="pb-tabela" role="table" aria-label={t('Armadura e visual')}>
            <div className="pb-linha pb-cab" role="row">
              <span role="columnheader" />
              <span role="columnheader" className="t-label">{t('Armadura')}</span>
              <span role="columnheader" className="t-label">{t('Visual')}</span>
            </div>
            {PARTES.map(([parte, arm, vis]) => (
              <div key={parte} className="pb-linha" role="row">
                <span role="rowheader" className="pb-parte">
                  <span className="t-body pb-parte-nome">{t(parte)}</span>
                  <span className="t-small pb-parte-item">{bySlot.has(arm) ? itemName(bySlot.get(arm).itemId) : t('vazio')}</span>
                </span>
                <span role="cell"><Slot i={arm} /></span>
                <span role="cell"><Slot i={vis} /></span>
              </div>
            ))}
          </div>
          <h3 className="t-label pb-sub">{t('Acessórios')}</h3>
          <div className="pb-acess">
            {ACESSORIOS.map((i) => (
              <div key={i} className="pb-cel"><Slot i={i} /><span className="t-label">{t(EQUIP_SLOTS[i].name)}</span></div>
            ))}
          </div>
        </section>

        {/* the selected piece, in the game's panel (vector frame) */}
        <section className="pb-detalhe" aria-label={t('Peça selecionada')}>
          <FancyPanel>
            <div className="t-label pb-onde">{t(EQUIP_SLOTS[sel].name)}</div>
            {aviso && <div className="pb-aviso t-small">{aviso}</div>}
            {entry ? (
              <ItemEditor entry={entry} onChange={update} onRemove={() => remove(entry)} />
            ) : (
              <div className="pb-vazio">
                <img src={tex(EQUIP_SLOTS[sel].tex)} alt="" />
                <p className="t-body">{t('Espaço vazio. Vista a peça no jogo; aqui dá para editar ou tirar as peças vestidas.')}</p>
              </div>
            )}
          </FancyPanel>
        </section>
      </div>
    </div>
  );
}
