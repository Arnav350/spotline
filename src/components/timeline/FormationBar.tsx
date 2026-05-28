import type { Formation } from '../../lib/types';
import { colors } from '../../lib/theme';
import { HANDLE_WIDTH, BAR_HEIGHT, TRANS_BAR_HEIGHT, PURPLE } from './constants';
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
  onDurResizeStart: (e: React.MouseEvent, state: DragState) => void;
  onTransResizeStart: (e: React.MouseEvent, state: DragState) => void;
  onReorderStart: (e: React.MouseEvent, formationId: string, origIndex: number) => void;
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
}: FormationBarProps) {
  const left = 12 + startTime * effectivePPS; // LEFT_PADDING = 12
  const width = Math.max(HANDLE_WIDTH * 2 + 32, formation.duration * effectivePPS);
  // transWidth is measured from bar left (not content div left) so the handle
  // lands on absolute beat tick positions in the ruler.
  const transWidth = Math.min(width - HANDLE_WIDTH, Math.max(0, formation.transition_duration * effectivePPS));

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
        border: `1px solid ${isActive ? PURPLE : colors.borderMed}`,
        borderTop: `2px solid ${isActive ? PURPLE : colors.borderStrong}`,
        borderRadius: 3,
        userSelect: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        opacity: isBeingDragged ? 0.4 : 1,
      }}
      onClick={() => onSetActive(formation.id)}
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
          cursor: 'grab',
          zIndex: 4,
          color: isHovered ? colors.textMuted : 'transparent',
        }}
        onMouseDown={e => {
          e.preventDefault();
          e.stopPropagation();
          onReorderStart(e, formation.id, index);
        }}
      >
        <GripVertical size={10} />
      </div>


      {/* Transition strip — anchored at bar left so handle aligns with ruler beat ticks.
          The grip handle (z-index 4) overlaps the first portion of the strip. */}
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
            cursor: 'ew-resize',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            onTransResizeStart(e, {
              formationId: formation.id,
              type: 'trans-right',
              startX: e.clientX,
              startDur: formation.duration,
              startTrans: formation.transition_duration,
            });
          }}
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
          right: 44,
          color: isActive ? '#ddd' : colors.textSecondary,
          fontSize: 11,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {formation.name}
        </span>
        <span style={{
          position: 'absolute',
          top: 7,
          right: 4,
          color: isActive ? colors.textFaint : colors.textGhost,
          fontSize: 10,
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
          cursor: 'ew-resize',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0 3px 3px 0',
        }}
        onMouseDown={e => {
          e.preventDefault();
          e.stopPropagation();
          onDurResizeStart(e, {
            formationId: formation.id,
            type: 'dur-right',
            startX: e.clientX,
            startDur: formation.duration,
            startTrans: formation.transition_duration,
          });
        }}
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
