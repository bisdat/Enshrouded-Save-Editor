// The guardian's console log, read from the server (guardiao-dados/guardiao.log). On hosts whose panel only
// shows the game's own log file (BisectHosting), this is the only place to see what the guardian says.
import React, { useEffect, useRef, useState } from 'react';
import { api } from './platform.js';
import { t } from './i18n.js';

const LINHAS = 300;

// severity of a line, from the guardian's own wording (English or Portuguese, plus the 1.0.0 log format)
function nivel(texto) {
  if (/\b(ERROR|ERRO)\b|is OFF|está DESLIGADO|could NOT|NÃO pegou|did NOT stick|guardião desligado|FALHA/i.test(texto)) return 'erro';
  if (/\b(WARNING|AVISO)\b|MODIFIED|MODIFICADO|não achei|Could not|Não consegui|new version|versão nova/i.test(texto)) return 'aviso';
  if (/joined|entrou|Saved the server copy|Cópia do servidor guardada/i.test(texto)) return 'jogador';
  return 'info';
}

// "2026-11-04T06:12:04Z rest" -> { quando, texto }
function separar(linha) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)\s+(.*)$/.exec(linha);
  return m ? { quando: m[1], texto: m[2] } : { quando: null, texto: linha };
}

const horaLocal = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function LogGuardiao() {
  const [texto, setTexto] = useState(null);
  const [erro, setErro] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [soAvisos, setSoAvisos] = useState(false);
  const caixa = useRef(null);

  const ler = () => {
    setLendo(true); setErro(null);
    api.serverGuardianLog?.()
      .then(setTexto)
      .catch((e) => setErro(String(e?.message ?? e)))
      .finally(() => setLendo(false));
  };
  useEffect(ler, []);

  const linhas = (texto ?? '').split('\n').filter((l) => l.trim()).slice(-LINHAS).map(separar)
    .map((l) => ({ ...l, nivel: nivel(l.texto) }))
    .filter((l) => !soAvisos || l.nivel === 'erro' || l.nivel === 'aviso');

  // keep the newest line in view after each read
  useEffect(() => { if (caixa.current) caixa.current.scrollTop = caixa.current.scrollHeight; }, [texto, soAvisos]);

  return (
    <section className="jb-log">
      <div className="jb-log-cab">
        <h2 className="t-label">{t('Log do guardião')}</h2>
        <span className="t-small">{t('O que o guardião escreve no console do servidor (guardiao.log). Útil quando o painel do host não mostra essas mensagens.')}</span>
        <div className="jb-log-acoes">
          <label className="jb-log-filtro t-small"><input type="checkbox" checked={soAvisos} onChange={(e) => setSoAvisos(e.target.checked)} />{t('Só avisos e erros')}</label>
          <button className="jb-link" onClick={ler} disabled={lendo}>{lendo ? t('Atualizando…') : t('Atualizar')}</button>
        </div>
      </div>
      {erro && <div className="t-small aviso">{t('Não consegui ler o log do guardião: {erro}', { erro })}</div>}
      <div className="jb-log-caixa" ref={caixa} role="log" aria-live="polite">
        {texto === null && !erro && <div className="t-small">{t('Lendo o log do guardião…')}</div>}
        {texto !== null && !linhas.length && <div className="t-small">{soAvisos ? t('Nenhum aviso ou erro nas últimas linhas.') : t('O log do guardião está vazio.')}</div>}
        {linhas.map((l, i) => (
          <div key={i} className={`jb-log-linha ${l.nivel}`}>
            <span className="jb-log-hora">{l.quando ? horaLocal(l.quando) : ''}</span>
            <span className="jb-log-txt">{l.texto}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
