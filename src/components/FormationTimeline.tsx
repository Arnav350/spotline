import { useRef, useEffect, useState, useCallback } from 'react';
import { useShowStore } from '../store/showStore';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';
import { TimelineControls } from './timeline/TimelineControls';
import { TimelineRuler } from './timeline/TimelineRuler';
import { FormationBar } from './timeline/FormationBar';
import {
  BASE_PPS, BAR_HEIGHT, RULER_HEIGHT, BEAT_ROW_HEIGHT,
  LEFT_PADDING, SEGMENT_ROW_HEIGHT, BAR_GAP, TRANS_BAR_HEIGHT,
} from './timeline/constants';
import { AudioSegmentBar } from './timeline/AudioSegmentBar';
import { usePlayback } from '../hooks/usePlayback';
import { useTimelineGestures } from '../hooks/useTimelineGestures';

type ContextMenu = { formationId: string; x: number; y: number } | null;

export default function FormationTimeline({ showAudioSegments = false }: { showAudioSegments?: boolean }) {
  const {
    formations, activeFormationId,
    setActiveFormation, show,
    audioSegments, selectedAudioSegmentId,
    collaborators, localUserId,
    addFormation, addFormationAfter, deleteFormation,
    resetFormationToPrev,
    currentUserRole,
  } = useShowStore();
  const isViewer = currentUserRole === 'viewer';
  const bpm = show?.bpm;

  // The starting formation (order_index -1, see addStartFormation) is a separate, always-
  // reachable-by-id pose held at t=0, not part of the time-ordered sequence the rest of
  // this file's math (startTimes/tick/seeking) operates over.
  const startFormation = formations.find(f => f.order_index === -1);
  const timelineFormations = formations.filter(f => f.order_index !== -1);
  // Reserve a fixed pixel gutter (not a time range — see the "negative numbers" question
  // this came from) at the very start for the starting-formation tile. Everything that
  // would normally sit at LEFT_PADDING shifts right by the same fixed amount together, so
  // the ruler's "0s" tick and the first real formation stay aligned with each other.
  const START_GUTTER = BAR_HEIGHT + BAR_GAP;
  const contentLeftPad = startFormation ? LEFT_PADDING + START_GUTTER : LEFT_PADDING;

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Playback ---
  const {
    isPlaying,
    audioTime, setAudioTime,
    audioDuration,
    formationsRef,
    handlePlay,
    seekToTime,
    formatTime,
    loopEnabled, loopRange,
    setLoopRange, toggleLoopEnabled,
  } = usePlayback();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasSeeked, setHasSeeked] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  function seek(t: number) { setHasSeeked(true); seekToTime(t); }


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
    segReorderDragRef,
    segDropIndicatorIdx,
    handleDurResizeStart,
    handleTransResizeStart,
    handleReorderStart,
    handleSegReorderStart,
    handleRulerPointerDown,
    loopDraft,
  } = useTimelineGestures(scrollRef, seek, setLoopRange, contentLeftPad);

  const effectivePPS = BASE_PPS * timelineZoom;

  // Keep formationsRef current — the starting formation is deliberately excluded (see above).
  formationsRef.current = timelineFormations;

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
      if (mod && e.key === 'c' && state.selectedItemIds.length === 0 && !state.selectedItem) {
        e.preventDefault();
        state.selectAllItems();
        state.copySelectedPerformers();
        state.setSelectedItemIds([]);
        return;
      }
      if (state.selectedItemIds.length > 0) return;
      const fs = formationsRef.current;
      const sf = state.formations.find(f => f.order_index === -1);
      const activeId = state.activeFormationId;
      const isOnStart = !!sf && activeId === sf.id;
      const activeIdx = fs.findIndex(f => f.id === activeId);
      if (e.key === 'ArrowLeft') {
        if (isOnStart) return; // already at the very beginning
        if (activeIdx === 0 && sf) {
          // The starting formation has no time of its own to seek to — select it directly.
          e.preventDefault();
          setHasSeeked(true);
          setAudioTime(0);
          setActiveFormation(sf.id, 0.3);
        } else if (activeIdx > 0) {
          e.preventDefault();
          let cum = 0;
          for (let i = 0; i < activeIdx - 1; i++) cum += fs[i].duration;
          seek(cum);
        }
      } else if (e.key === 'ArrowRight') {
        if (isOnStart) {
          if (fs.length > 0) { e.preventDefault(); seek(0); }
        } else if (activeIdx >= 0 && activeIdx < fs.length - 1) {
          e.preventDefault();
          let cum = 0;
          for (let i = 0; i <= activeIdx; i++) cum += fs[i].duration;
          seek(cum);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setActiveFormation]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || audioTime <= 0) return;
    const px = contentLeftPad + audioTime * effectivePPS;
    const margin = 80;
    if (px < el.scrollLeft + margin) el.scrollLeft = Math.max(0, px - margin);
    else if (px > el.scrollLeft + el.clientWidth - margin) el.scrollLeft = px - el.clientWidth + margin;
  }, [audioTime, effectivePPS]);

  // --- Derived layout ---
  const totalDuration = timelineFormations.reduce((a, f) => a + f.duration, 0);
  const startTimes: number[] = [];
  let cum = 0;
  for (const f of timelineFormations) { startTimes.push(cum); cum += f.duration; }

  const sortedSegments = [...audioSegments].sort((a, b) => a.order_index - b.order_index);
  const segStartTimes: number[] = [];
  let segCum = 0;
  for (const s of sortedSegments) { segStartTimes.push(segCum); segCum += s.duration; }

  const totalWidth = Math.max(totalDuration + 4, 12) * effectivePPS + contentLeftPad + LEFT_PADDING;
  const maxRulerT = Math.ceil(totalDuration) + 2;
  const effectiveRulerHeight = (bpm && bpm > 0) ? RULER_HEIGHT + BEAT_ROW_HEIGHT : RULER_HEIGHT;
  const tickInterval = timelineZoom < 0.4 ? 2 : timelineZoom < 0.7 ? 1 : 0.5;

  return (
    <div style={{ height: '100%', background: colors.bgNav, borderTop: `1px solid ${colors.bgCardHover}`, display: 'flex', flexDirection: 'column' }}>
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
        loopEnabled={loopEnabled}
        hasLoopRange={loopRange !== null}
        onToggleLoop={toggleLoopEnabled}
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
            onPointerDown={e => handleRulerPointerDown(e, effectivePPS)}
            loopRange={loopRange}
            loopDraft={loopDraft}
            loopEnabled={loopEnabled}
            leftPadding={contentLeftPad}
          />

          {/* Starting formation — part of the timeline (scrolls with everything else),
              sitting in the fixed pixel gutter reserved above rather than on the time
              axis itself; see addStartFormation and contentLeftPad. */}
          {startFormation && (
            <button
              onClick={() => {
                setHasSeeked(true);
                setAudioTime(0);
                // A short transition like any other formation gets on a paused click
                // (see seekToTime), not an instant snap.
                setActiveFormation(startFormation.id, 0.3);
              }}
              onContextMenu={isViewer ? undefined : e => handleContextMenu(e, startFormation.id)}
              title="Starting position — held at t=0, before the song starts"
              style={{
                position: 'absolute',
                left: LEFT_PADDING,
                top: effectiveRulerHeight + 5,
                width: BAR_HEIGHT,
                height: BAR_HEIGHT,
                borderRadius: radius.sm,
                border: `2px solid ${activeFormationId === startFormation.id ? colors.textSecondary : colors.borderMed}`,
                background: colors.bgCard,
                cursor: 'pointer',
                overflow: 'hidden',
                zIndex: 2,
              }}
            >
              {/* Bottom strip — no transition of its own, but matches the band every
                  other formation bar has there, so this doesn't read as "missing a part"
                  next to them. */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: TRANS_BAR_HEIGHT,
                background: colors.bgNav,
              }} />
              <span style={{
                position: 'absolute',
                top: 6,
                left: 14,
                right: 4,
                color: activeFormationId === startFormation.id ? colors.text : colors.textSecondary,
                fontSize: fontSize.sm,
                fontWeight: fontWeight.medium,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>{startFormation.name}</span>
            </button>
          )}

          {/* Playhead */}
          {(audioTime > 0 || hasSeeked) && (
            <div style={{
              position: 'absolute',
              left: contentLeftPad + audioTime * effectivePPS,
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

          {/* Song-end marker */}
          {audioDuration > 0 && audioDuration < totalDuration && (
            <div style={{
              position: 'absolute',
              left: contentLeftPad + audioDuration * effectivePPS,
              top: 0,
              width: 1,
              height: effectiveRulerHeight + 5 + BAR_HEIGHT,
              background: colors.borderStrong,
              opacity: 0.6,
              pointerEvents: 'none',
              zIndex: 9,
            }} />
          )}

          {/* Formation bars */}
          <div style={{ position: 'absolute', top: effectiveRulerHeight + 5, left: 0, width: totalWidth, height: BAR_HEIGHT + SEGMENT_ROW_HEIGHT }}>
            {timelineFormations.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.borderStrong, fontSize: fontSize.md,
              }}>
                No formations yet — click + to start
              </div>
            )}

            {timelineFormations.map((f, i) => (
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
                onSetActive={() => seek(startTimes[i])}
                onHoverChange={setHoveredId}
                onDurResizeStart={isViewer ? undefined : handleDurResizeStart}
                onTransResizeStart={isViewer ? undefined : handleTransResizeStart}
                onReorderStart={isViewer ? undefined : handleReorderStart}
                onContextMenu={isViewer ? undefined : handleContextMenu}
                leftPadding={contentLeftPad}
              />
            ))}

            {/* Add formation button — positioned right after last bar */}
            {!isViewer && (() => {
              const x = contentLeftPad + totalDuration * effectivePPS;
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
              const x = dropIndicatorIdx >= timelineFormations.length
                ? contentLeftPad + totalDuration * effectivePPS
                : contentLeftPad + startTimes[dropIndicatorIdx] * effectivePPS;
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
                  isBeingDragged={segReorderDragRef.current?.segmentId === seg.id}
                  bpm={bpm}
                  onResizeStart={(_, segmentId, startX, startDur) => {
                    segDragRef.current = { segmentId, startX, startDur };
                  }}
                  onReorderStart={showAudioSegments ? handleSegReorderStart : undefined}
                  leftPadding={contentLeftPad}
                />
              ))}

              {/* Segment drop indicator */}
              {segDropIndicatorIdx !== null && (() => {
                const x = segDropIndicatorIdx >= sortedSegments.length
                  ? contentLeftPad + segCum * effectivePPS
                  : contentLeftPad + segStartTimes[segDropIndicatorIdx] * effectivePPS;
                return (
                  <div style={{
                    position: 'absolute',
                    left: x - 1, top: 0,
                    width: 2, height: SEGMENT_ROW_HEIGHT,
                    background: colors.accentLight,
                    zIndex: 20,
                    borderRadius: radius.xs,
                    boxShadow: `0 0 6px ${colors.accentLight}`,
                  }} />
                );
              })()}
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
            action: () => { const s = useShowStore.getState(); s.selectAllItems(); s.copySelectedPerformers(); s.setSelectedItemIds([]); closeContextMenu(); },
          },
          {
            label: 'Paste positions',
            shortcut: `${modKey}V`,
            action: () => { setActiveFormation(fid); useShowStore.getState().pastePerformers(); closeContextMenu(); },
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
