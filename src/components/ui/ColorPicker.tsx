import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

const PRESET_COLORS = [
  '#1560ed', '#ed158c', '#ed1515', '#8015ed',
  '#15ee4c', '#ee7015', '#eec315', '#ffffff',
];

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%',
          background: colors.bgPanel, border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.sm, padding: spacing.sm, cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = colors.borderMed; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderSubtle; }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ width: 16, height: 16, borderRadius: radius.xs, flexShrink: 0, background: color, border: '1px solid rgba(255,255,255,0.1)' }} />
        <span style={{ fontSize: fontSize.md, color: colors.textSecondary, flex: 1, textAlign: 'left', fontFamily: 'monospace' }}>
          {color.toUpperCase()}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: spacing.xs,
          zIndex: 50,
          padding: spacing.sm,
          background: colors.bgCard,
          border: `1px solid ${colors.borderMed}`,
          borderRadius: radius.sm,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <HexColorPicker color={color} onChange={onChange} style={{ width: 180 }} />
          <div style={{ marginTop: spacing.sm, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.xs }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                style={{
                  width: 36,
                  height: 28,
                  borderRadius: radius.sm,
                  background: c,
                  border: `1px solid ${colors.borderStrong}`,
                  cursor: 'pointer',
                }}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
