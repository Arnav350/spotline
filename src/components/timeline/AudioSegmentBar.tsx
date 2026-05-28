import { useState } from 'react';
import type { AudioSegment } from '../../lib/types';
import { useShowStore } from '../../store/showStore';
import { fontSize, radius } from '../../lib/theme';
import { HANDLE_WIDTH, SEGMENT_ROW_HEIGHT, LEFT_PADDING } from './constants';

interface AudioSegmentBarProps {
  segment: AudioSegment;
  startTime: number;
  effectivePPS: number;
  isSelected: boolean;
  isEditable: boolean;
  bpm?: number;
  onResizeStart: (e: React.MouseEvent, segmentId: string, startX: number, startDur: number) => void;
}

export function AudioSegmentBar({ segment, startTime, effectivePPS, isSelected, isEditable, bpm, onResizeStart }: AudioSegmentBarProps) {
  const { setSelectedAudioSegment } = useShowStore();
  const [hovered, setHovered] = useState(false);

  const left = LEFT_PADDING + startTime * effectivePPS;
  const width = Math.max(HANDLE_WIDTH + 20, segment.duration * effectivePPS);

  const durationLabel = bpm && bpm > 0
    ? `${Math.round(segment.duration * bpm / 60)}ct`
    : `${segment.duration.toFixed(1)}s`;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 3,
        width,
        height: SEGMENT_ROW_HEIGHT - 16,
        background: segment.color,
        border: isSelected ? '2px solid #fff' : '2px solid transparent',
        borderRadius: radius.sm,
        boxSizing: 'border-box',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        cursor: isEditable ? 'pointer' : 'default',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={() => isEditable && setSelectedAudioSegment(segment.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Name + duration */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 6, paddingRight: isEditable ? HANDLE_WIDTH + 4 : 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          fontSize: fontSize.sm,
          color: '#fff',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}>
          {segment.name}
        </span>
        <span style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {durationLabel}
        </span>
      </div>

      {/* Right resize handle — only in editable mode */}
      {isEditable && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: HANDLE_WIDTH + 4,
            height: '100%',
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(e, segment.id, e.clientX, segment.duration);
          }}
        >
          <div style={{
            width: 2,
            height: 12,
            background: hovered ? '#fff' : 'rgba(255,255,255,0.5)',
            borderRadius: 1,
          }} />
        </div>
      )}
    </div>
  );
}
