// Vector version of the game's "fancy box" panel (blue fill, ring pattern, double gold frame, corner rings).
// Drawn in SVG at the panel's real size, so it stays sharp at any window size or stage scale — no raster
// textures. The ids are made unique per instance because several panels can be on screen at once.
import React, { useId, useLayoutEffect, useRef, useState } from 'react';

function Canto({ x, y, sx, sy }) {
  // ring ornament plus two short arms along the frame, mirrored per corner
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`}>
      <circle r="22" fill="none" strokeWidth="3" />
      <circle r="11" fill="none" strokeWidth="1.6" />
      <circle r="3.2" stroke="none" fill="currentColor" />
      <path d="M22 0 H64 M0 22 V64" strokeWidth="2.2" fill="none" />
      <path d="M30 9 H54 M9 30 V54" strokeWidth="1" fill="none" opacity=".7" />
    </g>
  );
}

export default function MolduraSVG({ className = '', style, children, tom = 'ouro' }) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const id = useId().replace(/:/g, '');
  useLayoutEffect(() => {
    const el = ref.current;
    const medir = () => setTam({ w: el.offsetWidth, h: el.offsetHeight }); // offset* ignores the stage transform
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w, h } = tam;
  const m = Math.max(28, Math.min(w, h) * 0.022); // outer frame inset; >= 28 so the 22 px corner rings fit inside
  const ouro = tom === 'azul' ? ['#CFE6FB', '#7DB8EC', '#3F6E99'] : ['#F2DC97', '#D2AD55', '#8C6A27'];
  return (
    <div ref={ref} className={`moldura ${className}`} style={style}>
      {w > 0 && (
        <svg className="moldura-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <defs>
            <linearGradient id={`fundo${id}`} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" stopColor="#202A6E" />
              <stop offset="0.55" stopColor="#18205A" />
              <stop offset="1" stopColor="#111846" />
            </linearGradient>
            <radialGradient id={`luz${id}`} cx="0.5" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#3B4AA8" stopOpacity=".35" />
              <stop offset="1" stopColor="#3B4AA8" stopOpacity="0" />
            </radialGradient>
            <pattern id={`aneis${id}`} width="150" height="150" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="#FFFFFF" strokeOpacity=".05" strokeWidth="1.2">
                <circle cx="75" cy="75" r="46" /><circle cx="75" cy="75" r="30" />
                <circle cx="0" cy="0" r="30" /><circle cx="150" cy="0" r="30" /><circle cx="0" cy="150" r="30" /><circle cx="150" cy="150" r="30" />
              </g>
            </pattern>
            <linearGradient id={`ouro${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={ouro[0]} /><stop offset="0.45" stopColor={ouro[1]} /><stop offset="1" stopColor={ouro[2]} />
            </linearGradient>
          </defs>
          <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx="4" fill={`url(#fundo${id})`} />
          <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx="4" fill={`url(#luz${id})`} />
          <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx="4" fill={`url(#aneis${id})`} />
          <g stroke={`url(#ouro${id})`} color={ouro[1]}>
            <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx="4" fill="none" strokeWidth="2.6" />
            <rect x={m + 12} y={m + 12} width={w - 2 * m - 24} height={h - 2 * m - 24} rx="2" fill="none" strokeWidth="1.1" strokeOpacity=".75" />
            <Canto x={m} y={m} sx={1} sy={1} />
            <Canto x={w - m} y={m} sx={-1} sy={1} />
            <Canto x={m} y={h - m} sx={1} sy={-1} />
            <Canto x={w - m} y={h - m} sx={-1} sy={-1} />
          </g>
        </svg>
      )}
      <div className="moldura-corpo">{children}</div>
    </div>
  );
}
