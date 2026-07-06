import { useState } from 'react';
import {
  FlipHorizontal2, FlipVertical2, RotateCw, RotateCcw, RefreshCw,
} from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, fontWeight, radius, spacing } from '../../lib/theme';

function ABtn({
  onClick, title, disabled, children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && !disabled;
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? colors.bgCardHover : colors.bgCard,
        border: `1px solid ${active ? colors.accent : colors.borderMed}`,
        borderRadius: radius.sm,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? colors.textGhost : active ? colors.accentLight : colors.textSecondary,
        padding: 0,
        flexShrink: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: fontSize.sm, color: colors.textFaint, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

export function ArrangeTools() {
  const {
    selectedItemIds,
    arrangeSelectedPerformers,
    mirrorSelectedPerformers,
    rotateSelectedPerformers,
  } = useShowStore();

  const sel = selectedItemIds.length;
  const canArrange = sel >= 2;
  const canTransform = sel >= 1;

  const rowStyle = { display: 'flex', gap: spacing.xs, flexWrap: 'wrap' as const };

  return (
    <div style={{
      padding: `0 ${spacing.md}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
    }}>

      {/* Shape presets */}
      <div>
        <SectionLabel>Shape</SectionLabel>
        <div style={rowStyle}>
          <ABtn onClick={() => arrangeSelectedPerformers('line-h')} title="Horizontal line" disabled={!canArrange}>
            <span style={{ fontSize: fontSize.sm, lineHeight: 1, fontWeight: fontWeight.bold }}>—</span>
          </ABtn>
          <ABtn onClick={() => arrangeSelectedPerformers('line-v')} title="Vertical line" disabled={!canArrange}>
            <span style={{ fontSize: fontSize.md, lineHeight: 1, fontWeight: 300 }}>|</span>
          </ABtn>
          <ABtn onClick={() => arrangeSelectedPerformers('circle')} title="Circle" disabled={!canArrange}>
            <span style={{ fontSize: fontSize.sm, lineHeight: 1 }}>○</span>
          </ABtn>
          <ABtn onClick={() => arrangeSelectedPerformers('grid')} title="Grid" disabled={!canArrange}>
            <span style={{ fontSize: fontSize.sm, lineHeight: 1 }}>⊞</span>
          </ABtn>
        </div>
      </div>

      {/* Transform */}
      <div>
        <SectionLabel>Transform</SectionLabel>
        <div style={rowStyle}>
          <ABtn onClick={() => mirrorSelectedPerformers('horizontal')} title="Mirror left ↔ right" disabled={!canTransform}>
            <FlipHorizontal2 size={13} />
          </ABtn>
          <ABtn onClick={() => mirrorSelectedPerformers('vertical')} title="Mirror top ↕ bottom" disabled={!canTransform}>
            <FlipVertical2 size={13} />
          </ABtn>
          <div style={{ width: 6 }} />
          <ABtn onClick={() => rotateSelectedPerformers(90)} title="Rotate 90° clockwise" disabled={!canTransform}>
            <RotateCw size={13} />
          </ABtn>
          <ABtn onClick={() => rotateSelectedPerformers(270)} title="Rotate 90° counter-clockwise" disabled={!canTransform}>
            <RotateCcw size={13} />
          </ABtn>
          <ABtn onClick={() => rotateSelectedPerformers(180)} title="Rotate 180°" disabled={!canTransform}>
            <RefreshCw size={13} />
          </ABtn>
        </div>
      </div>

    </div>
  );
}
