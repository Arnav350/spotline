import { useRef, useEffect, useState } from 'react';
import { useShowStore } from '../store/showStore';
import { colors } from '../lib/theme';
import { TimelineControls } from './timeline/TimelineControls';
import { TimelineRuler } from './timeline/TimelineRuler';
import { FormationBar } from './timeline/FormationBar';
import {
  BASE_PPS, BAR_HEIGHT, RULER_HEIGHT, BEAT_ROW_HEIGHT,
  LEFT_PADDING, SEGMENT_ROW_HEIGHT, PURPLE,
} from './timeline/constants';
import { AudioSegmentBar } from './timeline/AudioSegmentBar';
import { usePlayback } from '../hooks/usePlayback';
import { useTimelineGestures } from '../hooks/useTimelineGestures';

export default function FormationTimeline({ showAudioSegments = false }: { showAudioSegments?: boolean }) {
  const {
    formations, activeFormationId,
    setActiveFormation, show,
    audioSegments, selectedAudioSegmentId,
    collaborators, localUserId,
  } = useShowStore();
  const bpm = show?.bpm;

  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Playback ---
  const {
    isPlaying, setIsPlaying,
    audioTime,
    audioDuration, setAudioDuration,
    animFrameRef,
    formationsRef,
    handlePlay,
    seekToTime,
    formatTime,
  } = usePlayback(audioRef);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasSeeked, setHasSeeked] = useState(false);
  function seek(t: number) { setHasSeeked(true); seekToTime(t); }

  // --- Timeline gestures (zoom, resize, reorder, seek) ---
  const {
    timelineZoom, setTimelineZoom,
    segDragRef,
    dropIndicatorIdx,
    reorderDragRef,
    handleDurResizeStart,
    handleTransResizeStart,
    handleReorderStart,
    handleRulerMouseDown,
  } = useTimelineGestures(scrollRef, seek);

  const effectivePPS = BASE_PPS * timelineZoom;

  // Keep formationsRef current
  formationsRef.current = formations;

  // Arrow key navigation between formations
  const handlePlayRef = useRef(handlePlay);
  handlePlayRef.current = handlePlay;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        handlePlayRef.current();
        return;
      }
      const state = useShowStore.getState();
      if (state.selectedItemIds.length > 0) return;
      const fs = formationsRef.current;
      const activeId = state.activeFormationId;
      const activeIdx = fs.findIndex(f => f.id === activeId);
      if (e.key === 'ArrowLeft' && activeIdx > 0) {
        e.preventDefault();
        let cum = 0;
        for (let i = 0; i < activeIdx - 1; i++) cum += fs[i].duration;
        seek(cum);
      } else if (e.key === 'ArrowRight' && activeIdx < fs.length - 1) {
        e.preventDefault();
        let cum = 0;
        for (let i = 0; i <= activeIdx; i++) cum += fs[i].duration;
        seek(cum);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setActiveFormation]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || audioTime <= 0) return;
    const px = LEFT_PADDING + audioTime * effectivePPS;
    const margin = 80;
    if (px < el.scrollLeft + margin) el.scrollLeft = Math.max(0, px - margin);
    else if (px > el.scrollLeft + el.clientWidth - margin) el.scrollLeft = px - el.clientWidth + margin;
  }, [audioTime, effectivePPS]);

  // --- Derived layout ---
  const totalDuration = formations.reduce((a, f) => a + f.duration, 0);
  const startTimes: number[] = [];
  let cum = 0;
  for (const f of formations) { startTimes.push(cum); cum += f.duration; }

  const sortedSegments = [...audioSegments].sort((a, b) => a.order_index - b.order_index);
  const segStartTimes: number[] = [];
  let segCum = 0;
  for (const s of sortedSegments) { segStartTimes.push(segCum); segCum += s.duration; }

  const totalWidth = Math.max(totalDuration + 4, 12) * effectivePPS + LEFT_PADDING * 2;
  const maxRulerT = Math.ceil(totalDuration) + 2;
  const effectiveRulerHeight = (bpm && bpm > 0) ? RULER_HEIGHT + BEAT_ROW_HEIGHT : RULER_HEIGHT;
  const tickInterval = timelineZoom < 0.4 ? 2 : timelineZoom < 0.7 ? 1 : 0.5;

  return (
    <div style={{ height: '100%', background: colors.bgNav, borderTop: `1px solid ${colors.bgCardHover}`, display: 'flex', flexDirection: 'column' }}>
      <audio
        ref={audioRef}
        onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
        onEnded={() => { setIsPlaying(false); cancelAnimationFrame(animFrameRef.current); }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <TimelineControls
        isPlaying={isPlaying}
        hasMusic={!!show?.music_url}
        audioTime={audioTime}
        audioDuration={audioDuration}
        timelineZoom={timelineZoom}
        startTimes={startTimes}
        onPlay={handlePlay}
        onSeekToTime={seekToTime}
        onZoomChange={setTimelineZoom}
        formatTime={formatTime}
      />

      {/* Scrollable timeline */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
        <div style={{ width: totalWidth, minWidth: '100%', height: '100%', position: 'relative' }}>

          <TimelineRuler
            totalWidth={totalWidth}
            effectivePPS={effectivePPS}
            bpm={bpm}
            maxRulerT={maxRulerT}
            tickInterval={tickInterval}
            effectiveRulerHeight={effectiveRulerHeight}
            onMouseDown={e => handleRulerMouseDown(e, effectivePPS)}
          />

          {/* Playhead */}
          {(audioTime > 0 || hasSeeked) && (
            <div style={{
              position: 'absolute',
              left: LEFT_PADDING + audioTime * effectivePPS,
              top: 0,
              width: 1,
              height: effectiveRulerHeight + 5 + BAR_HEIGHT,
              background: `${PURPLE}99`,
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <div style={{
                width: 7, height: 7,
                background: PURPLE,
                borderRadius: '50%',
                marginLeft: -3, marginTop: -1,
                boxShadow: `0 0 6px ${PURPLE}`,
              }} />
            </div>
          )}

          {/* Formation bars */}
          <div style={{ position: 'absolute', top: effectiveRulerHeight + 5, left: 0, width: totalWidth, height: BAR_HEIGHT + SEGMENT_ROW_HEIGHT }}>
            {formations.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.borderStrong, fontSize: 12,
              }}>
                No formations yet — click "Add" to start
              </div>
            )}

            {formations.map((f, i) => (
              <FormationBar
                key={f.id}
                formation={f}
                index={i}
                startTime={startTimes[i]}
                effectivePPS={effectivePPS}
                isActive={f.id === activeFormationId}
                isHovered={hoveredId === f.id}
                bpm={bpm}
                isBeingDragged={reorderDragRef.current?.formationId === f.id}
                presentCollaborators={collaborators.filter(c => c.user_id !== localUserId && c.active_formation_id === f.id)}
                onSetActive={(id) => { setActiveFormation(id); seek(startTimes[i]); }}
                onHoverChange={setHoveredId}
                onDurResizeStart={handleDurResizeStart}
                onTransResizeStart={handleTransResizeStart}
                onReorderStart={handleReorderStart}
              />
            ))}

            {/* Drop indicator */}
            {dropIndicatorIdx !== null && (() => {
              const x = dropIndicatorIdx >= formations.length
                ? LEFT_PADDING + totalDuration * effectivePPS
                : LEFT_PADDING + startTimes[dropIndicatorIdx] * effectivePPS;
              return (
                <div style={{
                  position: 'absolute',
                  left: x - 1, top: 0,
                  width: 2, height: BAR_HEIGHT,
                  background: PURPLE,
                  zIndex: 20,
                  borderRadius: 1,
                  boxShadow: `0 0 6px ${PURPLE}`,
                }} />
              );
            })()}

            {/* Audio segment row */}
            <div
              style={{
                position: 'absolute',
                top: BAR_HEIGHT, left: 0,
                width: '100%', height: SEGMENT_ROW_HEIGHT,
                borderTop: `1px solid ${colors.border}`,
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              {sortedSegments.map((seg, i) => (
                <AudioSegmentBar
                  key={seg.id}
                  segment={seg}
                  startTime={segStartTimes[i]}
                  effectivePPS={effectivePPS}
                  isSelected={seg.id === selectedAudioSegmentId}
                  isEditable={showAudioSegments}
                  bpm={bpm}
                  onResizeStart={(_, segmentId, startX, startDur) => {
                    segDragRef.current = { segmentId, startX, startDur };
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
