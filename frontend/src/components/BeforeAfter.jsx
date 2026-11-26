// oramara/frontend/src/components/BeforeAfter.jsx
import { useState } from 'react';

export default function BeforeAfter({ before, after, beforeSrcSet, afterSrcSet, beforeLabel = 'Before', afterLabel = 'After', caption }) {
  const [pos, setPos] = useState(50);

  return (
    <figure className="ba-figure">
      <div className="ba">
        <img src={after} srcSet={afterSrcSet} sizes="(max-width: 1240px) 100vw, 1200px" alt={afterLabel} className="ba-img" draggable="false" />
        <div className="ba-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} srcSet={beforeSrcSet} sizes="(max-width: 1240px) 100vw, 1200px" alt={beforeLabel} className="ba-img" draggable="false" />
        </div>
        <span className="ba-label ba-label-left">{beforeLabel}</span>
        <span className="ba-label ba-label-right">{afterLabel}</span>
        <div className="ba-handle" style={{ left: `${pos}%` }} aria-hidden="true">
          <span className="ba-knob">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="ba-range"
          aria-label="Drag to compare before and after"
        />
      </div>
      {caption && <figcaption className="ba-caption">{caption}</figcaption>}
    </figure>
  );
}