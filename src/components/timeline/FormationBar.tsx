import type { Formation } from '../../lib/types';
import { colors, fontSize, fontWeight, radius } from '../../lib/theme';
import { HANDLE_WIDTH, BAR_HEIGHT, TRANS_BAR_HEIGHT, PURPLE, BAR_GAP } from './constants';
import { GripVertical } from 'lucide-react';
import type { CollaboratorState } from '../../store/showStore';

export interface DragState {
  formationId: string;
  type: 'dur-left' | 'dur-right' | 'trans-right';
  startX: number;
  startDur: number;
  startTrans: number;
}

interface FormationBarProps {
  formation: Formation;
  index: number;
  startTime: number;
  effectivePPS: number;
  isActive: boolean;
  isHovered: boolean;
  bpm?: number;
  isBeingDragged: boolean;
  presentCollaborators?: CollaboratorState[];
  onSetActive: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  onDurResizeStart?: (e: React.MouseEvent, state: DragState) => void;
  onTransResizeStart?: (e: React.MouseEvent, state: DragState) => void;
  onReorderStart?: (e: React.MouseEvent, formationId: string, origIndex: number) => void;
  onContextMenu?: (e: React.MouseEvent, formationId: string) => void;
}

export function FormationBar({
  formation,
  index,
  startTime,
  effectivePPS,
  isActive,
  isHovered,
  bpm,
  isBeingDragged,
  presentCollaborators = [],
  onSetActive,
  onHoverChange,
  onDurResizeStart,
  onTransResizeStart,
  onReorderStart,
  onContextMenu,
}: FormationBarProps) {
  const gap = index === 0 ? 0 : BAR_GAP;
  const left = 12 + startTime * effectivePPS + gap; // LEFT_PADDING = 12; gap is on the left so right edge aligns with beat line
  const width = Math.max(20, formation.duration * effectivePPS - gap);
  // transWidth capped at width - HANDLE_WIDTH - 3 so the trans handle never overlaps the dur handle.
  const transWidth = Math.min(width - HANDLE_WIDTH - 3, Math.max(0, formation.transition_duration * effectivePPS - gap));

  const durationLabel = bpm && bpm > 0
    ? `${Math.round(formation.duration * bpm / 60)}ct`
    : `${formation.duration.toFixed(1)}s`;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 0,
        width,
        height: BAR_HEIGHT,
        background: colors.bgCard,
        border: `2px solid ${isActive ? colors.textSecondary : colors.borderMed}`,
        borderRadius: radius.sm,
        userSelect: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        opacity: isBeingDragged ? 0.4 : 1,
      }}
      onClick={() => onSetActive(formation.id)}
      onContextMenu={onContextMenu ? e => onContextMenu(e, formation.id) : undefined}
      onMouseEnter={() => onHoverChange(formation.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      {/* Grip handle */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 14,
          height: BAR_HEIGHT - TRANS_BAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onReorderStart ? 'grab' : 'pointer',
          zIndex: 4,
          color: isHovered ? colors.textMuted : 'transparent',
        }}
        onMouseDown={onReorderStart ? e => {
          e.preventDefault();
          e.stopPropagation();
          onReorderStart(e, formation.id, index);
        } : undefined}
      >
        <GripVertical size={10} />
      </div>


      {/* Transition strip — anchored at bar left. transWidth is reduced by gap so the
          handle's right edge aligns with the beat line, not 4px past it. */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: HANDLE_WIDTH,
        height: TRANS_BAR_HEIGHT,
        background: colors.bgNav,
        borderRadius: '0 0 2px 2px',
        zIndex: 1,
      }}>
        {transWidth > 0 && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: transWidth,
            height: '100%',
            background: colors.accentDark,
            borderRadius: '0 1px 2px 2px',
          }} />
        )}
        <div
          style={{
            position: 'absolute',
            left: Math.max(0, transWidth - 3),
            top: -2,
            width: 6,
            height: TRANS_BAR_HEIGHT + 4,
            cursor: onTransResizeStart ? 'ew-resize' : 'pointer',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseDown={onTransResizeStart ? e => {
            e.preventDefault();
            e.stopPropagation();
            onTransResizeStart(e, {
              formationId: formation.id,
              type: 'trans-right',
              startX: e.clientX,
              startDur: formation.duration,
              startTrans: formation.transition_duration,
            });
          } : undefined}
        >
          <div style={{
            width: 1.5,
            height: TRANS_BAR_HEIGHT + 2,
            background: transWidth > 0 ? PURPLE : '#252525',
            borderRadius: 1,
          }} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ position: 'absolute', left: 14, right: HANDLE_WIDTH, top: 0, bottom: TRANS_BAR_HEIGHT, overflow: 'hidden' }}>
        <span style={{
          position: 'absolute',
          top: 6,
          left: 4,
          right: 20,
          color: isActive ? colors.text : colors.textSecondary,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.medium,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {formation.name}
        </span>
        <span style={{
          position: 'absolute',
          top: 6,
          right: 2,
          color: isActive ? colors.textFaint : colors.textGhost,
          fontSize: fontSize.sm,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {durationLabel}
        </span>

        {/* Collaborator presence dots */}
        {presentCollaborators.length > 0 && (
          <div style={{ position: 'absolute', top: 5, right: 4, display: 'flex', gap: 2, pointerEvents: 'none' }}>
            {presentCollaborators.slice(0, 3).map(c => (
              <div key={c.user_id} title={c.name} style={{
                width: 8, height: 8, borderRadius: '50%', background: c.color,
                boxShadow: `0 0 0 1.5px ${colors.bgCard}`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Right resize handle */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: HANDLE_WIDTH,
          height: '100%',
          cursor: onDurResizeStart ? 'ew-resize' : 'pointer',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0 3px 3px 0',
        }}
        onMouseDown={onDurResizeStart ? e => {
          e.preventDefault();
          e.stopPropagation();
          onDurResizeStart(e, {
            formationId: formation.id,
            type: 'dur-right',
            startX: e.clientX,
            startDur: formation.duration,
            startTrans: formation.transition_duration,
          });
        } : undefined}
      >
        <div style={{
          width: 1.5,
          height: 12,
          background: isHovered ? colors.textMuted : colors.borderMed,
          borderRadius: 1,
        }} />
      </div>
    </div>
  );
}
