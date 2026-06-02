import { useRef, useEffect, useState, useCallback } from 'react';
import { useShowStore } from '../store/showStore';
import { colors, fontSize, radius, spacing } from '../lib/theme';
import { TimelineControls } from './timeline/TimelineControls';
import { TimelineRuler } from './timeline/TimelineRuler';
import { FormationBar } from './timeline/FormationBar';
import {
  BASE_PPS, BAR_HEIGHT, RULER_HEIGHT, BEAT_ROW_HEIGHT,
  LEFT_PADDING, SEGMENT_ROW_HEIGHT,
} from './timeline/constants';
import { AudioSegmentBar } from './timeline/AudioSegmentBar';
import { usePlayback } from '../hooks/usePlayback';
import { useTimelineGestures } from '../hooks/useTimelineGestures';

type PositionClipboard = {
  performers: Record<string, { x: number; y: number }>;
  props: Record<string, { x: number; y: number }>;
};

type ContextMenu = { formationId: string; x: number; y: number } | null;

export default function FormationTimeline({ showAudioSegments = false }: { showAudioSegments?: boolean }) {
  const {
    formations, activeFormationId,
    setActiveFormation, show,
    audioSegments, selectedAudioSegmentId,
    collaborators, localUserId,
    addFormation, addFormationAfter, deleteFormation,
    resetFormationToPrev, pastePositionsToFormation,
    currentUserRole,
  } = useShowStore();
  const isViewer = currentUserRole === 'viewer';
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
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [clipboard, setClipboard] = useState<PositionClipboard | null>(null);
  const clipboardRef = useRef<PositionClipboard | null>(null);
  clipboardRef.current = clipboard;
  function seek(t: number) { setHasSeeked(true); seekToTime(t); }

  const copyFormationPositions = useCallback((formationId: string) => {
    const state = useShowStore.getState();
    const cp: PositionClipboard = { performers: {}, props: {} };
    Object.entries(state.performerPositions).forEach(([key, pos]) => {
      if (key.endsWith(`-${formationId}`)) cp.performers[pos.performer_id] = { x: pos.x, y: pos.y };
    });
    Object.entries(state.propPositions).forEach(([key, pos]) => {
      if (key.endsWith(`-${formationId}`)) cp.props[pos.prop_id] = { x: pos.x, y: pos.y };
    });
    setClipboard(cp);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, formationId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ formationId, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => closeContextMenu();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [contextMenu, closeContextMenu]);

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
      const mod = e.metaKey || e.ctrlKey;
      const state = useShowStore.getState();
      if (mod && e.key === 'c') {
        const activeId = state.activeFormationId;
        if (activeId && state.selectedItemIds.length === 0 && !state.selectedItem) {
          e.preventDefault();
          copyFormationPositions(activeId);
        }
        return;
      }
      if (mod && e.key === 'v') {
        const activeId = state.activeFormationId;
        if (activeId && clipboardRef.current) {
          e.preventDefault();
          pastePositionsToFormation(activeId, clipboardRef.current);
        }
        return;
      }
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
  }, [setActiveFormation, copyFormationPositions, pastePositionsToFormation]);

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
              background: `${colors.accentLight}99`,
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <div style={{
                width: 7, height: 7,
                background: colors.accentLight,
                borderRadius: '50%',
                marginLeft: -3, marginTop: -1,
                boxShadow: `0 0 6px ${colors.accentLight}`,
              }} />
            </div>
          )}

          {/* Formation bars */}
          <div style={{ position: 'absolute', top: effectiveRulerHeight + 5, left: 0, width: totalWidth, height: BAR_HEIGHT + SEGMENT_ROW_HEIGHT }}>
            {formations.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.borderStrong, fontSize: fontSize.md,
              }}>
                No formations yet — click + to start
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
                onSetActive={() => { seek(startTimes[i]); }}
                onHoverChange={setHoveredId}
                onDurResizeStart={isViewer ? undefined : handleDurResizeStart}
                onTransResizeStart={isViewer ? undefined : handleTransResizeStart}
                onReorderStart={isViewer ? undefined : handleReorderStart}
                onContextMenu={isViewer ? undefined : handleContextMenu}
              />
            ))}

            {/* Add formation button — positioned right after last bar */}
            {!isViewer && (() => {
              const x = LEFT_PADDING + totalDuration * effectivePPS;
              return (
                <button
                  onClick={addFormation}
                  title="Add formation"
                  style={{
                    position: 'absolute',
                    left: x + 4,
                    top: 0,
                    width: BAR_HEIGHT,
                    height: BAR_HEIGHT,
                    borderRadius: radius.sm,
                    border: `2px solid ${colors.borderMed}`,
                    background: colors.bgCard,
                    color: colors.textMuted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: fontSize.xl,
                    lineHeight: 1,
                    flexShrink: 0,
                    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = colors.text;
                    e.currentTarget.style.borderColor = colors.accent;
                    e.currentTarget.style.background = colors.bgCardHover;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = colors.textMuted;
                    e.currentTarget.style.borderColor = colors.borderMed;
                    e.currentTarget.style.background = colors.bgCard;
                  }}
                >
                  +
                </button>
              );
            })()}

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
                  background: colors.accentLight,
                  zIndex: 20,
                  borderRadius: radius.xs,
                  boxShadow: `0 0 6px ${colors.accentLight}`,
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
                  index={i}
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

      {/* Formation right-click context menu */}
      {contextMenu && (() => {
        const idx = formations.findIndex(f => f.id === contextMenu.formationId);
        const fid = contextMenu.formationId;
        const canPrev = idx > 0;
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const modKey = isMac ? '⌘' : 'Ctrl';

        const menuItems: { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; action: () => void }[] = [
          {
            label: 'New formation after this',
            action: () => { addFormationAfter(fid); closeContextMenu(); },
          },
          {
            label: 'Reset to previous formation',
            disabled: !canPrev,
            action: () => { resetFormationToPrev(fid); closeContextMenu(); },
          },
          {
            label: 'Copy positions',
            shortcut: `${modKey}C`,
            action: () => { copyFormationPositions(fid); closeContextMenu(); },
          },
          {
            label: 'Paste positions',
            shortcut: `${modKey}V`,
            disabled: !clipboard,
            action: () => { if (clipboard) { pastePositionsToFormation(fid, clipboard); } closeContextMenu(); },
          },
          {
            label: 'Delete',
            danger: true,
            action: () => { deleteFormation(fid); closeContextMenu(); },
          },
        ];

        const MENU_HEIGHT = menuItems.length * 34 + 8;
        const MENU_WIDTH = 220;
        const menuTop = contextMenu.y + MENU_HEIGHT > window.innerHeight
          ? contextMenu.y - MENU_HEIGHT
          : contextMenu.y;
        const menuLeft = contextMenu.x + MENU_WIDTH > window.innerWidth
          ? contextMenu.x - MENU_WIDTH
          : contextMenu.x;

        return (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: menuLeft,
              top: menuTop,
              zIndex: 1000,
              background: colors.bgCard,
              border: `1px solid ${colors.borderMed}`,
              borderRadius: radius.sm,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              minWidth: MENU_WIDTH,
              padding: `${spacing.xs}px 0`,
            }}
          >
            {menuItems.map(item => (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={item.disabled ? undefined : item.action}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  textAlign: 'left',
                  padding: `${spacing.sm}px ${spacing.lg}px`,
                  background: 'none',
                  border: 'none',
                  fontSize: fontSize.sm,
                  color: item.disabled ? colors.textGhost : item.danger ? colors.dangerLight : colors.textSecondary,
                  cursor: item.disabled ? 'default' : 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                  gap: spacing.lg,
                }}
                onMouseEnter={e => { if (!item.disabled) { e.currentTarget.style.background = colors.bgCardHover; if (!item.danger) e.currentTarget.style.color = colors.text; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = item.disabled ? colors.textGhost : item.danger ? colors.dangerLight : colors.textSecondary; }}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span style={{ fontSize: fontSize.sm, color: colors.textGhost, flexShrink: 0 }}>
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
