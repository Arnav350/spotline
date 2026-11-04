import { ArrowLeftRight } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

export function SwapTools() {
  const {
    selectedItemIds, performers, formations, activeFormationId,
    selectedFormationIds, swapPerformersAcrossRange,
  } = useShowStore();

  const selectedPerformers = selectedItemIds
    .map(id => performers.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const sorted = [...formations].filter(f => f.order_index !== -1).sort((a, b) => a.order_index - b.order_index);
  const startFormation = formations.find(f => f.order_index === -1);
  const ordered = startFormation ? [startFormation, ...sorted] : sorted;

  // The range comes from shift-clicking formations in the timeline (selectedFormationIds),
  // falling back to just the active formation when nothing's been shift-selected.
  const rangeIds = selectedFormationIds.length > 1 ? selectedFormationIds : (activeFormationId ? [activeFormationId] : []);
  const rangeFormations = ordered.filter(f => rangeIds.includes(f.id));
  const fromFormation = rangeFormations[0];
  const toFormation = rangeFormations[rangeFormations.length - 1];

  if (selectedPerformers.length !== 2) {
    return (
      <div style={{ padding: `0 ${spacing.md}px`, fontSize: fontSize.sm, color: colors.textFaint }}>
        Select exactly 2 performers to swap their positions across a range of formations.
      </div>
    );
  }

  const [a, b] = selectedPerformers;
  const canSwap = !!fromFormation && !!toFormation;

  function handleSwap() {
    if (!fromFormation || !toFormation) return;
    swapPerformersAcrossRange(a.id, b.id, fromFormation.id, toFormation.id);
  }

  return (
    <div style={{ padding: `0 ${spacing.md}px`, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <div style={{ fontSize: fontSize.md, color: colors.textSecondary }}>
        {a.name} <span style={{ color: colors.textFaint }}>↔</span> {b.name}
      </div>
      <div>
        <label className="panel-label">Range</label>
        <div style={{ fontSize: fontSize.md, color: colors.textSecondary }}>
          {fromFormation && toFormation
            ? (fromFormation.id === toFormation.id ? fromFormation.name : `${fromFormation.name} → ${toFormation.name}`)
            : 'No formation selected'}
        </div>
      </div>
      <button
        disabled={!canSwap}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: radius.md,
          border: 'none',
          background: colors.accent,
          color: colors.text,
          fontSize: fontSize.md,
          cursor: canSwap ? 'pointer' : 'not-allowed',
          opacity: canSwap ? 1 : 0.4,
          width: '100%',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (canSwap) e.currentTarget.style.background = colors.accentDark; }}
        onMouseLeave={e => { e.currentTarget.style.background = colors.accent; }}
        onClick={handleSwap}
      >
        <ArrowLeftRight size={14} />
        Swap Positions
      </button>
    </div>
  );
}
