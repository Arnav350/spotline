import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { useShowStore } from '../store/showStore';
import type { DragState } from '../components/timeline/FormationBar';
import { BASE_PPS, LEFT_PADDING, MIN_DURATION } from '../components/timeline/constants';

interface ReorderDrag {
  formationId: string;
  origIndex: number;
}

export function useTimelineGestures(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  seekToTime: (t: number) => void,
) {
  const { updateFormation, reorderFormations, updateAudioSegment } = useShowStore();

  const [timelineZoom, setTimelineZoom] = useState(1);
  const [dropIndicatorIdx, setDropIndicatorIdx] = useState<number | null>(null);

  const effectivePPSRef = useRef(BASE_PPS * timelineZoom);
  const timelineZoomRef = useRef(timelineZoom);
  effectivePPSRef.current = BASE_PPS * timelineZoom;
  timelineZoomRef.current = timelineZoom;

  const dragRef = useRef<DragState | null>(null);
  const segDragRef = useRef<{ segmentId: string; startX: number; startDur: number } | null>(null);
  const isSeekingRef = useRef(false);
  const reorderDragRef = useRef<ReorderDrag | null>(null);
  const dropIndicatorIdxRef = useRef<number | null>(null);
  const formationsRef = useRef(useShowStore.getState().formations);

  // Keep formationsRef current on each render
  formationsRef.current = useShowStore.getState().formations;

  // Pinch-to-zoom on timeline
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + el.scrollLeft;
      const timeAtCursor = (mouseX - LEFT_PADDING) / effectivePPSRef.current;
      const factor = 1.04;
      const newZoom = Math.max(0.15, Math.min(5,
        e.deltaY < 0 ? timelineZoomRef.current * factor : timelineZoomRef.current / factor
      ));
      setTimelineZoom(newZoom);
      requestAnimationFrame(() => {
        el.scrollLeft = LEFT_PADDING + timeAtCursor * BASE_PPS * newZoom - (e.clientX - rect.left);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrollRef]);

  // Global mouse handlers for resize, seek, reorder
  useEffect(() => {
    function snapDuration(raw: number): number {
      const currentBpm = useShowStore.getState().show?.bpm;
      if (!currentBpm || currentBpm <= 0) return Math.round(raw * 10) / 10;
      const beatDur = 60 / currentBpm;
      return Math.max(beatDur, Math.round(raw / beatDur) * beatDur);
    }

    function onMouseMove(e: MouseEvent) {
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
          const currentBpm = useShowStore.getState().show?.bpm;
          const snapped = currentBpm && currentBpm > 0
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
        seekToTime((x - LEFT_PADDING) / effectivePPSRef.current);
      }

      if (reorderDragRef.current) {
        const fs = formationsRef.current;
        const rect = scrollRef.current?.getBoundingClientRect();
        const scrollLeft = scrollRef.current?.scrollLeft || 0;
        const mouseX = e.clientX - (rect?.left || 0) + scrollLeft - LEFT_PADDING;
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
    }

    function onMouseUp() {
      segDragRef.current = null;
      dragRef.current = null;
      isSeekingRef.current = false;
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
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [updateFormation, reorderFormations, updateAudioSegment, seekToTime, scrollRef]);

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

  function handleRulerMouseDown(e: React.MouseEvent<HTMLDivElement>, effectivePPS: number) {
    isSeekingRef.current = true;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    seekToTime((x - LEFT_PADDING) / effectivePPS);
  }

  return {
    timelineZoom, setTimelineZoom,
    effectivePPSRef, timelineZoomRef,
    dragRef, segDragRef, isSeekingRef, reorderDragRef,
    dropIndicatorIdx, dropIndicatorIdxRef,
    handleDurResizeStart,
    handleTransResizeStart,
    handleReorderStart,
    handleRulerMouseDown,
  };
}
