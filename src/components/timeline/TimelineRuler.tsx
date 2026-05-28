import type { ReactNode } from 'react';
import { colors } from '../../lib/theme';
import { RULER_HEIGHT, BEAT_ROW_HEIGHT, LEFT_PADDING } from './constants';

interface TimelineRulerProps {
  totalWidth: number;
  effectivePPS: number;
  bpm?: number;
  maxRulerT: number;
  tickInterval: number;
  effectiveRulerHeight: number;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function TimelineRuler({
  totalWidth,
  effectivePPS,
  bpm,
  maxRulerT,
  tickInterval,
  effectiveRulerHeight,
  onMouseDown,
}: TimelineRulerProps) {
  const secondTicks: ReactNode[] = [];
  for (let t = 0; t <= maxRulerT; t += tickInterval) {
    const isMajor = Math.abs(t - Math.round(t)) < 0.01;
    const left = LEFT_PADDING + t * effectivePPS;
    secondTicks.push(
      <div
        key={`s-${t}`}
        style={{
          position: 'absolute',
          left,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: 'translateX(-50%)',
        }}
      >
        {isMajor && (
          <span style={{ fontSize: 8, color: colors.textFaint, marginBottom: 2, whiteSpace: 'nowrap' }}>
            {t}s
          </span>
        )}
        <div style={{ width: 1, height: isMajor ? 6 : 3, background: isMajor ? colors.textGhost : colors.bgCardHover }} />
      </div>
    );
  }

  const beatTicks: ReactNode[] = [];
  if (bpm && bpm > 0) {
    const beatDur = 60 / bpm;
    const beatCount = Math.ceil(maxRulerT / beatDur) + 1;
    for (let b = 0; b <= beatCount; b++) {
      const t = b * beatDur;
      if (t > maxRulerT) break;
      const left = LEFT_PADDING + t * effectivePPS;
      const isMeasure = b % 4 === 0;
      beatTicks.push(
        <div
          key={`beat-${b}`}
          style={{
            position: 'absolute',
            left,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          {isMeasure && (
            <span style={{ fontSize: 8, color: colors.accentLight, marginBottom: 2, whiteSpace: 'nowrap', fontWeight: 600 }}>
              {b / 4 + 1}
            </span>
          )}
          <div style={{ width: 1, height: isMeasure ? 8 : 4, background: isMeasure ? colors.accent : '#4a2a7a' }} />
        </div>
      );
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: totalWidth,
        height: effectiveRulerHeight,
        cursor: 'pointer',
        userSelect: 'none',
        minWidth: '100%',
      }}
      onMouseDown={onMouseDown}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: RULER_HEIGHT,
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bgNav,
      }}>
        {secondTicks}
      </div>

      {bpm && bpm > 0 && (
        <div style={{
          position: 'absolute',
          top: RULER_HEIGHT,
          left: 0,
          width: '100%',
          height: BEAT_ROW_HEIGHT,
          borderBottom: `1px solid ${colors.borderMed}`,
          background: colors.bgNav,
        }}>
          {beatTicks}
        </div>
      )}
    </div>
  );
}
