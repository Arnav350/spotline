import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import type Konva from 'konva';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from '../lib/stageHelpers.tsx';

export function useZoomPan(
  width: number,
  height: number,
  stageRef: React.RefObject<Konva.Stage | null>,
) {
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

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
