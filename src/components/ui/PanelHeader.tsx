import { X } from 'lucide-react';
import { colors, fontSize, fontWeight, radius, spacing } from '../../lib/theme';

interface PanelHeaderProps {
  title: string;
  onClose?: () => void;
}

export function PanelHeader({ title, onClose }: PanelHeaderProps) {
  return (
    <div style={{
      padding: `${spacing.md}px ${spacing.md}px ${spacing.sm}px`,
      borderBottom: `1px solid ${colors.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
        color: colors.textFaint,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {title}
      </span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: colors.textGhost,
            display: 'flex',
            alignItems: 'center',
            padding: spacing.xxs,
            borderRadius: radius.sm,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.textSecondary)}
          onMouseLeave={e => (e.currentTarget.style.color = colors.textGhost)}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
