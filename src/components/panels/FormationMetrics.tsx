import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, fontWeight, spacing } from '../../lib/theme';
import { isOnStage } from '../../lib/stageUtils';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import {
  pathCrossingPairs, stageBalance, transitionSpeeds,
  DEFAULT_MAX_TRANSITION_SPEED,
  type PerformerPath, type StageBalance,
} from '../../lib/formationMetrics';

function describeBalance({ dx, dy }: StageBalance): string {
  const parts: string[] = [];
  if (Math.abs(dx) > 0.03) parts.push(`${Math.round(Math.abs(dx) * 100)}% ${dx < 0 ? 'left' : 'right'}`);
  if (Math.abs(dy) > 0.03) parts.push(`${Math.round(Math.abs(dy) * 100)}% ${dy < 0 ? 'up' : 'down'}`);
  return parts.length ? parts.join(', ') : 'Centered';
}

type MetricStatus = 'ok' | 'warn' | 'neutral';

function statusIcon(status: MetricStatus) {
  return status === 'warn'
    ? <AlertTriangle size={11} color={colors.danger} />
    : status === 'ok'
      ? <CheckCircle2 size={11} color={colors.success} />
      : <Circle size={11} color={colors.textFaint} />;
}

function MetricRow({
  label, value, status, onClick, active, containerRef,
}: {
  label: string;
  value: string;
  status: MetricStatus;
  onClick?: () => void;
  active?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pressable = !!onClick;
  return (
    <div
      ref={containerRef}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      aria-pressed={pressable ? active : undefined}
      onClick={onClick}
      onKeyDown={pressable ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick!();
        }
      } : undefined}
      onMouseEnter={() => pressable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => pressable && setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        cursor: pressable ? 'pointer' : 'default',
        padding: `${spacing.xs}px ${spacing.xs}px`,
        margin: `-${spacing.xxs}px -${spacing.xs}px`,
        borderRadius: 4,
        border: `1px solid ${active || focused ? colors.accent : 'transparent'}`,
        background: active ? colors.bgCardHover : (hovered || focused) ? colors.bgCard : 'transparent',
        outline: 'none',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: pressable && (hovered || active || focused) ? colors.textSecondary : colors.textFaint, fontSize: fontSize.sm }}>
        {statusIcon(status)}
        {label}
      </div>
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: status === 'warn' ? colors.dangerLight : pressable && (hovered || active || focused) ? colors.text : colors.textSecondary }}>
        {value}
      </div>
    </div>
  );
}

export function FormationMetrics() {
  const {
    show, formations, activeFormationId, performers, props, performerPositions, propPositions,
    selectedItemIds, setSelectedItemIds,
    setBalanceOverlay,
  } = useShowStore();

  // Only one metric can be highlighted/overlaid at a time.
  const [pressedMetric, setPressedMetric] = useState<'speed' | 'crossings' | 'offstage' | 'balance' | null>(null);
  const balanceRowRef = useRef<HTMLDivElement>(null);

  // If selection changed some other way (canvas click, etc.), don't keep showing a stale "pressed" state.
  useEffect(() => {
    if ((pressedMetric === 'speed' || pressedMetric === 'crossings' || pressedMetric === 'offstage') && selectedItemIds.length === 0) {
      setPressedMetric(null);
    }
  }, [selectedItemIds, pressedMetric]);

  // Clicking anywhere outside the row (canvas, another panel, etc.) dismisses the balance overlay,
  // the same way clicking elsewhere clears a performer highlight.
  useEffect(() => {
    if (pressedMetric !== 'balance') return;
    function handleClickOutside(e: MouseEvent) {
      if (balanceRowRef.current && !balanceRowRef.current.contains(e.target as Node)) {
        setBalanceOverlay(false);
        setPressedMetric(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pressedMetric, setBalanceOverlay]);

  const formation = formations.find(f => f.id === activeFormationId);
  if (!formation || !show) return null;

  const stage = show.stage_config;
  const unit = stage.unit || 'ft';
  const maxTransitionSpeed = stage.maxTransitionSpeed ?? DEFAULT_MAX_TRANSITION_SPEED;

  const performerEntries = performers
    .map(p => ({ id: p.id, pos: performerPositions[`${p.id}-${formation.id}`] }))
    .filter((e): e is { id: string; pos: NonNullable<typeof e.pos> } => !!e.pos);

  const propEntries = props
    .map(p => ({ id: p.id, pos: propPositions[`${p.id}-${formation.id}`] }))
    .filter((e): e is { id: string; pos: NonNullable<typeof e.pos> } => !!e.pos);

  const allEntries = [...performerEntries, ...propEntries];
  if (allEntries.length === 0) return null;

  const offStageIds = allEntries.filter(e => !isOnStage(e.pos.x, e.pos.y, stage)).map(e => e.id);

  // Being offstage is a deliberate choice (waiting in the wings, exiting, etc.) — never a warning,
  // and offstage performers shouldn't skew where the formation's "center" appears to be.
  const onStagePerformerPts = performerEntries
    .filter(e => isOnStage(e.pos.x, e.pos.y, stage))
    .map(e => ({ x: e.pos.x, y: e.pos.y }));
  const balance = stageBalance(onStagePerformerPts, stage);

  const sortedFormations = [...formations].sort((a, b) => a.order_index - b.order_index);
  const activeIdx = sortedFormations.findIndex(f => f.id === activeFormationId);
  const prevFormation = activeIdx > 0 ? sortedFormations[activeIdx - 1] : null;

  let maxSpeed: number | null = null;
  let fastPerformerIds: string[] = [];
  let crossingPairs: [string, string][] = [];
  if (prevFormation) {
    const allPaths: PerformerPath[] = [];
    const onStagePaths: PerformerPath[] = [];
    for (const p of performers) {
      const from = performerPositions[`${p.id}-${prevFormation.id}`];
      const to = performerPositions[`${p.id}-${formation.id}`];
      if (from && to) {
        const path = { id: p.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } };
        allPaths.push(path);
        // A performer exiting offstage isn't a "fast move" concern — only count them if they end up on stage.
        if (isOnStage(to.x, to.y, stage)) onStagePaths.push(path);
      }
    }
    const speeds = transitionSpeeds(onStagePaths, formation.transition_duration);
    if (speeds.length > 0) {
      maxSpeed = Math.max(...speeds.map(s => s.speed));
      fastPerformerIds = speeds.filter(s => s.speed > maxTransitionSpeed).map(s => s.id);
    }
    crossingPairs = pathCrossingPairs(allPaths);
  }
  const crossingPerformerIds = [...new Set(crossingPairs.flat())];
  const warningCount = (crossingPairs.length > 0 ? 1 : 0) + (fastPerformerIds.length > 0 ? 1 : 0);

  function toggleHighlight(metric: 'speed' | 'crossings' | 'offstage', ids: string[]) {
    if (pressedMetric === metric) {
      setSelectedItemIds([]);
      setPressedMetric(null);
    } else {
      setBalanceOverlay(false);
      setSelectedItemIds(ids);
      setPressedMetric(metric);
    }
  }

  function toggleBalance() {
    if (pressedMetric === 'balance') {
      setBalanceOverlay(false);
      setPressedMetric(null);
    } else {
      setSelectedItemIds([]);
      setBalanceOverlay(true);
      setPressedMetric('balance');
    }
  }

  return (
    <CollapsibleSection title="Metrics" badge={warningCount} persistKey="formation-metrics">
      <div style={{ padding: `0 ${spacing.md}px`, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        <MetricRow
          label="Path crossings"
          value={prevFormation ? (crossingPairs.length === 0 ? 'None' : String(crossingPairs.length)) : '—'}
          status={!prevFormation ? 'neutral' : crossingPairs.length > 0 ? 'warn' : 'ok'}
          onClick={crossingPairs.length > 0 ? () => toggleHighlight('crossings', crossingPerformerIds) : undefined}
          active={pressedMetric === 'crossings'}
        />

        <MetricRow
          label="Max transition speed"
          value={maxSpeed !== null ? `${maxSpeed.toFixed(1)} ${unit}/s` : '—'}
          status={maxSpeed === null ? 'neutral' : fastPerformerIds.length > 0 ? 'warn' : 'ok'}
          onClick={fastPerformerIds.length > 0 ? () => toggleHighlight('speed', fastPerformerIds) : undefined}
          active={pressedMetric === 'speed'}
        />

        <MetricRow
          label="Stage balance"
          value={balance ? describeBalance(balance) : '—'}
          status="neutral"
          onClick={balance ? toggleBalance : undefined}
          active={pressedMetric === 'balance'}
          containerRef={balanceRowRef}
        />

        <MetricRow
          label="On stage"
          value={offStageIds.length === 0 ? 'All on stage' : `${offStageIds.length} off stage`}
          status="neutral"
          onClick={offStageIds.length > 0 ? () => toggleHighlight('offstage', offStageIds) : undefined}
          active={pressedMetric === 'offstage'}
        />
      </div>
    </CollapsibleSection>
  );
}
