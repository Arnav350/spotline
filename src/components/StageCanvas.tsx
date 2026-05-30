import React, { useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text } from 'react-konva';
import { useShowStore } from '../store/showStore';
import Konva from 'konva';
import { Magnet, RotateCw } from 'lucide-react';
import { colors, fontSize, fontWeight, radius } from '../lib/theme';
import {
  CANVAS_PADDING, PERFORMER_RADIUS,
  interpolatePosition, worldToCanvas, canvasToWorld, snapWorld, drawShape, applyEasing,
  type AnimatedPosition,
} from '../lib/stageHelpers.tsx';
import { useZoomPan } from '../hooks/useZoomPan';
import { useStageInteraction } from '../hooks/useStageInteraction';

interface CanvasProps {
  width: number;
  height: number;
  showStageDimensions?: boolean;
}

export default function StageCanvas({ width, height, showStageDimensions }: CanvasProps) {
  const {
    show,
    formations,
    performers,
    props,
    performerPositions,
    propPositions,
    performerPaths,
    activeFormationId,
    isAnimating,
    rawAnimProgress,
    animFromFormationId,
    selectedItemIds,
    setSelectedItemIds,
    toggleItemSelected,
    movePerformer,
    moveProp,
    pushHistory,
    setPerformerPath,
    clearPerformerPath,
    updateStageConfig,
  } = useShowStore();

  const activeFormation = formations.find(f => f.id === activeFormationId);
  const animating = isAnimating;
  const previousFormationId = animFromFormationId;
  const animationProgress = applyEasing(rawAnimProgress, activeFormation?.transition_easing);

  const stageRef = useRef<Konva.Stage>(null);

  // --- Layout ---
  const stageConfig = show?.stage_config || { width: 60, height: 40, divisionsX: 5, divisionsY: 5, subdivisionsX: 2, subdivisionsY: 2, unit: 'ft' };
  const availableWidth = width - CANVAS_PADDING * 2;
  const availableHeight = height - CANVAS_PADDING * 2;
  const scaleX = availableWidth / stageConfig.width;
  const scaleY = availableHeight / stageConfig.height;
  const cellScale = Math.min(scaleX, scaleY);
  const stagePixelWidth = stageConfig.width * cellScale;
  const stagePixelHeight = stageConfig.height * cellScale;
  const offsetX = (width - stagePixelWidth) / 2;
  const offsetY = (height - stagePixelHeight) / 2;

  // Stable refs for layout values used inside effects/callbacks
  const cellScaleRef = useRef(cellScale);
  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);
  cellScaleRef.current = cellScale;
  offsetXRef.current = offsetX;
  offsetYRef.current = offsetY;

  // Convenience wrappers that close over current layout
  const toCanvas = (x: number, y: number) => worldToCanvas(x, y, offsetX, offsetY, cellScale);
  const toWorld = (cx: number, cy: number) => canvasToWorld(cx, cy, offsetX, offsetY, cellScale);
  const snap = (x: number, y: number) => snapWorld(x, y, stageConfig);

  // --- Zoom / pan ---
  const {
    zoom, setZoom, pan, setPan,
    zoomRef, panRef, isPanningRef,
    zoomToCenter,
    handleMiddleMouseDown,
    handleMiddleMouseMove,
    handleMiddleMouseUp,
  } = useZoomPan(width, height, stageRef);

  // --- Selection, drag, rotation ---
  const {
    draggingId, setDraggingId,
    dragCanvasPos, setDragCanvasPos,
    dragWorldOffset, setDragWorldOffset,
    dragStartPos, dragStartWorldPosRef, lastDragCanvasPosRef,
    rotateState, setRotateState,
    selectionStartRef, selectionRectDataRef, selectionAdditive,
    selectionRect, setSelectionRect,
  } = useStageInteraction({ stageRef, panRef, zoomRef, offsetXRef, offsetYRef, cellScaleRef });

  // --- Helpers ---
  const getPosition = useCallback((entityId: string, formationId: string, isPerformer: boolean) => {
    const positions = isPerformer ? performerPositions : propPositions;
    return positions[`${entityId}-${formationId}`] || null;
  }, [performerPositions, propPositions]);

  function getAnimatedPosition(entityId: string, isPerformer: boolean): AnimatedPosition | null {
    if (!activeFormationId) return null;
    const currentPos = getPosition(entityId, activeFormationId, isPerformer);
    if (!currentPos) return null;
    if (animating && previousFormationId) {
      const prevPos = getPosition(entityId, previousFormationId, isPerformer);
      if (prevPos) {
        let cp: { x: number; y: number } | null = null;
        if (isPerformer) {
          const stored = performerPaths[`${entityId}-${previousFormationId}-${activeFormationId}`];
          if (stored) {
            const mx = (prevPos.x + currentPos.x) / 2;
            const my = (prevPos.y + currentPos.y) / 2;
            cp = { x: mx + stored.cpDx, y: my + stored.cpDy };
          }
        }
        return interpolatePosition(prevPos, currentPos, animationProgress, cp);
      }
    }
    return { x: currentPos.x, y: currentPos.y };
  }

  // Shared delta-move logic for group drags (moves all selected items by the same offset)
  function applyGroupDragDelta(primaryId: string, activeFormationId: string, dx: number, dy: number) {
    const state = useShowStore.getState();
    state.selectedItemIds.forEach(otherId => {
      if (otherId === primaryId) return;
      const perfPos = state.performerPositions[`${otherId}-${activeFormationId}`];
      if (perfPos) {
        movePerformer(otherId, activeFormationId, perfPos.x + dx, perfPos.y + dy);
        return;
      }
      const pPos = state.propPositions[`${otherId}-${activeFormationId}`];
      if (pPos) {
        moveProp(otherId, activeFormationId, pPos.x + dx, pPos.y + dy);
      }
    });
  }

  // --- Derived values ---
  const activeIdx = formations.findIndex(f => f.id === activeFormationId);
  const prevFormId = activeIdx > 0 ? formations[activeIdx - 1].id : null;
  const performerSize = Math.max(8, Math.min(PERFORMER_RADIUS, cellScale * 0.9));

  // --- Grid ---
  const divCountX = Math.max(1, stageConfig.divisionsX);
  const divCountY = Math.max(1, stageConfig.divisionsY);
  const subCountX = Math.max(1, stageConfig.subdivisionsX);
  const subCountY = Math.max(1, stageConfig.subdivisionsY);
  const divSpacingX = stageConfig.width / divCountX;
  const divSpacingY = stageConfig.height / divCountY;
  const subSpacingX = divSpacingX / subCountX;
  const subSpacingY = divSpacingY / subCountY;
  const numSubX = Math.round(stageConfig.width / subSpacingX);
  const numSubY = Math.round(stageConfig.height / subSpacingY);

  const gridLines: React.ReactNode[] = [];
  for (let xi = 0; xi <= numSubX; xi++) {
    const x = xi * subSpacingX;
    const isMajor = xi % subCountX === 0;
    const cx = offsetX + x * cellScale;
    gridLines.push(
      <Line key={`vg-${xi}`} points={[cx, offsetY, cx, offsetY + stagePixelHeight]}
        stroke={isMajor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)'}
        strokeWidth={isMajor ? 1 : 0.5} listening={false} />
    );
  }
  for (let yi = 0; yi <= numSubY; yi++) {
    const y = yi * subSpacingY;
    const isMajor = yi % subCountY === 0;
    const cy = offsetY + y * cellScale;
    gridLines.push(
      <Line key={`hg-${yi}`} points={[offsetX, cy, offsetX + stagePixelWidth, cy]}
        stroke={isMajor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)'}
        strokeWidth={isMajor ? 1 : 0.5} listening={false} />
    );
  }

  const gridLabels: React.ReactNode[] = [];
  for (let di = 0; di <= divCountX; di++) {
    const x = di * divSpacingX;
    const cx = offsetX + x * cellScale;
    const label = di - divCountX / 2;
    gridLabels.push(
      <Text key={`xl-${di}`} x={cx - 15} y={offsetY + stagePixelHeight + 6}
        text={Number.isInteger(label) ? String(label) : label.toFixed(1)}
        fontSize={9} fill="rgba(255,255,255,0.25)" width={30} align="center" listening={false} />
    );
  }
  for (let di = 0; di <= divCountY; di++) {
    const y = di * divSpacingY;
    const cy = offsetY + y * cellScale;
    const label = di - divCountY / 2;
    gridLabels.push(
      <Text key={`yl-${di}`} x={offsetX - 28} y={cy - 5}
        text={Number.isInteger(label) ? String(label) : label.toFixed(1)}
        fontSize={9} fill="rgba(255,255,255,0.25)" width={24} align="right" listening={false} />
    );
  }

  // --- Ghost overlay (previous formation positions + bezier path handles) ---
  const ghostOverlays: React.ReactNode[] = [];
  if (!animating && prevFormId && selectedItemIds.length > 0) {
    selectedItemIds.forEach(pid => {
      const performer = performers.find(p => p.id === pid);
      if (!performer) return;
      const prevPos = getPosition(pid, prevFormId, true);
      const currPos = getPosition(pid, activeFormationId!, true);
      if (!prevPos || !currPos) return;
      const ghost = toCanvas(prevPos.x, prevPos.y);
      const curr = toCanvas(currPos.x, currPos.y);

      const mx = (prevPos.x + currPos.x) / 2;
      const my = (prevPos.y + currPos.y) / 2;
      const stored = performerPaths[`${pid}-${prevFormId}-${activeFormationId}`];
      const cp = stored ? { x: mx + stored.cpDx, y: my + stored.cpDy } : { x: mx, y: my };
      const handleWorld = stored ? { x: mx + stored.cpDx / 2, y: my + stored.cpDy / 2 } : { x: mx, y: my };
      const cpCanvas = toCanvas(handleWorld.x, handleWorld.y);

      // Bezier as polyline (20 segments)
      const lineEnd = (dragCanvasPos?.id === pid) ? { x: dragCanvasPos.x, y: dragCanvasPos.y } : curr;
      const SEGMENTS = 20;
      const pts: number[] = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const u = 1 - t;
        const wx = u * u * prevPos.x + 2 * u * t * cp.x + t * t * (dragCanvasPos?.id === pid ? toWorld(lineEnd.x, lineEnd.y).x : currPos.x);
        const wy = u * u * prevPos.y + 2 * u * t * cp.y + t * t * (dragCanvasPos?.id === pid ? toWorld(lineEnd.x, lineEnd.y).y : currPos.y);
        const pt = toCanvas(wx, wy);
        pts.push(pt.x, pt.y);
      }

      ghostOverlays.push(
        <Line key={`ghost-line-${pid}`} points={pts}
          stroke={performer.color} strokeWidth={1.5} dash={[4, 6]} opacity={0.4} listening={false} />
      );
      ghostOverlays.push(
        drawShape(performer, ghost.x, ghost.y, performerSize, false, false,
          () => {}, () => {}, () => {},
          `ghost-${performer.id}`, false, 0.22)
      );
      // Draggable bezier control-point handle
      ghostOverlays.push(
        <Circle
          key={`path-handle-${pid}`}
          x={cpCanvas.x} y={cpCanvas.y}
          radius={5} fill={performer.color}
          stroke="rgba(255,255,255,0.4)" strokeWidth={1}
          opacity={0.85} draggable
          onMouseDown={e => { e.cancelBubble = true; }}
          onDragMove={e => {
            e.cancelBubble = true;
            const h = toWorld(e.target.x(), e.target.y());
            setPerformerPath(pid, prevFormId, activeFormationId!, 2 * (h.x - mx), 2 * (h.y - my));
          }}
          onDblClick={e => {
            e.cancelBubble = true;
            clearPerformerPath(pid, prevFormId, activeFormationId!);
          }}
        />
      );
    });
  }

  // --- Rotate handle position (screen coords) ---
  const rotateHandle = (() => {
    if (selectedItemIds.length < 2 || !activeFormationId || animating) return null;
    const positions = selectedItemIds.map(id => {
      const p = rotateState?.basePositions[id] ?? performerPositions[`${id}-${activeFormationId}`] ?? propPositions[`${id}-${activeFormationId}`];
      return p ?? null;
    }).filter((p): p is { x: number; y: number } => p !== null);
    if (positions.length < 2) return null;
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    const maxR = Math.max(...positions.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)));
    const offsetPx = Math.max(28, maxR * cellScale * zoom + 18);
    const screenX = (offsetX + cx * cellScale) * zoom + pan.x;
    const screenY = (offsetY + cy * cellScale) * zoom + pan.y - offsetPx;
    return { screenX, screenY, cx, cy };
  })();

  // --- Container mouse handlers ---
  function handleContainerMouseDown(e: React.MouseEvent) {
    handleMiddleMouseDown(e);
  }

  function handleContainerMouseMove(e: React.MouseEvent) {
    handleMiddleMouseMove(e);
  }

  function handleContainerMouseUp(e: React.MouseEvent) {
    handleMiddleMouseUp(e);
  }

  return (
    <div
      style={{ position: 'relative', width, height, overflow: 'hidden' }}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={() => { isPanningRef.current = false; }}
      onContextMenu={e => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
        style={{ cursor: isPanningRef.current ? 'grabbing' : selectionRect ? 'crosshair' : 'default' }}
        onMouseDown={(e) => {
          if (e.evt.button !== 0) return;
          if (e.target !== e.target.getStage() && !e.target.hasName('stage-bg')) return;
          selectionAdditive.current = e.evt.metaKey || e.evt.ctrlKey;
          const pos = stageRef.current!.getRelativePointerPosition()!;
          selectionStartRef.current = pos;
          selectionRectDataRef.current = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
          setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
        }}
      >
        <Layer>
          <Rect x={-pan.x / zoom} y={-pan.y / zoom} width={width / zoom} height={height / zoom} fill={colors.bg} name="stage-bg" listening={true} />

          {/* Stage floor */}
          <Rect x={offsetX} y={offsetY} width={stagePixelWidth} height={stagePixelHeight}
            fill={colors.bgCard} stroke={`rgba(139,92,246,0.45)`} strokeWidth={1.5} listening={false} />

          {gridLines}

          {/* BACKSTAGE label */}
          <Text
            x={offsetX} y={offsetY - 20}
            width={stagePixelWidth} align="center"
            text="BACKSTAGE"
            fontSize={9} fontFamily="Inter, sans-serif"
            fill="rgba(255,255,255,0.28)" fontStyle="600"
            letterSpacing={2} listening={false}
          />

          {gridLabels}

          {/* Props */}
          {props.map(prop => {
            const pos = getAnimatedPosition(prop.id, false);
            if (!pos || !activeFormationId) return null;
            const isSelected = selectedItemIds.includes(prop.id);
            const isDragging = draggingId === prop.id;

            let propPos = { x: pos.x, y: pos.y };
            if (rotateState && isSelected && rotateState.basePositions[prop.id]) {
              const base = rotateState.basePositions[prop.id];
              const dx = base.x - rotateState.cx;
              const dy = base.y - rotateState.cy;
              const cos = Math.cos(rotateState.currentAngle);
              const sin = Math.sin(rotateState.currentAngle);
              propPos = { x: rotateState.cx + dx * cos - dy * sin, y: rotateState.cy + dx * sin + dy * cos };
            } else if (!isDragging && isSelected && draggingId && dragWorldOffset) {
              propPos = { x: pos.x + dragWorldOffset.dx, y: pos.y + dragWorldOffset.dy };
            }
            const { x, y } = toCanvas(propPos.x, propPos.y);
            const propW = (prop.width ?? prop.size ?? 2) * cellScale * 0.5;
            const propD = (prop.depth ?? prop.size ?? 2) * cellScale * 0.5;

            function onPropDragStart() {
              dragStartPos.current = { x: pos!.x, y: pos!.y };
              dragStartWorldPosRef.current = { x: pos!.x, y: pos!.y };
              lastDragCanvasPosRef.current = null;
              setDraggingId(prop.id);
              if (!selectedItemIds.includes(prop.id)) setSelectedItemIds([prop.id]);
            }

            function onPropDragEnd(cx: number, cy: number, node: Konva.Node) {
              setDraggingId(null);
              setDragCanvasPos(null);
              setDragWorldOffset(null);
              lastDragCanvasPosRef.current = null;
              const world = toWorld(cx, cy);
              const snapped = snap(world.x, world.y);
              const snappedCanvas = toCanvas(snapped.x, snapped.y);
              node.position(snappedCanvas);
              node.getLayer()?.batchDraw();
              const actualDx = snapped.x - (dragStartPos.current?.x ?? pos!.x);
              const actualDy = snapped.y - (dragStartPos.current?.y ?? pos!.y);
              moveProp(prop.id, activeFormationId!, snapped.x, snapped.y);
              applyGroupDragDelta(prop.id, activeFormationId!, actualDx, actualDy);
              pushHistory();
              const s = useShowStore.getState();
              const afId = activeFormationId!;
              const updates: { type: 'performer' | 'prop'; id: string; formationId: string; x: number; y: number }[] = [];
              s.selectedItemIds.forEach(id => {
                const perf = s.performerPositions[`${id}-${afId}`];
                if (perf) { updates.push({ type: 'performer', id, formationId: afId, x: perf.x, y: perf.y }); return; }
                const prop_ = s.propPositions[`${id}-${afId}`];
                if (prop_) updates.push({ type: 'prop', id, formationId: afId, x: prop_.x, y: prop_.y });
              });
              (window as any).__spotlineBroadcastPositions?.(updates);
            }

            function onPropClick(e: Konva.KonvaEventObject<MouseEvent>) {
              e.cancelBubble = true;
              if (e.evt.metaKey || e.evt.ctrlKey) {
                toggleItemSelected(prop.id);
              } else {
                setSelectedItemIds([prop.id]);
              }
            }

            function onPropDragMove(cx: number, cy: number) {
              lastDragCanvasPosRef.current = { x: cx, y: cy };
              setDragCanvasPos({ id: prop.id, x: cx, y: cy });
              if (dragStartWorldPosRef.current) {
                const currentWorld = toWorld(cx, cy);
                setDragWorldOffset({
                  dx: currentWorld.x - dragStartWorldPosRef.current.x,
                  dy: currentWorld.y - dragStartWorldPosRef.current.y,
                });
              }
            }

            return drawShape(prop, x, y, Math.max(8, propW), isSelected, isDragging,
              onPropDragStart, onPropDragEnd, onPropClick,
              `prop-${prop.id}`, true, undefined, onPropDragMove, Math.max(8, propD),
            );
          })}

          {/* Ghost overlay (previous formation positions) */}
          {ghostOverlays}

          {/* Performers */}
          {performers.map(performer => {
            const basePos = getAnimatedPosition(performer.id, true);
            if (!basePos || !activeFormationId) return null;
            const isSelected = selectedItemIds.includes(performer.id);
            const isDragging = draggingId === performer.id;

            let pos: { x: number; y: number };
            if (rotateState && isSelected && rotateState.basePositions[performer.id]) {
              const base = rotateState.basePositions[performer.id];
              const dx = base.x - rotateState.cx;
              const dy = base.y - rotateState.cy;
              const cos = Math.cos(rotateState.currentAngle);
              const sin = Math.sin(rotateState.currentAngle);
              pos = { x: rotateState.cx + dx * cos - dy * sin, y: rotateState.cy + dx * sin + dy * cos };
            } else if (!isDragging && isSelected && draggingId && dragWorldOffset) {
              pos = { x: basePos.x + dragWorldOffset.dx, y: basePos.y + dragWorldOffset.dy };
            } else {
              pos = basePos;
            }
            const { x, y } = toCanvas(pos.x, pos.y);

            function onPerformerDragStart() {
              dragStartPos.current = { x: basePos!.x, y: basePos!.y };
              dragStartWorldPosRef.current = { x: basePos!.x, y: basePos!.y };
              lastDragCanvasPosRef.current = null;
              setDraggingId(performer.id);
              setDragCanvasPos({ id: performer.id, x, y });
              if (!selectedItemIds.includes(performer.id)) {
                setSelectedItemIds([performer.id]);
              }
            }

            function onPerformerDragEnd(cx: number, cy: number, node: Konva.Node) {
              const startWorld = dragStartWorldPosRef.current;
              const worldOff = dragWorldOffset;
              const world = (startWorld && worldOff)
                ? { x: startWorld.x + worldOff.dx, y: startWorld.y + worldOff.dy }
                : lastDragCanvasPosRef.current
                  ? toWorld(lastDragCanvasPosRef.current.x, lastDragCanvasPosRef.current.y)
                  : toWorld(cx, cy);

              setDraggingId(null);
              setDragCanvasPos(null);
              setDragWorldOffset(null);
              lastDragCanvasPosRef.current = null;

              const snapped = snap(world.x, world.y);
              const snappedCanvas = toCanvas(snapped.x, snapped.y);
              node.position(snappedCanvas);
              node.getLayer()?.batchDraw();
              const actualDx = snapped.x - basePos!.x;
              const actualDy = snapped.y - basePos!.y;
              movePerformer(performer.id, activeFormationId!, snapped.x, snapped.y);
              applyGroupDragDelta(performer.id, activeFormationId!, actualDx, actualDy);
              pushHistory();
              const s = useShowStore.getState();
              const afId = activeFormationId!;
              const updates: { type: 'performer' | 'prop'; id: string; formationId: string; x: number; y: number }[] = [];
              s.selectedItemIds.forEach(id => {
                const perf = s.performerPositions[`${id}-${afId}`];
                if (perf) { updates.push({ type: 'performer', id, formationId: afId, x: perf.x, y: perf.y }); return; }
                const prop_ = s.propPositions[`${id}-${afId}`];
                if (prop_) updates.push({ type: 'prop', id, formationId: afId, x: prop_.x, y: prop_.y });
              });
              (window as any).__spotlineBroadcastPositions?.(updates);
            }

            function onPerformerClick(e: Konva.KonvaEventObject<MouseEvent>) {
              e.cancelBubble = true;
              if (e.evt.metaKey || e.evt.ctrlKey) {
                toggleItemSelected(performer.id);
              } else {
                setSelectedItemIds([performer.id]);
              }
            }

            function onPerformerDragMove(cx: number, cy: number) {
              lastDragCanvasPosRef.current = { x: cx, y: cy };
              setDragCanvasPos({ id: performer.id, x: cx, y: cy });
              if (dragStartWorldPosRef.current) {
                const currentWorld = toWorld(cx, cy);
                setDragWorldOffset({
                  dx: currentWorld.x - dragStartWorldPosRef.current.x,
                  dy: currentWorld.y - dragStartWorldPosRef.current.y,
                });
              }
            }

            return drawShape(performer, x, y, performerSize, isSelected, isDragging,
              onPerformerDragStart, onPerformerDragEnd, onPerformerClick,
              `performer-${performer.id}`, true, undefined, onPerformerDragMove,
            );
          })}

          {/* Box selection rect */}
          {selectionRect && (
            <Rect
              x={Math.min(selectionRect.x1, selectionRect.x2)}
              y={Math.min(selectionRect.y1, selectionRect.y2)}
              width={Math.abs(selectionRect.x2 - selectionRect.x1)}
              height={Math.abs(selectionRect.y2 - selectionRect.y1)}
              fill={`${colors.accent}14`}
              stroke={`${colors.accent}80`}
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 4 / zoom]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <button
          onClick={() => zoomToCenter(1.25)}
          style={{ width: 26, height: 26, background: colors.bgCard, border: `1px solid ${colors.borderMed}`, borderRadius: radius.md, color: colors.textSecondary, fontSize: fontSize.lg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
        >+</button>
        <button
          onClick={() => zoomToCenter(1 / 1.25)}
          style={{ width: 26, height: 26, background: colors.bgCard, border: `1px solid ${colors.borderMed}`, borderRadius: radius.md, color: colors.textSecondary, fontSize: fontSize.lg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
        >−</button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{ width: 26, height: 26, background: colors.bgCard, border: `1px solid ${colors.borderMed}`, borderRadius: radius.md, color: colors.textFaint, fontSize: fontSize.xs, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.05em' }}
        >FIT</button>
        <button
          onClick={() => updateStageConfig({ snapToGrid: !stageConfig.snapToGrid })}
          title={stageConfig.snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
          style={{ width: 26, height: 26, background: stageConfig.snapToGrid ? colors.accent : colors.bgCard, border: `1px solid ${stageConfig.snapToGrid ? colors.accent : colors.borderMed}`, borderRadius: radius.md, color: stageConfig.snapToGrid ? colors.text : colors.textFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Magnet size={13} />
        </button>
      </div>

      {/* Zoom level indicator */}
      {Math.abs(zoom - 1) > 0.05 && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, fontSize: fontSize.xs, color: colors.textFaint, background: colors.bgPanel, padding: '3px 6px', borderRadius: radius.sm, border: `1px solid ${colors.bgCardHover}` }}>
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Stage dimensions overlay */}
      {showStageDimensions && (() => {
        const screenLeft = offsetX * zoom + pan.x;
        const screenTop = offsetY * zoom + pan.y;
        return (
          <div style={{
            position: 'absolute',
            left: Math.max(4, screenLeft),
            top: Math.max(4, screenTop - 90),
            background: `${colors.bgPanel}f0`,
            border: `1px solid ${colors.borderMed}`,
            borderRadius: radius.md,
            padding: '10px 14px',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: '0.02em', lineHeight: 1.2 }}>
              {stageConfig.width} × {stageConfig.height} <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textSecondary }}>{stageConfig.unit}</span>
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>
                1 div&nbsp;=&nbsp;
                <span style={{ color: colors.textSecondary }}>
                  {+(stageConfig.width / stageConfig.divisionsX).toFixed(2)} × {+(stageConfig.height / stageConfig.divisionsY).toFixed(2)} {stageConfig.unit}
                </span>
              </span>
              <span style={{ color: colors.textFaint }}>
                {stageConfig.divisionsX} × {stageConfig.divisionsY} divisions
              </span>
            </div>
          </div>
        );
      })()}

      {/* Multi-select indicator */}
      {selectedItemIds.length > 1 && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontSize: fontSize.sm, color: colors.textSecondary, background: `${colors.bgPanel}d9`, padding: '3px 10px', borderRadius: radius.pill, border: `1px solid ${colors.borderMed}`, pointerEvents: 'none' }}>
          {selectedItemIds.length} selected
        </div>
      )}

      {/* Rotate handle */}
      {rotateHandle && (
        <div
          style={{
            position: 'absolute',
            left: rotateHandle.screenX - 12,
            top: rotateHandle.screenY - 12,
            width: 24, height: 24,
            borderRadius: '50%',
            background: colors.bgCard,
            border: `1px solid ${colors.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: rotateState ? 'grabbing' : 'grab',
            color: rotateState ? colors.text : colors.textFaint,
            userSelect: 'none',
            zIndex: 10,
          }}
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            if (!activeFormationId) return;
            const state = useShowStore.getState();
            const basePositions: Record<string, { x: number; y: number }> = {};
            selectedItemIds.forEach(id => {
              const p = state.performerPositions[`${id}-${activeFormationId}`] ?? state.propPositions[`${id}-${activeFormationId}`];
              if (p) basePositions[id] = { x: p.x, y: p.y };
            });
            const centroidScreenX = (offsetX + rotateHandle.cx * cellScale) * zoom + pan.x;
            const centroidScreenY = (offsetY + rotateHandle.cy * cellScale) * zoom + pan.y;
            const startAngle = Math.atan2(e.clientY - centroidScreenY, e.clientX - centroidScreenX);
            setRotateState({ cx: rotateHandle.cx, cy: rotateHandle.cy, startAngle, basePositions, currentAngle: 0 });
          }}
        >
          <RotateCw size={13} />
        </div>
      )}

    </div>
  );
}
