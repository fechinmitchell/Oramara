// oramara/frontend/src/components/DoseCalculator.jsx
import { useState } from 'react';
import { FORMATS, USES, doseFor } from '../config/products.js';

export default function DoseCalculator() {
  const [useId, setUseId] = useState('gaa');
  const [customM2, setCustomM2] = useState(5000);
  const [formatId, setFormatId] = useState('pouch');

  const use = USES.find((u) => u.id === useId);
  const areaHa = use ? use.areaHa : Math.max(0, Number(customM2) || 0) / 10000;
  const format = FORMATS.find((f) => f.id === formatId);
  const dose = doseFor({ areaHa, format });
  const unitName = format.id === 'pouch' ? 'pouches' : format.id === 'tablet' ? 'tablets' : 'sections';

  return (
    <div className="card calc">
      <div className="calc-inputs">
        <label>
          What are you spraying?
          <select value={useId} onChange={(e) => setUseId(e.target.value)}>
            {USES.map((u) => (
              <option key={u.id} value={u.id}>{u.name}: {u.detail}</option>
            ))}
            <option value="custom">Something else (enter area)</option>
          </select>
        </label>
        {useId === 'custom' && (
          <label>
            Area in m²
            <input type="number" min="10" step="10" value={customM2} onChange={(e) => setCustomM2(e.target.value)} />
          </label>
        )}
        <label>
          Format
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="calc-result">
        <span className="calc-number">{dose.units}</span>
        <span className="calc-unit">{unitName}</span>
        <p>
          in about <strong>{dose.waterLitres.toLocaleString()} L</strong> of water. {format.dose}.
        </p>
      </div>
    </div>
  );
}