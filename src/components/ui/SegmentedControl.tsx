import { colors, fontSize, radius, spacing } from '../../lib/theme';

interface Option {
  value: string;
  label: string;
  title: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div style={{ display: 'flex', gap: spacing.xxs }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: `${spacing.xs}px 0`,
              fontSize: fontSize.md,
              fontFamily: 'monospace',
              background: active ? colors.accent : colors.bgCard,
              color: active ? colors.text : colors.textMuted,
              border: `1px solid ${active ? colors.accent : colors.borderMed}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
