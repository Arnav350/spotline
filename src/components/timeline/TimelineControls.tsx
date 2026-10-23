import { Plus, Play, Pause, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Repeat, Flag } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

interface TimelineControlsProps {
  isPlaying: boolean;
  hasMusic: boolean;
  audioTime: number;
  audioDuration: number;
  timelineZoom: number;
  startTimes: number[];
  onPlay: () => void;
  onSeekToTime: (t: number) => void;
  onZoomChange: (zoom: number) => void;
  formatTime: (s: number) => string;
  loopEnabled: boolean;
  hasLoopRange: boolean;
  onToggleLoop: () => void;
}

export function TimelineControls({
  isPlaying,
  hasMusic,
  audioTime,
  audioDuration,
  timelineZoom,
  startTimes,
  onPlay,
  onSeekToTime,
  onZoomChange,
  formatTime,
  loopEnabled,
  hasLoopRange,
  onToggleLoop,
}: TimelineControlsProps) {
  const { formations, activeFormationId, addFormation, addFormationAfter, addStartFormation, deleteFormation, setActiveFormation, currentUserRole } = useShowStore();
  const isViewer = currentUserRole === 'viewer';

  // The starting formation (order_index -1, see addStartFormation) is a separate, always-
  // reachable-by-id pose, not part of the time-ordered sequence startTimes/seeking use —
  // it has no "time" to seek to, so it needs its own identity here rather than an index.
  const startFormation = formations.find(f => f.order_index === -1);
  const timelineFormations = formations.filter(f => f.order_index !== -1);
  const isOnStart = !!startFormation && activeFormationId === startFormation.id;
  const activeIdx = timelineFormations.findIndex(f => f.id === activeFormationId);
  const canPrev = isOnStart ? false : activeIdx > 0 || (activeIdx === 0 && !!startFormation);
  const canNext = isOnStart ? timelineFormations.length > 0 : activeIdx >= 0 && activeIdx < timelineFormations.length - 1;

  function handleAddClick() {
    // Add right after the active formation, or at the end if none is active/selected.
    if (activeFormationId) addFormationAfter(activeFormationId);
    else addFormation();
  }

  function goToPrev() {
    if (!canPrev) return;
    if (activeIdx === 0 && startFormation) {
      setActiveFormation(startFormation.id, 0.3);
    } else {
      onSeekToTime(startTimes[activeIdx - 1]);
    }
  }

  function goToNext() {
    if (!canNext) return;
    onSeekToTime(isOnStart ? 0 : startTimes[activeIdx + 1]);
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: `0 ${spacing.md}px`,
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: 0,
      height: 44,
      position: 'relative',
    }}>
      {/* Left: add formation + zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flex: 1 }}>
        {!isViewer && (
          <button
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: fontSize.md, color: colors.accentLight, padding: `${spacing.xs}px ${spacing.sm}px`, flexShrink: 0 }}
            onClick={handleAddClick}
          >
            <Plus size={14} /> Add
          </button>
        )}
        {!isViewer && (
          <button
            className="btn-icon"
            onClick={() => startFormation ? deleteFormation(startFormation.id) : addStartFormation()}
            title={startFormation
              ? 'Remove starting formation'
              : 'Add starting formation — a no-duration pose held at t=0, before the song starts'}
            style={{ flexShrink: 0, color: startFormation ? colors.accentLight : undefined }}
          >
            <Flag size={14} />
          </button>
        )}
        {!isViewer && <div style={{ width: 1, height: 16, background: colors.borderMed, margin: `0 ${spacing.xxs}px`, flexShrink: 0 }} />}
        <button
          className="btn-icon"
          onClick={() => onZoomChange(Math.min(5, timelineZoom * 1.4))}
          title="Zoom in"
          style={{ flexShrink: 0 }}
        >
          <ZoomIn size={14} />
        </button>
        <button
          className="btn-icon"
          onClick={() => onZoomChange(Math.max(0.15, timelineZoom / 1.4))}
          title="Zoom out"
          style={{ flexShrink: 0 }}
        >
          <ZoomOut size={14} />
        </button>
      </div>

      {/* Center: transport controls — absolutely centered */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
      }}>
        <button
          onClick={goToPrev}
          disabled={!canPrev}
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bgCard,
            border: `1px solid ${colors.borderMed}`,
            cursor: canPrev ? 'pointer' : 'default',
            color: canPrev ? colors.textSecondary : colors.textGhost,
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={onPlay}
          disabled={!hasMusic}
          title={hasMusic ? undefined : 'Upload music to enable playback'}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.accentLight,
            border: 'none',
            cursor: hasMusic ? 'pointer' : 'default',
            opacity: hasMusic ? 1 : 0.35,
          }}
        >
          {isPlaying
            ? <Pause size={13} fill="white" color="white" />
            : <Play size={13} fill="white" color="white" style={{ marginLeft: 1 }} />}
        </button>

        <button
          onClick={goToNext}
          disabled={!canNext}
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bgCard,
            border: `1px solid ${colors.borderMed}`,
            cursor: canNext ? 'pointer' : 'default',
            color: canNext ? colors.textSecondary : colors.textGhost,
          }}
        >
          <ChevronRight size={16} />
        </button>

        {hasMusic && (
          <span style={{ fontSize: fontSize.sm, color: colors.textFaint, whiteSpace: 'nowrap', marginLeft: spacing.xxs }}>
            {formatTime(audioTime)} / {formatTime(audioDuration)}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-icon"
          onClick={onToggleLoop}
          disabled={!hasLoopRange}
          title={hasLoopRange
            ? (loopEnabled ? 'Loop: ON — Shift+drag the ruler to redefine' : 'Loop: OFF — Shift+drag the ruler to redefine')
            : 'Shift+drag the ruler to set a loop region'}
          style={{
            color: loopEnabled ? colors.accentLight : undefined,
            opacity: hasLoopRange ? 1 : 0.35,
          }}
        >
          <Repeat size={15} />
        </button>
      </div>
    </div>
  );
}
