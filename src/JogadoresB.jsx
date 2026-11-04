// The server players screen as a fluid page (real css px), built on the type system in tipografia.css.
// Same data and actions as Jogadores.jsx; only the presentation changes.
import React, { useEffect, useState } from 'react';
import { api } from './platform.js';
import { t, dataHora } from './i18n.js';
import LogGuardiao from './LogGuardiao.jsx';
import './jogadores-b.css';

const DECISAO = {
  primeira_entrada: { tom: 'novo', texto: 'Primeira entrada: personagem aceito e guardado' },
  igual: { tom: 'ok', texto: 'Entrou com o mesmo save' },
  substituido: { tom: 'trocado', texto: 'Trouxe um save de fora: trocado pela cópia do servidor' },
  divergente_observado: { tom: 'observado', texto: 'Trouxe um save de fora (só registrado, modo observar)' },
  substituicao_falhou: { tom: 'erro', texto: 'A troca falhou' },
  copia_desatualizada: { tom: 'novo', texto: 'Cópia antiga: personagem atual aceito' },
  versao_do_jogo_mudou: { tom: 'novo', texto: 'Jogo atualizado: personagem atual aceito' },
  sem_steamid: { tom: 'erro', texto: 'Entrada sem Steam ID' },
};
const RECUSA = new Set(['substituido', 'divergente_observado', 'substituicao_falhou']);

// 20 px line icons, stroked with the current text color
const I = {
  atualizar: <path d="M16.5 6.5A7 7 0 1 0 17 13M17 3v4h-4" />,
  nomes: <><circle cx="10" cy="7" r="3.2" /><path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /></>,
  config: <><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></>,
  escudo: <path d="M10 2.5 16 5v5c0 3.6-2.5 6.3-6 7.5-3.5-1.2-6-3.9-6-7.5V5z" />,
  olho: <><path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z" /><circle cx="10" cy="10" r="2.2" /></>,
  ok: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  novo: <path d="M10 3.5 11.9 8l4.6.4-3.5 3 1.1 4.6L10 13.6 5.9 16l1.1-4.6-3.5-3L8.1 8z" />,
  trocado: <path d="M4 7h10l-3-3M16 13H6l3 3" />,
  erro: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  seta: <path d="M7.5 4.5 13 10l-5.5 5.5" />,
};
const Icone = ({ n, className }) => (
  <svg className={`jb-ico ${className ?? ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);

// "há 5 min" / "hoje, 02:48" / "ontem, 21:50" / full date
function relativo(q) {
  const d = new Date(q), agora = new Date(), min = Math.round((agora - d) / 60000);
  if (min < 1) return t('agora');
  if (min < 60) return t('há {n} min', { n: min });
  const hm = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(d)) / 86400000);
  if (dias === 0) return t('hoje, {h}', { h: hm });
  if (dias === 1) return t('ontem, {h}', { h: hm });
  return dataHora(q);
}

// stable hue per Steam ID for the avatar
const matiz = (sid) => [...String(sid ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

// "Guardian v1.1.0 · running, seen 1 min ago" from the heartbeat the guardian writes every minute
function EstadoGuardiao({ vivo }) {
  if (!vivo?.visto) return <span className="jb-vivo t-small">{t('Sem sinal de vida do guardião (versão anterior à 1.1.0, ou ele ainda não rodou).')}</span>;
  const min = Math.max(0, Math.round((Date.now() / 1000 - vivo.visto) / 60));
  const ativo = min <= 3;
  return (
    <span className={`jb-vivo t-small ${ativo ? 'on' : ''}`}>
      {ativo
        ? t('Guardião v{v} · rodando, visto há {n} min', { v: vivo.versao ?? '?', n: min })
        : t('Guardião v{v} · sem sinal há {tempo}: o servidor está desligado ou o guardião não carregou', { v: vivo.versao ?? '?', tempo: min < 120 ? t('{n} min', { n: min }) : t('{n} h', { n: Math.round(min / 60) }) })}
    </span>
  );
}

export default function JogadoresB({ saves, atual, onOpen, onConfig, onRefresh }) {
  const [modo, setModo] = useState(null);
  const [registro, setRegistro] = useState(null);
  const [erro, setErro] = useState(null);
  const [nomes, setNomes] = useState({});
  const [estado, setEstado] = useState(null);
  const [recusas, setRecusas] = useState({});
  const [lendo, setLendo] = useState(false);
  const [vivo, setVivo] = useState(undefined); // guardian heartbeat (ativo.json), null if missing
  const [aba, setAba] = useState('jogadores'); // 'jogadores' | 'log'
  const jogadores = saves.filter((s) => s.servidor);
  const nomeDe = (s) => s.jogador ?? nomes[s.steamid] ?? null;

  const chaveDa = (l) => `${l.steamid}|${l.quando}`;
  const verMotivo = async (linha) => {
    const k = chaveDa(linha);
    setRecusas((r) => ({ ...r, [k]: 'lendo' }));
    try {
      const m = await api.serverRejection?.(linha.steamid, linha.quando);
      setRecusas((r) => ({ ...r, [k]: m ?? t('o guardião não guardou o save dessa entrada') }));
    } catch (e) {
      setRecusas((r) => ({ ...r, [k]: `${e?.message ?? e}` }));
    }
  };

  const carregar = () => {
    setLendo(true);
    Promise.resolve(onRefresh?.()).finally(() => { setEstado(api.serverState?.() ?? null); setLendo(false); });
    api.serverNames().then(setNomes).catch(() => {});
    api.serverMode().then(setModo).catch((e) => setErro(e.message));
    api.serverGuardianStatus?.().then(setVivo).catch(() => setVivo(null));
    api.serverLog().then((texto) => {
      const linhas = texto.trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      setRegistro(linhas.filter((l) => l.kind === 'entrada').slice(-12).reverse());
    }).catch(() => setRegistro([]));
  };
  useEffect(carregar, []);

  return (
    <section className="jb">
      <header className="jb-cab">
        <div className="jb-tit">
          <div className="t-label">{t('Servidor dedicado')}</div>
          <h1 className="t-display">{t('Jogadores no servidor')}</h1>
          <p className="t-body">{t('O guardião guarda o último save que o servidor mandou a cada jogador.')}</p>
          {vivo !== undefined && <EstadoGuardiao vivo={vivo} />}
        </div>
        <div className="jb-acoes">
          <button className="jb-btn" onClick={carregar} disabled={lendo}><Icone n="atualizar" className={lendo ? 'gira' : ''} />{lendo ? t('Atualizando…') : t('Atualizar')}</button>
          <button className="jb-btn" onClick={() => api.serverNames(true).then((n) => { setNomes(n); onRefresh(); }).catch((e) => setErro(e.message))}><Icone n="nomes" />{t('Reler nomes')}</button>
          <button className="jb-btn" onClick={onConfig}><Icone n="config" />{t('Configurar servidor')}</button>
        </div>
      </header>

      <div className="jb-abas" role="tablist">
        <button role="tab" aria-selected={aba === 'jogadores'} className={aba === 'jogadores' ? 'on' : ''} onClick={() => setAba('jogadores')}>{t('Jogadores')}</button>
        <button role="tab" aria-selected={aba === 'log'} className={aba === 'log' ? 'on' : ''} onClick={() => setAba('log')}>{t('Log do guardião')}</button>
      </div>

      {aba === 'log' && <LogGuardiao />}

      {aba === 'jogadores' && <>
      {modo && (
        <div className={`jb-modo ${modo}`}>
          <Icone n={modo === 'observar' ? 'olho' : 'escudo'} />
          <div>
            <div className="t-h2">{modo === 'observar' ? t('Modo observar') : t('Modo aplicar')}</div>
            <div className="t-small">{modo === 'observar'
              ? t('O guardião só registra quem trouxe um save de fora; ainda não troca nenhum personagem.')
              : t('Quem entrar com um personagem diferente da cópia do servidor recebe a cópia do servidor de volta.')}</div>
          </div>
        </div>
      )}
      {erro && <div className="jb-alerta erro t-small">{erro}</div>}

      <ol className="jb-passos">
        <li><b>1</b><span>{t('Abra a cópia do jogador e edite')}</span></li>
        <li><b>2</b><span>{t('Grave no servidor')}</span></li>
        <li><b>3</b><span>{t('Expulse o jogador: ele volta com a sua versão')}</span></li>
      </ol>

      <h2 className="t-label jb-secao">{t('Jogadores')} <span>{jogadores.length}</span></h2>
      {!jogadores.length && (
        <div className={`jb-vazio t-body ${estado?.erro ? 'erro' : ''}`}>
          {!estado?.configurado
            ? t('Servidor ainda não configurado: clique em "Configurar servidor", preencha endereço, usuário e senha e clique em Salvar.')
            : estado?.erro
              ? t('Não consegui falar com o servidor: {erro}', { erro: estado.erro })
              : t('Nenhum jogador com cópia guardada. Peça para cada um entrar uma vez: o guardião guarda a cópia no primeiro save.')}
        </div>
      )}
      <div className="jb-grade">
        {jogadores.map((s) => {
          const nome = nomeDe(s) ?? s.steamid ?? s.name;
          return (
            <button key={s.path} className={`jb-card ${atual === s.path ? 'on' : ''}`} onClick={() => onOpen(s.path)}>
              <span className="jb-avatar" style={{ '--h': matiz(s.steamid) }}>{String(nome).slice(0, 1).toUpperCase()}</span>
              <span className="jb-card-corpo">
                <span className="jb-card-topo">
                  <span className="t-h2">{nome}</span>
                  <span className={`jb-pill ${s.online ? 'on' : ''}`}>{s.online ? t('Na sessão') : t('Fora')}</span>
                </span>
                <span className="jb-meta">
                  <span><span className="t-label">{t('Nível')}</span><b>{s.level ?? '—'}</b></span>
                  <span><span className="t-label">{t('Último save')}</span><b title={s.modified ? dataHora(s.modified) : ''}>{s.modified ? relativo(s.modified) : '—'}</b></span>
                </span>
                {nomeDe(s) && <span className="t-mono">{s.steamid}</span>}
                {s.desatualizado && <span className="t-small aviso">{t('sem resposta do servidor: dados da última leitura')}</span>}
                {s.error && <span className="t-small aviso">{s.error}</span>}
              </span>
              <span className="jb-abrir t-small">{t('Abrir cópia')}<Icone n="seta" /></span>
            </button>
          );
        })}
      </div>

      {registro?.length > 0 && (
        <>
          <h2 className="t-label jb-secao">{t('Últimas entradas')}</h2>
          <ul className="jb-hist">
            {registro.map((l, i) => {
              const d = DECISAO[l.decisao] ?? { tom: 'ok', texto: l.decisao };
              const m = RECUSA.has(l.decisao) ? recusas[chaveDa(l)] : null;
              return (
                <li key={i} className={`jb-ev ${d.tom}`}>
                  <span className="jb-ev-ico"><Icone n={d.tom === 'observado' ? 'olho' : d.tom} /></span>
                  <span className="jb-ev-quando t-small" title={dataHora(l.quando)}>{relativo(l.quando)}</span>
                  <span className="jb-ev-quem t-h2">{nomes[l.steamid] ?? l.steamid ?? '—'}</span>
                  <span className="jb-ev-txt">{t(d.texto)}</span>
                  {RECUSA.has(l.decisao) && l.steamid && !m && <button className="jb-link" onClick={() => verMotivo(l)}>{t('Ver motivo')}</button>}
                  {m === 'lendo' && <span className="t-small">{t('lendo o save recusado…')}</span>}
                  {typeof m === 'string' && m !== 'lendo' && <span className="t-small aviso">{m} <button className="jb-link" onClick={() => verMotivo(l)}>{t('Tentar de novo')}</button></span>}
                  {m && typeof m === 'object' && (
                    <ul className="jb-motivo t-small">
                      {m.motivo.map((linha, j) => <li key={j} className={linha.aviso ? 'aviso' : undefined}>{linha.texto}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      </>}
    </section>
  );
}
