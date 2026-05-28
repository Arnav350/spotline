import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { colors, radius } from '../../lib/theme';

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
        className="flex items-center gap-2 w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm px-2 py-1.5 hover:border-[#3a3a3a] transition-colors"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <div
          className="w-4 h-4 rounded-sm flex-shrink-0"
          style={{ background: color, border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <span className="text-[12px] text-[#aaa] flex-1 text-left font-mono">
          {color.toUpperCase()}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          zIndex: 50,
          padding: 8,
          background: colors.bgCard,
          border: `1px solid ${colors.borderMed}`,
          borderRadius: radius.md,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <HexColorPicker color={color} onChange={onChange} style={{ width: 180 }} />
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                style={{
                  width: 36,
                  height: 28,
                  borderRadius: radius.md,
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
