import { useState, useEffect, useRef } from 'react';
import { useShowStore } from '../../store/showStore';
import { colors, radius } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';

interface StagePanelProps {
  onClose: () => void;
}

interface NumericInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isFloat?: boolean;
}

function NumericInput({ value, onChange, min, max, step = 1, isFloat = false }: NumericInputProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const [upHovered, setUpHovered] = useState(false);
  const [downHovered, setDownHovered] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value));
  }, [value]);

  const parse = (s: string) => isFloat ? parseFloat(s) : parseInt(s, 10);

  function clamp(n: number) {
    return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
  }

  function commit(s: string) {
    const n = parse(s);
    if (!isNaN(n)) {
      const clamped = clamp(n);
      onChange(clamped);
      setLocalValue(String(clamped));
    } else {
      setLocalValue(String(value));
    }
  }

  function increment(delta: number) {
    const current = parse(localValue);
    const base = isNaN(current) ? value : current;
    const next = clamp(base + delta);
    onChange(next);
    setLocalValue(String(next));
  }

  const arrowBase: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    color: colors.textFaint,
    fontSize: 8,
  };

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <input
        type="number"
        className="panel-input no-spinner"
        value={localValue}
        min={min}
        max={max}
        style={{ paddingRight: 22 }}
        onChange={e => {
          setLocalValue(e.target.value);
          const n = parse(e.target.value);
          if (!isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
            onChange(n);
          }
        }}
        onFocus={() => { isFocused.current = true; }}
        onBlur={e => { isFocused.current = false; commit(e.target.value); }}
      />
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 20,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <button
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); increment(step); }}
          onMouseEnter={() => setUpHovered(true)}
          onMouseLeave={() => setUpHovered(false)}
          style={{ ...arrowBase, color: upHovered ? colors.textSecondary : colors.textFaint }}
        >
          ▲
        </button>
        <button
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); increment(-step); }}
          onMouseEnter={() => setDownHovered(true)}
          onMouseLeave={() => setDownHovered(false)}
          style={{ ...arrowBase, color: downHovered ? colors.textSecondary : colors.textFaint }}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export function StagePanel({ onClose }: StagePanelProps) {
  const { show, updateStageConfig, updateShowBpm } = useShowStore();
  const config = show?.stage_config ?? {
    width: 60, height: 40,
    divisionsX: 5, divisionsY: 5,
    subdivisionsX: 2, subdivisionsY: 2,
    unit: 'ft',
    snapToGrid: false,
  };

  return (
    <div>
      <PanelHeader title="Stage" onClose={onClose} />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="panel-label">Width</label>
            <NumericInput
              value={config.width}
              onChange={v => updateStageConfig({ width: v })}
              min={10} max={500} step={1} isFloat
            />
          </div>
          <div>
            <label className="panel-label">Height</label>
            <NumericInput
              value={config.height}
              onChange={v => updateStageConfig({ height: v })}
              min={10} max={500} step={1} isFloat
            />
          </div>
        </div>

        <div>
          <label className="panel-label">Unit</label>
          <select className="panel-input" value={config.unit} onChange={e => updateStageConfig({ unit: e.target.value })}>
            <option value="ft">Feet (ft)</option>
            <option value="m">Meters (m)</option>
            <option value="yd">Yards (yd)</option>
            <option value="units">Units</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="panel-label">Divs Width</label>
            <NumericInput
              value={config.divisionsX}
              onChange={v => updateStageConfig({ divisionsX: v })}
              min={1} max={20}
            />
          </div>
          <div>
            <label className="panel-label">Divs Height</label>
            <NumericInput
              value={config.divisionsY}
              onChange={v => updateStageConfig({ divisionsY: v })}
              min={1} max={20}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="panel-label">Subs Width</label>
            <NumericInput
              value={config.subdivisionsX}
              onChange={v => updateStageConfig({ subdivisionsX: v })}
              min={1} max={20}
            />
          </div>
          <div>
            <label className="panel-label">Subs Height</label>
            <NumericInput
              value={config.subdivisionsY}
              onChange={v => updateStageConfig({ subdivisionsY: v })}
              min={1} max={20}
            />
          </div>
        </div>

        <div>
          <label className="panel-label">BPM</label>
          <NumericInput
            value={show?.bpm ?? 0}
            onChange={v => updateShowBpm(v <= 0 ? undefined : v)}
            min={0} max={300} step={1} isFloat
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="panel-label" style={{ marginBottom: 0 }}>Snap to Grid</label>
          <button
            onClick={() => updateStageConfig({ snapToGrid: !config.snapToGrid })}
            style={{
              width: 36,
              height: 20,
              borderRadius: radius.pill,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
              background: config.snapToGrid ? colors.accent : colors.borderMed,
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              top: 3,
              left: config.snapToGrid ? 18 : 3,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>

      </div>
    </div>
  );
}
