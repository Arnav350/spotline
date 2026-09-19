import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import type Konva from 'konva';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from '../lib/stageHelpers.tsx';

export function useZoomPan(
  width: number,
  height: number,
  stageRef: React.RefObject<Konva.Stage | null>,
  // Public-view-only: viewers can't select/drag/rotate anything, so a plain single-finger
  // drag is unambiguous and safe to repurpose as pan; editors keep mouse-only pan (button 1/2)
  // since a single-finger/left-button drag is already their item-drag/box-select gesture.
  touchEnabled = false,
) {
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const touchStateRef = useRef<
    | { mode: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { mode: 'pinch'; startDist: number; startZoom: number; midX: number; midY: number; startPanX: number; startPanY: number }
    | null
  >(null);

  // Increments on every transform to trigger DOM overlay re-renders (rotate handle, zoom %, etc.)
  const [uiTick, setUiTick] = useState(0);

  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      let newZoom = zoomRef.current;
      let newPan = panRef.current;
      if (e.ctrlKey) {
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const oldZoom = zoomRef.current;
        newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
          e.deltaY < 0 ? oldZoom * ZOOM_FACTOR : oldZoom / ZOOM_FACTOR,
        ));
        const stageX = (pointer.x - panRef.current.x) / oldZoom;
        const stageY = (pointer.y - panRef.current.y) / oldZoom;
        newPan = { x: pointer.x - stageX * newZoom, y: pointer.y - stageY * newZoom };
      } else {
        newPan = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY };
      }
      zoomRef.current = newZoom;
      panRef.current = newPan;
      stage.scale({ x: newZoom, y: newZoom });
      stage.position(newPan);
      stage.batchDraw();
      setUiTick(t => t + 1);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [stageRef]);

  // One-finger drag = pan, two-finger pinch = zoom. Viewer-only (see touchEnabled above).
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container || !touchEnabled) return;

    function dist(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStateRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, panX: panRef.current.x, panY: panRef.current.y };
      } else if (e.touches.length === 2) {
        const rect = (container as HTMLElement).getBoundingClientRect();
        const [t0, t1] = [e.touches[0], e.touches[1]];
        touchStateRef.current = {
          mode: 'pinch',
          startDist: dist(t0, t1),
          startZoom: zoomRef.current,
          midX: (t0.clientX + t1.clientX) / 2 - rect.left,
          midY: (t0.clientY + t1.clientY) / 2 - rect.top,
          startPanX: panRef.current.x,
          startPanY: panRef.current.y,
        };
      }
    }

    function onTouchMove(e: TouchEvent) {
      const state = touchStateRef.current;
      const stage = stageRef.current;
      if (!state || !stage) return;
      e.preventDefault();
      if (state.mode === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const newPan = { x: state.panX + (t.clientX - state.startX), y: state.panY + (t.clientY - state.startY) };
        panRef.current = newPan;
        stage.position(newPan);
        stage.batchDraw();
        setUiTick(v => v + 1);
      } else if (state.mode === 'pinch' && e.touches.length === 2) {
        const [t0, t1] = [e.touches[0], e.touches[1]];
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.startZoom * (dist(t0, t1) / state.startDist)));
        const stageX = (state.midX - state.startPanX) / state.startZoom;
        const stageY = (state.midY - state.startPanY) / state.startZoom;
        const newPan = { x: state.midX - stageX * newZoom, y: state.midY - stageY * newZoom };
        zoomRef.current = newZoom;
        panRef.current = newPan;
        stage.scale({ x: newZoom, y: newZoom });
        stage.position(newPan);
        stage.batchDraw();
        setUiTick(v => v + 1);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0) {
        touchStateRef.current = null;
      } else if (e.touches.length === 1) {
        // Lifted one finger out of a pinch — resume as a single-finger pan from here.
        const t = e.touches[0];
        touchStateRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [stageRef, touchEnabled]);

  function zoomToCenter(factor: number) {
    const cx = width / 2;
    const cy = height / 2;
    const oldZoom = zoomRef.current;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
    const stageX = (cx - panRef.current.x) / oldZoom;
    const stageY = (cy - panRef.current.y) / oldZoom;
    const newPan = { x: cx - stageX * newZoom, y: cy - stageY * newZoom };
    zoomRef.current = newZoom;
    panRef.current = newPan;
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: newZoom, y: newZoom });
      stage.position(newPan);
      stage.batchDraw();
    }
    setUiTick(t => t + 1);
  }

  function handleMiddleMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  }

  function handleMiddleMouseMove(e: React.MouseEvent) {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      const newPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      panRef.current = newPan;
      const stage = stageRef.current;
      if (stage) {
        stage.position(newPan);
        stage.batchDraw();
      }
      setUiTick(t => t + 1);
    }
  }

  function handleMiddleMouseUp(e: React.MouseEvent) {
    if (e.button === 1 || e.button === 2) {
      isPanningRef.current = false;
      setUiTick(t => t + 1);
    }
  }

  return {
    zoomRef,
    panRef,
    isPanningRef,
    uiTick,
    zoomToCenter,
    handleMiddleMouseDown,
    handleMiddleMouseMove,
    handleMiddleMouseUp,
  };
}
