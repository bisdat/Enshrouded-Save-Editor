// The Backups window (moved out of App.jsx unchanged).
import React, { useEffect, useState } from 'react';
import { api } from './platform.js';
import { GameButton } from './components.jsx';
import { t, dataHora } from './i18n.js';

const KIND_PT = { jogo: 'Automático do jogo', pasta: 'Pasta de backups' };

export default function Backups({ model, onClose, onRestored }) {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const base = model.path.split(/[\\/]/).pop();
  useEffect(() => { api.listBackups(model.path).then(setList).catch((e) => { setList([]); setMsg({ kind: 'error', text: e.message }); }); }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const restore = async (b) => {
    try {
      await api.restoreBackup(b.path, model.path);
      setMsg({ kind: 'ok', text: t('Restaurado: {arquivo} ({quando}). O save anterior foi guardado como backup.', { arquivo: b.label, quando: dataHora(b.modified) }) });
      setConfirm(null); onRestored();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); setConfirm(null); }
  };
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="detail-title">{t('Backups de {nome}', { nome: model.name })} <span className="detail-sub">({base})</span></div>
        <div className="hint">{t('O jogo guarda os 10 últimos salvamentos automaticamente; o editor também copia o save antes de cada gravação.')}</div>
        {msg && <div className={`hint ${msg.kind}`}>{msg.text}</div>}
        <div className="backup-list">
          {list === null && <div className="hint">{t('Procurando backups…')}</div>}
          {list?.length === 0 && <div className="hint">{t('Nenhum backup encontrado para este save.')}</div>}
          {list?.map((b) => (
            <div key={b.path} className="backup-row">
              <span className={`bk-kind ${b.kind}`}>{t(KIND_PT[b.kind] || b.kind)}</span>
              <span className="bk-date">{dataHora(b.modified)}</span>
              <span className="bk-label" title={b.path}>{b.label}</span>
              {confirm === b.path ? (
                <span className="row-gap">
                  <GameButton small danger onClick={() => restore(b)}>{t('Confirmar')}</GameButton>
                  <GameButton small onClick={() => setConfirm(null)}>{t('Cancelar')}</GameButton>
                </span>
              ) : (
                <GameButton small onClick={() => setConfirm(b.path)} disabled={!!confirm}>{t('Restaurar')}</GameButton>
              )}
            </div>
          ))}
        </div>
        <div className="row-gap">
          <GameButton onClick={() => api.openBackups()}>{t('Abrir pasta')}</GameButton>
          <GameButton onClick={onClose}>{t('Fechar')}</GameButton>
        </div>
      </div>
    </div>
  );
}
