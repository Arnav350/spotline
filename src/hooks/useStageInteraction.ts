import { useState, useRef, useEffect } from 'react';
import type Konva from 'konva';
import type React from 'react';
import { useShowStore } from '../store/showStore';

interface UseStageInteractionParams {
  stageRef: React.RefObject<Konva.Stage | null>;
  panRef: React.RefObject<{ x: number; y: number }>;
  zoomRef: React.RefObject<number>;
  offsetXRef: React.RefObject<number>;
  offsetYRef: React.RefObject<number>;
  cellScaleRef: React.RefObject<number>;
}

export function useStageInteraction({
  stageRef, panRef, zoomRef,
  offsetXRef, offsetYRef, cellScaleRef,
}: UseStageInteractionParams) {
  const { setSelectedItemIds, setSelectedItem } = useShowStore();

  // --- Drag state ---
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragCanvasPos, setDragCanvasPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragWorldOffset, setDragWorldOffset] = useState<{ dx: number; dy: number } | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStartWorldPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragCanvasPosRef = useRef<{ x: number; y: number } | null>(null);

  // --- Rotation state ---
  const [rotateState, setRotateState] = useState<{
    cx: number; cy: number;
    startAngle: number;
    basePositions: Record<string, { x: number; y: number }>;
    currentAngle: number;
  } | null>(null);
  const rotateStateRef = useRef(rotateState);
  rotateStateRef.current = rotateState;

  // --- Box selection state ---
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRectDataRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const selectionAdditive = useRef(false);
  const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Box selection global mouse handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!selectionStartRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const containerRect = stage.container().getBoundingClientRect();
      const screenX = e.clientX - containerRect.left;
      const screenY = e.clientY - containerRect.top;
      const stageX = (screenX - panRef.current.x) / zoomRef.current;
      const stageY = (screenY - panRef.current.y) / zoomRef.current;
      const rect = { x1: selectionStartRef.current.x, y1: selectionStartRef.current.y, x2: stageX, y2: stageY };
      selectionRectDataRef.current = rect;
      setSelectionRect(rect);
    }

    function onMouseUp() {
      if (!selectionStartRef.current) return;
      const rect = selectionRectDataRef.current;
      if (rect) {
        const dx = Math.abs(rect.x2 - rect.x1);
        const dy = Math.abs(rect.y2 - rect.y1);
        if (dx > 5 || dy > 5) {
          const state = useShowStore.getState();
          const { performers: ps, performerPositions: pp, props: prps, propPositions: prpp, activeFormationId: afId } = state;
          const minX = Math.min(rect.x1, rect.x2);
          const maxX = Math.max(rect.x1, rect.x2);
          const minY = Math.min(rect.y1, rect.y2);
          const maxY = Math.max(rect.y1, rect.y2);
          const inBox = (pos: { x: number; y: number } | undefined) => {
            if (!pos) return false;
            const cx = offsetXRef.current + pos.x * cellScaleRef.current;
            const cy = offsetYRef.current + pos.y * cellScaleRef.current;
            return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
          };
          const performerIds = ps.filter(p => afId && inBox(pp[`${p.id}-${afId}`])).map(p => p.id);
          const propIds = prps.filter(p => afId && inBox(prpp[`${p.id}-${afId}`])).map(p => p.id);
          const allIds = [...performerIds, ...propIds];
          if (selectionAdditive.current) {
            setSelectedItemIds([...new Set([...state.selectedItemIds, ...allIds])]);
          } else {
            setSelectedItemIds(allIds);
          }
        } else {
          setSelectedItemIds([]);
          setSelectedItem(null);
        }
      }
      selectionStartRef.current = null;
      selectionRectDataRef.current = null;
      setSelectionRect(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [stageRef, panRef, zoomRef, offsetXRef, offsetYRef, cellScaleRef, setSelectedItemIds, setSelectedItem]);

  // Rotation drag global mouse handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const rs = rotateStateRef.current;
      if (!rs) return;
      const centroidScreenX = (offsetXRef.current + rs.cx * cellScaleRef.current) * zoomRef.current + panRef.current.x;
      const centroidScreenY = (offsetYRef.current + rs.cy * cellScaleRef.current) * zoomRef.current + panRef.current.y;
      const angle = Math.atan2(e.clientY - centroidScreenY, e.clientX - centroidScreenX);
      setRotateState(prev => prev ? { ...prev, currentAngle: angle - prev.startAngle } : null);
    }

    function onMouseUp() {
      const rs = rotateStateRef.current;
      if (!rs) return;
      const state = useShowStore.getState();
      const afId = state.activeFormationId;
      if (!afId) { setRotateState(null); return; }
      const cos = Math.cos(rs.currentAngle);
      const sin = Math.sin(rs.currentAngle);
      const sc = state.show!.stage_config;
      const snapStep = sc.snapToGrid
        ? { x: sc.width / sc.divisionsX / sc.subdivisionsX, y: sc.height / sc.divisionsY / sc.subdivisionsY }
        : null;
      state.selectedItemIds.forEach(id => {
        const base = rs.basePositions[id];
        if (!base) return;
        const dx = base.x - rs.cx;
        const dy = base.y - rs.cy;
        let nx = rs.cx + dx * cos - dy * sin;
        let ny = rs.cy + dx * sin + dy * cos;
        if (snapStep) {
          nx = Math.round(nx / snapStep.x) * snapStep.x;
          ny = Math.round(ny / snapStep.y) * snapStep.y;
        }
        if (state.performerPositions[`${id}-${afId}`]) {
          state.movePerformer(id, afId, nx, ny);
        } else if (state.propPositions[`${id}-${afId}`]) {
          state.moveProp(id, afId, nx, ny);
        }
      });
      state.pushHistory();
      const finalState = useShowStore.getState();
      const updates: { type: 'performer' | 'prop'; id: string; formationId: string; x: number; y: number }[] = [];
      finalState.selectedItemIds.forEach(id => {
        const perf = finalState.performerPositions[`${id}-${afId}`];
        if (perf) { updates.push({ type: 'performer', id, formationId: afId, x: perf.x, y: perf.y }); return; }
        const prop = finalState.propPositions[`${id}-${afId}`];
        if (prop) updates.push({ type: 'prop', id, formationId: afId, x: prop.x, y: prop.y });
      });
      (window as any).__spotlineBroadcastPositions?.(updates);
      setRotateState(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [panRef, zoomRef, offsetXRef, offsetYRef, cellScaleRef]);

  return {
    // Drag state
    draggingId, setDraggingId,
    dragCanvasPos, setDragCanvasPos,
    dragWorldOffset, setDragWorldOffset,
    dragStartPos, dragStartWorldPosRef, lastDragCanvasPosRef,
    // Rotation state
    rotateState, setRotateState,
    // Box selection state
    selectionStartRef, selectionRectDataRef, selectionAdditive,
    selectionRect, setSelectionRect,
  };
}
