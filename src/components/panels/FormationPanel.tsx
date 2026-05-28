import { useState, useEffect, useRef } from 'react';
import { Trash2, Shuffle } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import type { TransitionEasing } from '../../lib/types';
import { colors, fontSize, fontWeight, radius } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';
import { ColorPicker } from '../ui/ColorPicker';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ArrangeTools } from '../ui/ArrangeTools';
import type { Shape } from '../../lib/types';

function NumericInput({ value, onChange, min, max, step = 0.5 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setLocal(String(value)); }, [value]);
  function commit(s: string) {
    const n = parseFloat(s);
    if (!isNaN(n)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
      onChange(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(value));
    }
  }
  return (
    <input
      type="number"
      className="panel-input"
      value={local}
      min={min}
      max={max}
      step={step}
      onChange={e => {
        setLocal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
      }}
      onFocus={() => { focused.current = true; }}
      onBlur={e => { focused.current = false; commit(e.target.value); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

const SHAPES: { value: Shape; label: string }[] = [
  { value: 'circle', label: '● Circle' },
  { value: 'square', label: '■ Square' },
  { value: 'triangle', label: '▲ Triangle' },
  { value: 'star', label: '★ Star' },
];

const EASING_OPTIONS: { value: TransitionEasing; label: string; title: string }[] = [
  { value: 'linear', label: '—', title: 'Linear' },
  { value: 'ease', label: '◡', title: 'Ease' },
  { value: 'ease-in', label: '╱', title: 'Ease In' },
  { value: 'ease-out', label: '╲', title: 'Ease Out' },
];

const deleteButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: fontSize.base,
  color: colors.danger,
  background: 'transparent',
  border: 'none',
  padding: '6px 0',
  cursor: 'pointer',
  borderRadius: radius.sm,
  width: '100%',
} as const;

function PerformerEditor() {
  const {
    selectedItem, performers, performerGroups,
    updatePerformer, deletePerformer, setSelectedItem, assignPerformerToGroup,
  } = useShowStore();

  if (selectedItem?.type !== 'performer') return null;
  const performer = performers.find(p => p.id === selectedItem.id);
  if (!performer) return null;

  return (
    <div style={{ borderBottom: `1px solid ${colors.border}` }}>
      <PanelHeader title="Performer" />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="panel-label">Name</label>
          <input
            className="panel-input"
            value={performer.name}
            onChange={e => updatePerformer(performer.id, { name: e.target.value })}
          />
        </div>
        <div>
          <label className="panel-label">Color</label>
          <ColorPicker color={performer.color} onChange={c => updatePerformer(performer.id, { color: c })} />
        </div>
        <div>
          <label className="panel-label">Shape</label>
          <select
            className="panel-input"
            value={performer.shape}
            onChange={e => updatePerformer(performer.id, { shape: e.target.value as Shape })}
          >
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {performerGroups.length > 0 && (
          <div>
            <label className="panel-label">Group</label>
            <select
              className="panel-input"
              value={performer.group_id || ''}
              onChange={e => assignPerformerToGroup(performer.id, e.target.value || null)}
            >
              <option value="">No group</option>
              {performerGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <button
          style={deleteButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.background = colors.dangerBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => { deletePerformer(performer.id); setSelectedItem(null); }}
        >
          <Trash2 size={12} />
          Delete Performer
        </button>
      </div>
    </div>
  );
}

function PropEditor() {
  const { selectedItemIds, props, updateProp, deleteProp, setSelectedItemIds } = useShowStore();
  if (selectedItemIds.length !== 1 || !props.some(p => p.id === selectedItemIds[0])) return null;
  const prop = props.find(p => p.id === selectedItemIds[0]);
  if (!prop) return null;

  return (
    <div style={{ borderBottom: `1px solid ${colors.border}` }}>
      <PanelHeader title="Prop" />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="panel-label">Name</label>
          <input className="panel-input" value={prop.name} onChange={e => updateProp(prop.id, { name: e.target.value })} />
        </div>
        <div>
          <label className="panel-label">Color</label>
          <ColorPicker color={prop.color} onChange={c => updateProp(prop.id, { color: c })} />
        </div>
        <div>
          <label className="panel-label">Shape</label>
          <select className="panel-input" value={prop.shape} onChange={e => updateProp(prop.id, { shape: e.target.value as Shape })}>
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="panel-label">Width</label>
            <NumericInput value={prop.width ?? prop.size ?? 2} min={0.5} step={0.5} onChange={v => updateProp(prop.id, { width: v })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="panel-label">Depth</label>
            <NumericInput value={prop.depth ?? prop.size ?? 2} min={0.5} step={0.5} onChange={v => updateProp(prop.id, { depth: v })} />
          </div>
        </div>
        <button
          style={deleteButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.background = colors.dangerBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => { deleteProp(prop.id); setSelectedItemIds([]); }}
        >
          <Trash2 size={12} />
          Delete Prop
        </button>
      </div>
    </div>
  );
}

interface FormationPanelProps {
  onClose: () => void;
}

export function FormationPanel({ onClose }: FormationPanelProps) {
  const {
    formations, activeFormationId, updateFormation, deleteFormation,
    setActiveFormation, selectedItem, selectedItemIds, optimizeFormationTransition,
  } = useShowStore();

  const formation = formations.find(f => f.id === activeFormationId);
  const easing: TransitionEasing = formation?.transition_easing ?? 'ease';

  const sortedFormations = [...formations].sort((a, b) => a.order_index - b.order_index);
  const activeIdx = sortedFormations.findIndex(f => f.id === activeFormationId);
  const prevFormation = activeIdx > 0 ? sortedFormations[activeIdx - 1] : null;

  function handleOptimize() {
    if (!prevFormation || !activeFormationId) return;
    optimizeFormationTransition(prevFormation.id, activeFormationId);
  }

  function handleDelete() {
    if (!formation) return;
    const idx = formations.findIndex(f => f.id === formation.id);
    deleteFormation(formation.id);
    const next = formations[idx + 1] ?? formations[idx - 1];
    if (next) setActiveFormation(next.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {selectedItem?.type === 'performer' && <PerformerEditor />}
      {selectedItemIds.length > 1 && !selectedItem && (
        <div style={{
          padding: '10px 12px',
          fontSize: fontSize.md,
          color: colors.textMuted,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {selectedItemIds.length} items selected
        </div>
      )}
      <PropEditor />

      <PanelHeader title="Formation" onClose={onClose} />

      {formation ? (
        <>
          {/* Formation metadata fields */}
          <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="panel-label">Name</label>
              <input
                className="panel-input"
                value={formation.name}
                onChange={e => updateFormation(formation.id, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="panel-label">Notes</label>
              <textarea
                className="panel-input"
                value={formation.notes || ''}
                onChange={e => updateFormation(formation.id, { notes: e.target.value })}
                placeholder="Add notes…"
                rows={3}
                style={{ resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label className="panel-label">Transition Easing</label>
              <SegmentedControl
                options={EASING_OPTIONS}
                value={easing}
                onChange={v => updateFormation(formation.id, { transition_easing: v as TransitionEasing })}
              />
              <div style={{ fontSize: fontSize.xs, color: colors.textFaint, marginTop: 3, fontWeight: fontWeight.normal }}>
                {EASING_OPTIONS.find(o => o.value === easing)?.title}
              </div>
            </div>
          </div>

          {/* Arrange tools — full-width section */}
          <ArrangeTools />

          {/* Action buttons */}
          <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prevFormation && (
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: fontSize.base,
                  color: colors.textSecondary,
                  background: 'transparent',
                  border: `1px solid ${colors.borderMed}`,
                  padding: '6px 0',
                  cursor: 'pointer',
                  borderRadius: radius.sm,
                  width: '100%',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = colors.accentLight;
                  e.currentTarget.style.borderColor = colors.accent;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = colors.textSecondary;
                  e.currentTarget.style.borderColor = colors.borderMed;
                }}
                onClick={handleOptimize}
                title={`Minimize travel distance from "${prevFormation.name}"`}
              >
                <Shuffle size={12} />
                Optimize Transition
              </button>
            )}
            <button
              style={deleteButtonStyle}
              onMouseEnter={e => (e.currentTarget.style.background = colors.dangerBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={handleDelete}
            >
              <Trash2 size={12} />
              Delete Formation
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '10px 12px', fontSize: fontSize.base, color: colors.textFaint }}>
          No formation selected
        </div>
      )}
    </div>
  );
}
