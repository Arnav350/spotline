import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { colors, fontSize, fontWeight, radius, spacing } from '../../lib/theme';

interface CollapsibleSectionProps {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  // When set, open/closed state survives a page refresh (stored in localStorage under this key).
  persistKey?: string;
  children: React.ReactNode;
}

function storageKey(persistKey: string) {
  return `spotline-section-open:${persistKey}`;
}

export function CollapsibleSection({
  title, badge, defaultOpen = false, open: openProp, onToggle, persistKey, children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(() => {
    if (persistKey) {
      const saved = localStorage.getItem(storageKey(persistKey));
      if (saved !== null) return saved === 'true';
    }
    return defaultOpen;
  });
  const [hovered, setHovered] = useState(false);
  const open = openProp ?? internalOpen;

  function toggle() {
    const next = !open;
    if (persistKey) localStorage.setItem(storageKey(persistKey), String(next));
    if (onToggle) onToggle(next);
    else setInternalOpen(next);
  }

  return (
    <div style={{ borderBottom: `1px solid ${colors.border}` }}>
      <div
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.sm}px ${spacing.md}px`,
          cursor: 'pointer',
          background: hovered ? colors.bgCard : 'transparent',
          transition: 'background 0.1s',
        }}
      >
        <ChevronRight
          size={12}
          color={colors.textFaint}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
        />
        <span style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          color: colors.textFaint,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flex: 1,
        }}>
          {title}
        </span>
        {!!badge && (
          <span style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.bold,
            color: colors.dangerLight,
            background: colors.dangerBg,
            borderRadius: radius.pill,
            padding: '2px 6px',
            minWidth: 14,
            textAlign: 'center',
          }}>
            {badge}
          </span>
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: spacing.md }}>
          {children}
        </div>
      )}
    </div>
  );
}
