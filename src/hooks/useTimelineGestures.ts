import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { useShowStore } from '../store/showStore';
import type { DragState } from '../components/timeline/FormationBar';
import { BASE_PPS, LEFT_PADDING, MIN_DURATION } from '../components/timeline/constants';

interface ReorderDrag {
  formationId: string;
  origIndex: number;
}

interface SegReorderDrag {
  segmentId: string;
  origIndex: number;
}

export function useTimelineGestures(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  seekToTime: (t: number) => void,
  onLoopChange: (range: { start: number; end: number } | null) => void,
  // Wider than the constant when a starting formation (see addStartFormation) reserves
  // extra gutter space at the very start of the timeline — every pixel<->time conversion
  // below needs to agree with wherever things are actually rendered.
  leftPadding: number = LEFT_PADDING,
) {
  const { updateFormation, reorderFormations, updateAudioSegment, reorderAudioSegments } = useShowStore();

  const ZOOM_KEY = 'spotline-timeline-zoom';

  const [timelineZoom, setTimelineZoomRaw] = useState(1);

  function setTimelineZoom(zoom: number) {
    setTimelineZoomRaw(zoom);
    localStorage.setItem(ZOOM_KEY, String(zoom));
  }
  const [dropIndicatorIdx, setDropIndicatorIdx] = useState<number | null>(null);
  const [segDropIndicatorIdx, setSegDropIndicatorIdx] = useState<number | null>(null);

  const effectivePPSRef = useRef(BASE_PPS * timelineZoom);
  const timelineZoomRef = useRef(timelineZoom);
  const leftPaddingRef = useRef(leftPadding);
  effectivePPSRef.current = BASE_PPS * timelineZoom;
  timelineZoomRef.current = timelineZoom;
  leftPaddingRef.current = leftPadding;

  const dragRef = useRef<DragState | null>(null);
  const segDragRef = useRef<{ segmentId: string; startX: number; startDur: number } | null>(null);
  const isSeekingRef = useRef(false);
  const reorderDragRef = useRef<ReorderDrag | null>(null);
  const dropIndicatorIdxRef = useRef<number | null>(null);
  const segReorderDragRef = useRef<SegReorderDrag | null>(null);
  const segDropIndicatorIdxRef = useRef<number | null>(null);
  // Shift+drag on the ruler draws a loop region instead of seeking.
  const loopDragRef = useRef<{ anchorT: number } | null>(null);
  const [loopDraft, setLoopDraftRaw] = useState<{ start: number; end: number } | null>(null);
  const loopDraftRef = useRef<{ start: number; end: number } | null>(null);
  function setLoopDraft(draft: { start: number; end: number } | null) {
    loopDraftRef.current = draft;
    setLoopDraftRaw(draft);
  }
  // Drives the reorder-drag drop-index math below, which must line up with the indices
  // reorderFormations expects — those are relative to the real, time-ordered formations
  // only, so the starting formation (order_index -1, see addStartFormation) is excluded
  // here too; it has no drag handle to begin a reorder from in the first place.
  const formationsRef = useRef(useShowStore.getState().formations.filter(f => f.order_index !== -1));
  const audioSegmentsRef = useRef(useShowStore.getState().audioSegments);

  // Keep formationsRef / audioSegmentsRef current on each render
  formationsRef.current = useShowStore.getState().formations.filter(f => f.order_index !== -1);
  audioSegmentsRef.current = [...useShowStore.getState().audioSegments].sort((a, b) => a.order_index - b.order_index);

  // On mount: restore saved zoom, or auto-fit if no saved value
  useEffect(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    if (saved !== null) {
      setTimelineZoomRaw(parseFloat(saved));
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    if (containerWidth === 0) return;
    const formations = useShowStore.getState().formations;
    const totalDuration = formations.reduce((a, f) => a + f.duration, 0);
    if (totalDuration === 0) return;
    const contentSeconds = Math.max(totalDuration + 4, 12);
    const zoom = (containerWidth - leftPaddingRef.current * 2) / (contentSeconds * BASE_PPS);
    setTimelineZoom(Math.max(0.15, Math.min(5, zoom)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pinch-to-zoom on timeline
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + el.scrollLeft;
      const timeAtCursor = (mouseX - leftPaddingRef.current) / effectivePPSRef.current;
      const factor = 1.04;
      const newZoom = Math.max(0.15, Math.min(5,
        e.deltaY < 0 ? timelineZoomRef.current * factor : timelineZoomRef.current / factor
      ));
      setTimelineZoom(newZoom);
      requestAnimationFrame(() => {
        el.scrollLeft = leftPaddingRef.current + timeAtCursor * BASE_PPS * newZoom - (e.clientX - rect.left);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrollRef]);

  // Global mouse handlers for resize, seek, reorder
  useEffect(() => {
    function snapDuration(raw: number): number {
      const s = useShowStore.getState();
      const currentBpm = s.show?.bpm;
      const snapToBeat = s.show?.stage_config?.snapToBeat ?? true;
      if (!snapToBeat || !currentBpm || currentBpm <= 0) return Math.round(raw * 10) / 10;
      const beatDur = 60 / currentBpm;
      return Math.max(beatDur, Math.round(raw / beatDur) * beatDur);
    }

    function onPointerMove(e: PointerEvent) {
      const sd = segDragRef.current;
      if (sd) {
        const ds = (e.clientX - sd.startX) / effectivePPSRef.current;
        updateAudioSegment(sd.segmentId, { duration: Math.max(snapDuration(0.1), snapDuration(sd.startDur + ds)) });
      }

      const drag = dragRef.current;
      if (drag) {
        const ds = (e.clientX - drag.startX) / effectivePPSRef.current;
        if (drag.type === 'dur-right') {
          updateFormation(drag.formationId, { duration: Math.max(MIN_DURATION, snapDuration(drag.startDur + ds)) });
        } else if (drag.type === 'dur-left') {
          updateFormation(drag.formationId, { duration: Math.max(MIN_DURATION, snapDuration(drag.startDur - ds)) });
        } else if (drag.type === 'trans-right') {
          const f = useShowStore.getState().formations.find(x => x.id === drag.formationId);
          const cap = f?.duration ?? drag.startDur;
          const raw = drag.startTrans + ds;
          const s = useShowStore.getState();
          const currentBpm = s.show?.bpm;
          const snapToBeat = s.show?.stage_config?.snapToBeat ?? true;
          const snapped = snapToBeat && currentBpm && currentBpm > 0
            ? Math.max(0, Math.round(raw / (60 / currentBpm)) * (60 / currentBpm))
            : Math.max(0, Math.round(raw * 10) / 10);
          updateFormation(drag.formationId, {
            transition_duration: Math.min(cap, snapped),
          });
        }
      }

      if (isSeekingRef.current) {
        const rect = scrollRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
        seekToTime((x - leftPaddingRef.current) / effectivePPSRef.current);
      }

      if (loopDragRef.current) {
        const rect = scrollRef.current?.getBoundingClientRect();
        if (rect) {
          const scrollLeft = scrollRef.current?.scrollLeft || 0;
          const mouseX = e.clientX - rect.left + scrollLeft;
          const t = Math.max(0, (mouseX - leftPaddingRef.current) / effectivePPSRef.current);
          const anchor = loopDragRef.current.anchorT;
          setLoopDraft({ start: Math.min(anchor, t), end: Math.max(anchor, t) });
        }
      }

      if (reorderDragRef.current) {
        const fs = formationsRef.current;
        const rect = scrollRef.current?.getBoundingClientRect();
        const scrollLeft = scrollRef.current?.scrollLeft || 0;
        const mouseX = e.clientX - (rect?.left || 0) + scrollLeft - leftPaddingRef.current;
        let cum = 0;
        const starts: number[] = [];
        for (const f of fs) { starts.push(cum); cum += f.duration; }
        let idx = 0;
        for (let i = 0; i < fs.length; i++) {
          const midX = (starts[i] + fs[i].duration / 2) * effectivePPSRef.current;
          if (mouseX > midX) idx = i + 1;
        }
        dropIndicatorIdxRef.current = idx;
        setDropIndicatorIdx(idx);
      }

      if (segReorderDragRef.current) {
        const segs = audioSegmentsRef.current;
        const rect = scrollRef.current?.getBoundingClientRect();
        const scrollLeft = scrollRef.current?.scrollLeft || 0;
        const mouseX = e.clientX - (rect?.left || 0) + scrollLeft - leftPaddingRef.current;
        let cum = 0;
        const starts: number[] = [];
        for (const s of segs) { starts.push(cum); cum += s.duration; }
        let idx = 0;
        for (let i = 0; i < segs.length; i++) {
          const midX = (starts[i] + segs[i].duration / 2) * effectivePPSRef.current;
          if (mouseX > midX) idx = i + 1;
        }
        segDropIndicatorIdxRef.current = idx;
        setSegDropIndicatorIdx(idx);
      }
    }

    function onPointerUp() {
      segDragRef.current = null;
      dragRef.current = null;
      isSeekingRef.current = false;
      if (loopDragRef.current) {
        loopDragRef.current = null;
        const draft = loopDraftRef.current;
        // A near-zero-width drag (a shift+click) clears the loop instead of setting a
        // sliver region nobody could have intended.
        onLoopChange(draft && draft.end - draft.start > 0.05 ? draft : null);
        setLoopDraft(null);
      }
      if (reorderDragRef.current) {
        const rd = reorderDragRef.current;
        const dropIdx = dropIndicatorIdxRef.current;
        if (dropIdx !== null && dropIdx !== rd.origIndex && dropIdx !== rd.origIndex + 1) {
          const destIndex = dropIdx > rd.origIndex ? dropIdx - 1 : dropIdx;
          reorderFormations(rd.origIndex, destIndex);
        }
        reorderDragRef.current = null;
        dropIndicatorIdxRef.current = null;
        setDropIndicatorIdx(null);
      }
      if (segReorderDragRef.current) {
        const rd = segReorderDragRef.current;
        const dropIdx = segDropIndicatorIdxRef.current;
        if (dropIdx !== null && dropIdx !== rd.origIndex && dropIdx !== rd.origIndex + 1) {
          const destIndex = dropIdx > rd.origIndex ? dropIdx - 1 : dropIdx;
          reorderAudioSegments(rd.origIndex, destIndex);
        }
        segReorderDragRef.current = null;
        segDropIndicatorIdxRef.current = null;
        setSegDropIndicatorIdx(null);
      }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [updateFormation, reorderFormations, updateAudioSegment, reorderAudioSegments, seekToTime, scrollRef, onLoopChange]);

  // --- Bar drag callbacks ---
  function handleDurResizeStart(e: React.MouseEvent, state: DragState) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { ...state, startX: e.clientX };
  }

  function handleTransResizeStart(e: React.MouseEvent, state: DragState) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { ...state, startX: e.clientX };
  }

  function handleReorderStart(_e: React.MouseEvent, formationId: string, origIndex: number) {
    reorderDragRef.current = { formationId, origIndex };
    dropIndicatorIdxRef.current = origIndex;
    setDropIndicatorIdx(origIndex);
  }

  function handleSegReorderStart(_e: React.MouseEvent, segmentId: string, origIndex: number) {
    segReorderDragRef.current = { segmentId, origIndex };
    segDropIndicatorIdxRef.current = origIndex;
    setSegDropIndicatorIdx(origIndex);
  }

  function handleRulerPointerDown(e: React.PointerEvent<HTMLDivElement>, effectivePPS: number) {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const t = Math.max(0, (x - leftPaddingRef.current) / effectivePPS);
    if (e.shiftKey) {
      loopDragRef.current = { anchorT: t };
      setLoopDraft({ start: t, end: t });
      return;
    }
    isSeekingRef.current = true;
    seekToTime(t);
  }

  return {
    timelineZoom, setTimelineZoom,
    effectivePPSRef, timelineZoomRef,
    dragRef, segDragRef, isSeekingRef, reorderDragRef,
    dropIndicatorIdx, dropIndicatorIdxRef,
    segReorderDragRef, segDropIndicatorIdx, segDropIndicatorIdxRef,
    loopDraft,
    handleDurResizeStart,
    handleTransResizeStart,
    handleReorderStart,
    handleSegReorderStart,
    handleRulerPointerDown,
  };
}
