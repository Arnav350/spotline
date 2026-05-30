import React, { useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text } from 'react-konva';
import { useShowStore } from '../store/showStore';
import { useShallow } from 'zustand/shallow';
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

function StageCanvas({ width, height, showStageDimensions }: CanvasProps) {
  // Fix 1: useShallow selector — rawAnimProgress / isAnimating / animFromFormationId excluded.
  // These are read imperatively via useShowStore.getState() in the rAF loop and getAnimatedPosition.
  const {
    show, formations, performers, props,
    performerPositions, propPositions, performerPaths,
    activeFormationId,
    selectedItemIds, setSelectedItemIds, toggleItemSelected,
    movePerformer, moveProp, pushHistory,
    setPerformerPath, clearPerformerPath, updateStageConfig,
  } = useShowStore(useShallow(state => ({
    show: state.show,
    formations: state.formations,
    performers: state.performers,
    props: state.props,
    performerPositions: state.performerPositions,
    propPositions: state.propPositions,
    performerPaths: state.performerPaths,
    activeFormationId: state.activeFormationId,
    selectedItemIds: state.selectedItemIds,
    setSelectedItemIds: state.setSelectedItemIds,
    toggleItemSelected: state.toggleItemSelected,
    movePerformer: state.movePerformer,
    moveProp: state.moveProp,
    pushHistory: state.pushHistory,
    setPerformerPath: state.setPerformerPath,
    clearPerformerPath: state.clearPerformerPath,
    updateStageConfig: state.updateStageConfig,
  })));

  const activeFormation = formations.find(f => f.id === activeFormationId);

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

  const cellScaleRef = useRef(cellScale);
  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);
  cellScaleRef.current = cellScale;
  offsetXRef.current = offsetX;
  offsetYRef.current = offsetY;

  const toCanvas = (x: number, y: number) => worldToCanvas(x, y, offsetX, offsetY, cellScale);
  const toWorld = (cx: number, cy: number) => canvasToWorld(cx, cy, offsetX, offsetY, cellScale);
  const snap = (x: number, y: number) => snapWorld(x, y, stageConfig);

  // --- Fix 6: Zoom / pan — refs + imperative stage transforms, uiTick for DOM overlays ---
  const {
    zoomRef, panRef, isPanningRef,
    uiTick,
    zoomToCenter,
    handleMiddleMouseDown,
    handleMiddleMouseMove,
    handleMiddleMouseUp,
  } = useZoomPan(width, height, stageRef);

  // --- Fix 7: Selection, drag, rotation ---
  const {
    draggingId, setDraggingId,
    dragCanvasPos, setDragCanvasPos,
    dragWorldOffsetRef,
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
    const s = useShowStore.getState();
    if (s.isAnimating && s.animFromFormationId) {
      const prevPos = getPosition(entityId, s.animFromFormationId, isPerformer);
      if (prevPos) {
        let cp: { x: number; y: number } | null = null;
        if (isPerformer) {
          const stored = performerPaths[`${entityId}-${s.animFromFormationId}-${activeFormationId}`];
          if (stored) {
            const mx = (prevPos.x + currentPos.x) / 2;
            const my = (prevPos.y + currentPos.y) / 2;
            cp = { x: mx + stored.cpDx, y: my + stored.cpDy };
          }
        }
        const progress = applyEasing(s.rawAnimProgress, activeFormation?.transition_easing);
        return interpolatePosition(prevPos, currentPos, progress, cp);
      }
    }
    return { x: currentPos.x, y: currentPos.y };
  }

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

  // --- Fix 5: Memoized grid (only rebuilds when layout changes, not on every re-render) ---
  const gridLines = useMemo(() => {
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
    const lines: React.ReactNode[] = [];
    for (let xi = 0; xi <= numSubX; xi++) {
      const x = xi * subSpacingX;
      const isMajor = xi % subCountX === 0;
      const cx = offsetX + x * cellScale;
      lines.push(
        <Line key={`vg-${xi}`} points={[cx, offsetY, cx, offsetY + stagePixelHeight]}
          stroke={isMajor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)'}
          strokeWidth={isMajor ? 1 : 0.5} listening={false} />,
      );
    }
    for (let yi = 0; yi <= numSubY; yi++) {
      const y = yi * subSpacingY;
      const isMajor = yi % subCountY === 0;
      const cy = offsetY + y * cellScale;
      lines.push(
        <Line key={`hg-${yi}`} points={[offsetX, cy, offsetX + stagePixelWidth, cy]}
          stroke={isMajor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)'}
          strokeWidth={isMajor ? 1 : 0.5} listening={false} />,
      );
    }
    return lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageConfig, offsetX, offsetY, cellScale, stagePixelWidth, stagePixelHeight]);

  const gridLabels = useMemo(() => {
    const divCountX = Math.max(1, stageConfig.divisionsX);
    const divCountY = Math.max(1, stageConfig.divisionsY);
    const divSpacingX = stageConfig.width / divCountX;
    const divSpacingY = stageConfig.height / divCountY;
    const labels: React.ReactNode[] = [];
    for (let di = 0; di <= divCountX; di++) {
      const x = di * divSpacingX;
      const cx = offsetX + x * cellScale;
      const label = di - divCountX / 2;
      labels.push(
        <Text key={`xl-${di}`} x={cx - 15} y={offsetY + stagePixelHeight + 6}
          text={Number.isInteger(label) ? String(label) : label.toFixed(1)}
          fontSize={9} fill="rgba(255,255,255,0.25)" width={30} align="center" listening={false} />,
      );
    }
    for (let di = 0; di <= divCountY; di++) {
      const y = di * divSpacingY;
      const cy = offsetY + y * cellScale;
      const label = di - divCountY / 2;
      labels.push(
        <Text key={`yl-${di}`} x={offsetX - 28} y={cy - 5}
          text={Number.isInteger(label) ? String(label) : label.toFixed(1)}
          fontSize={9} fill="rgba(255,255,255,0.25)" width={24} align="right" listening={false} />,
      );
    }
    return labels;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageConfig, offsetX, offsetY, cellScale, stagePixelWidth, stagePixelHeight]);

  // --- Fix 2: Imperative rAF animation loop with node caching ---
  // Fires when activeFormationId changes (same event that triggers animation).
  // Reads isAnimating / rawAnimProgress imperatively — zero React re-renders during animation.
  const performersRef = useRef(performers);
  const propsRef = useRef(props);
  performersRef.current = performers;
  propsRef.current = props;

  // Cached map of all performer/prop Konva nodes. Rebuilt when roster or selection changes.
  // All nodes are cached to offscreen bitmaps so Konva's synchronous per-move draws
  // (text layout + shape paths) become fast bitmap blits — same technique as the rAF loop.
  const nodeMapRef = useRef<Map<string, Konva.Node>>(new Map());
  // O(1) lookup for ghost line nodes in drag handler — populated alongside nodeMapRef
  const ghostLineMapRef = useRef<Map<string, Konva.Line>>(new Map());
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    nodeMapRef.current.forEach(n => n.clearCache());
    nodeMapRef.current.clear();
    ghostLineMapRef.current.clear();
    const allIds = [
      ...performers.map(p => `performer-${p.id}`),
      ...props.map(p => `prop-${p.id}`),
      // Ghost shapes (no text labels, but caching skips fill/stroke recomputation per _draw)
      ...selectedItemIds.map(id => `ghost-${id}`),
    ];
    for (const nodeId of allIds) {
      const node = stage.findOne(`#${nodeId}`) ?? null;
      if (node) { node.cache({ offset: 20 }); nodeMapRef.current.set(nodeId, node); }
    }
    // Ghost lines can't be cached (points change during drag) but store ref for O(1) lookup
    for (const id of selectedItemIds) {
      const line = stage.findOne(`#ghost-line-${id}`) as Konva.Line | undefined;
      if (line) ghostLineMapRef.current.set(id, line);
    }
    stage.getLayers()[2]?.batchDraw();
    return () => {
      nodeMapRef.current.forEach(n => n.clearCache());
      nodeMapRef.current.clear();
      ghostLineMapRef.current.clear();
    };
  // selectedItemIds: stroke/strokeWidth changes on selection change — must recache
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performers, props, selectedItemIds]);

  useEffect(() => {
    const s = useShowStore.getState();
    if (!s.isAnimating || !s.animFromFormationId) return;
    const stage = stageRef.current;
    if (!stage) return;
    const layer = stage.getLayers()[2]; // performer/prop layer
    if (!layer) return;

    // Collect and cache all performer/prop nodes to offscreen bitmaps
    const allIds = [
      ...performersRef.current.map(p => `performer-${p.id}`),
      ...propsRef.current.map(p => `prop-${p.id}`),
    ];
    const nodes = allIds
      .map(id => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => n != null);
    nodes.forEach(n => n.cache({ offset: 20 }));
    const localNodeMap = new Map<string, Konva.Node>(nodes.map(n => [n.id(), n]));

    let rafId: number;
    function tick() {
      const st = useShowStore.getState();
      if (!st.isAnimating) {
        nodes.forEach(n => n.clearCache());
        return;
      }
      const activeForm = st.formations.find(f => f.id === st.activeFormationId);
      const progress = applyEasing(st.rawAnimProgress, activeForm?.transition_easing);

      for (const performer of performersRef.current) {
        const node = localNodeMap.get(`performer-${performer.id}`);
        if (!node) continue;
        const currPos = st.performerPositions[`${performer.id}-${st.activeFormationId}`];
        if (!currPos) continue;
        const prevPos = st.performerPositions[`${performer.id}-${st.animFromFormationId}`];
        let pos: { x: number; y: number };
        if (prevPos) {
          const stored = st.performerPaths[`${performer.id}-${st.animFromFormationId}-${st.activeFormationId}`];
          let cp: { x: number; y: number } | null = null;
          if (stored) {
            const mx = (prevPos.x + currPos.x) / 2;
            const my = (prevPos.y + currPos.y) / 2;
            cp = { x: mx + stored.cpDx, y: my + stored.cpDy };
          }
          pos = interpolatePosition(prevPos, currPos, progress, cp);
        } else {
          pos = currPos;
        }
        const canvas = worldToCanvas(pos.x, pos.y, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
        node.x(canvas.x);
        node.y(canvas.y);
      }

      for (const prop of propsRef.current) {
        const node = localNodeMap.get(`prop-${prop.id}`);
        if (!node) continue;
        const currPos = st.propPositions[`${prop.id}-${st.activeFormationId}`];
        if (!currPos) continue;
        const prevPos = st.propPositions[`${prop.id}-${st.animFromFormationId}`];
        const pos = prevPos ? interpolatePosition(prevPos, currPos, progress) : currPos;
        const canvas = worldToCanvas(pos.x, pos.y, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
        node.x(canvas.x);
        node.y(canvas.y);
      }

      layer.batchDraw();
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      nodes.forEach(n => n.clearCache());
    };
  }, [activeFormationId]);


  // Ghost overlays split into two memoized arrays:
  //   ghostLines  — dashed bezier paths + ghost shapes, rendered in Layer 1 with listening={false}
  //   pathHandles — draggable bezier control handles, rendered in Layer 2 alongside performers
  // Splitting lets Layer 1 skip all hit-detection work on every redraw.
  const isAnimatingNow = useShowStore.getState().isAnimating;
  const { ghostLines, pathHandles } = useMemo(() => {
    const ghostLines: React.ReactNode[] = [];
    const pathHandles: React.ReactNode[] = [];
    if (useShowStore.getState().isAnimating || !prevFormId || selectedItemIds.length === 0) {
      return { ghostLines, pathHandles };
    }
    selectedItemIds.forEach(pid => {
      const performer = performers.find(p => p.id === pid);
      if (!performer) return;
      const prevPos = performerPositions[`${pid}-${prevFormId}`];
      const currPos = performerPositions[`${pid}-${activeFormationId!}`];
      if (!prevPos || !currPos) return;
      const ghost = worldToCanvas(prevPos.x, prevPos.y, offsetX, offsetY, cellScale);

      const mx = (prevPos.x + currPos.x) / 2;
      const my = (prevPos.y + currPos.y) / 2;
      const stored = performerPaths[`${pid}-${prevFormId}-${activeFormationId}`];
      const cp = stored ? { x: mx + stored.cpDx, y: my + stored.cpDy } : { x: mx, y: my };
      const handleWorld = stored ? { x: mx + stored.cpDx / 2, y: my + stored.cpDy / 2 } : { x: mx, y: my };
      const cpCanvas = worldToCanvas(handleWorld.x, handleWorld.y, offsetX, offsetY, cellScale);

      const endWorld = dragCanvasPos?.id === pid
        ? canvasToWorld(dragCanvasPos.x, dragCanvasPos.y, offsetX, offsetY, cellScale)
        : currPos;
      const SEGMENTS = 10;
      const pts: number[] = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const u = 1 - t;
        const wx = u * u * prevPos.x + 2 * u * t * cp.x + t * t * endWorld.x;
        const wy = u * u * prevPos.y + 2 * u * t * cp.y + t * t * endWorld.y;
        const pt = worldToCanvas(wx, wy, offsetX, offsetY, cellScale);
        pts.push(pt.x, pt.y);
      }

      ghostLines.push(
        <Line id={`ghost-line-${pid}`} key={`ghost-line-${pid}`} points={pts}
          stroke={performer.color} strokeWidth={1.5} dash={[4, 6]} opacity={0.4} listening={false} />,
      );
      ghostLines.push(
        drawShape(performer, ghost.x, ghost.y, performerSize, false, false,
          () => {}, () => {}, () => {},
          `ghost-${performer.id}`, false, 0.22),
      );
      pathHandles.push(
        <Circle
          key={`path-handle-${pid}`}
          x={cpCanvas.x} y={cpCanvas.y}
          radius={5} fill={performer.color}
          stroke="rgba(255,255,255,0.4)" strokeWidth={1}
          opacity={0.85} draggable
          onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; }}
          onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
            e.cancelBubble = true;
            const h = canvasToWorld(e.target.x(), e.target.y(), offsetXRef.current, offsetYRef.current, cellScaleRef.current);
            setPerformerPath(pid, prevFormId, activeFormationId!, 2 * (h.x - mx), 2 * (h.y - my));
          }}
          onDblClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            clearPerformerPath(pid, prevFormId, activeFormationId!);
          }}
        />,
      );
    });
    return { ghostLines, pathHandles };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemIds, prevFormId, activeFormationId, performers, performerPositions, performerPaths, performerSize, cellScale, offsetX, offsetY, dragCanvasPos]);

  // --- Fix 8: Memoized rotate handle position (uiTick ensures it updates after pan/zoom) ---
  const rotateHandle = useMemo(() => {
    if (selectedItemIds.length < 2 || !activeFormationId || isAnimatingNow) return null;
    const positions = selectedItemIds.map(id => {
      const p = rotateState?.basePositions[id] ?? performerPositions[`${id}-${activeFormationId}`] ?? propPositions[`${id}-${activeFormationId}`];
      return p ?? null;
    }).filter((p): p is { x: number; y: number } => p !== null);
    if (positions.length < 2) return null;
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    const maxR = Math.max(...positions.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)));
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const offsetPx = Math.max(28, maxR * cellScale * zoom + 18);
    const screenX = (offsetX + cx * cellScale) * zoom + pan.x;
    const screenY = (offsetY + cy * cellScale) * zoom + pan.y - offsetPx;
    return { screenX, screenY, cx, cy };
  // uiTick ensures this recalculates after every pan/zoom
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemIds, activeFormationId, isAnimatingNow, rotateState, performerPositions, propPositions, cellScale, offsetX, offsetY, uiTick]);

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
    // Fix 3: CSS background replaces stage-bg Rect node
    <div
      style={{ position: 'relative', width, height, overflow: 'hidden', background: colors.bg }}
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
        // Fix 6: No scaleX/scaleY/x/y props — Stage transform applied imperatively in useZoomPan
        style={{ cursor: isPanningRef.current ? 'grabbing' : selectionRect ? 'crosshair' : 'default' }}
        onMouseDown={(e) => {
          if (e.evt.button !== 0) return;
          // Fix 3: Removed stage-bg check — empty stage space satisfies e.target === Stage
          if (e.target !== e.target.getStage()) return;
          selectionAdditive.current = e.evt.metaKey || e.evt.ctrlKey;
          const pos = stageRef.current!.getRelativePointerPosition()!;
          selectionStartRef.current = pos;
          selectionRectDataRef.current = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
          setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
        }}
      >
        {/* Fix 3: Layer 0 — static elements, never targeted by rAF batchDraw */}
        <Layer listening={false}>
          {/* Stage floor */}
          <Rect x={offsetX} y={offsetY} width={stagePixelWidth} height={stagePixelHeight}
            fill={colors.bgCard} stroke={'rgba(139,92,246,0.45)'} strokeWidth={1.5} listening={false} />

          {gridLines}

          <Text
            x={offsetX} y={offsetY - 20}
            width={stagePixelWidth} align="center"
            text="BACKSTAGE"
            fontSize={9} fontFamily="Inter, sans-serif"
            fill="rgba(255,255,255,0.28)" fontStyle="600"
            letterSpacing={2} listening={false}
          />

          {gridLabels}
        </Layer>

        {/* Layer 1 — ghost lines + ghost shapes. listening={false} skips all hit-detection
            work on every redraw. Path handles are moved to Layer 2 so they can be interactive
            without forcing Layer 1 to maintain a hit map. */}
        <Layer listening={false}>
          {ghostLines}
        </Layer>

        {/* Layer 2 — path handles + dynamic performers/props. All nodes are bitmap-cached
            so Konva's synchronous _draw() during drag is fast blits. */}
        <Layer>
          {pathHandles}
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
            } else if (!isDragging && isSelected && draggingId && dragWorldOffsetRef.current) {
              const off = dragWorldOffsetRef.current;
              propPos = { x: pos.x + off.dx, y: pos.y + off.dy };
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
              dragWorldOffsetRef.current = null;
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
              if (!dragStartWorldPosRef.current) return;
              const cw = canvasToWorld(cx, cy, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
              const dx = cw.x - dragStartWorldPosRef.current.x;
              const dy = cw.y - dragStartWorldPosRef.current.y;
              dragWorldOffsetRef.current = { dx, dy };
              const stage = stageRef.current;
              if (!stage) return;
              const st = useShowStore.getState();
              st.selectedItemIds.forEach(otherId => {
                if (otherId === prop.id) return;
                const pPos = st.performerPositions[`${otherId}-${activeFormationId!}`];
                const rPos = st.propPositions[`${otherId}-${activeFormationId!}`];
                const base = pPos ?? rPos;
                if (!base) return;
                const node = nodeMapRef.current.get(`${pPos ? 'performer' : 'prop'}-${otherId}`);
                if (!node) return;
                const c = worldToCanvas(base.x + dx, base.y + dy, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
                node.x(c.x); node.y(c.y);
              });
              stage.getLayers()[2]?.batchDraw(); // performer/prop layer
            }

            return drawShape(prop, x, y, Math.max(8, propW), isSelected, isDragging,
              onPropDragStart, onPropDragEnd, onPropClick,
              `prop-${prop.id}`, true, undefined, onPropDragMove, Math.max(8, propD),
            );
          })}

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
            } else if (!isDragging && isSelected && draggingId && dragWorldOffsetRef.current) {
              const off = dragWorldOffsetRef.current;
              pos = { x: basePos.x + off.dx, y: basePos.y + off.dy };
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
              const worldOff = dragWorldOffsetRef.current;
              const world = (startWorld && worldOff)
                ? { x: startWorld.x + worldOff.dx, y: startWorld.y + worldOff.dy }
                : lastDragCanvasPosRef.current
                  ? toWorld(lastDragCanvasPosRef.current.x, lastDragCanvasPosRef.current.y)
                  : toWorld(cx, cy);

              setDraggingId(null);
              setDragCanvasPos(null);
              dragWorldOffsetRef.current = null;
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
              if (!dragStartWorldPosRef.current) return;
              const cw = canvasToWorld(cx, cy, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
              const dx = cw.x - dragStartWorldPosRef.current.x;
              const dy = cw.y - dragStartWorldPosRef.current.y;
              dragWorldOffsetRef.current = { dx, dy };
              const stage = stageRef.current;
              if (!stage) return;
              const st = useShowStore.getState();

              // Move all other selected nodes imperatively — zero React re-renders per move
              st.selectedItemIds.forEach(otherId => {
                if (otherId === performer.id) return;
                const pPos = st.performerPositions[`${otherId}-${activeFormationId!}`];
                const rPos = st.propPositions[`${otherId}-${activeFormationId!}`];
                const base = pPos ?? rPos;
                if (!base) return;
                const node = nodeMapRef.current.get(`${pPos ? 'performer' : 'prop'}-${otherId}`);
                if (!node) return;
                const c = worldToCanvas(base.x + dx, base.y + dy, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
                node.x(c.x); node.y(c.y);
              });

              // Update this performer's ghost line endpoint imperatively (O(1) map lookup)
              if (prevFormId) {
                const ghostLine = ghostLineMapRef.current.get(performer.id);
                if (ghostLine) {
                  const prevPos_ = st.performerPositions[`${performer.id}-${prevFormId}`];
                  const currPos_ = st.performerPositions[`${performer.id}-${activeFormationId!}`];
                  if (prevPos_ && currPos_) {
                    const mx = (prevPos_.x + currPos_.x) / 2;
                    const my = (prevPos_.y + currPos_.y) / 2;
                    const stored = st.performerPaths[`${performer.id}-${prevFormId}-${activeFormationId}`];
                    const cp_ = stored ? { x: mx + stored.cpDx, y: my + stored.cpDy } : { x: mx, y: my };
                    const SEGMENTS = 10;
                    const pts: number[] = [];
                    for (let i = 0; i <= SEGMENTS; i++) {
                      const t = i / SEGMENTS;
                      const u = 1 - t;
                      const wx = u * u * prevPos_.x + 2 * u * t * cp_.x + t * t * cw.x;
                      const wy = u * u * prevPos_.y + 2 * u * t * cp_.y + t * t * cw.y;
                      const pt = worldToCanvas(wx, wy, offsetXRef.current, offsetYRef.current, cellScaleRef.current);
                      pts.push(pt.x, pt.y);
                    }
                    ghostLine.points(pts);
                  }
                }
              }

              stage.getLayers()[1]?.batchDraw(); // ghost overlay layer (endpoint update)
              stage.getLayers()[2]?.batchDraw(); // performer/prop layer
            }

            return drawShape(performer, x, y, performerSize, isSelected, isDragging,
              onPerformerDragStart, onPerformerDragEnd, onPerformerClick,
              `performer-${performer.id}`, true, undefined, onPerformerDragMove,
            );
          })}

          {/* Fix 7c: Selection rect always present, shown/hidden imperatively during drag,
              React state only updates at box selection start/end for cursor change */}
          <Rect
            id="selection-rect"
            visible={false}
            fill={`${colors.accent}14`}
            stroke={`${colors.accent}80`}
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
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
          onClick={() => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; const stage = stageRef.current; if (stage) { stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 }); stage.batchDraw(); } }}
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

      {/* Zoom level indicator — reads from ref, uiTick keeps it current */}
      {Math.abs(zoomRef.current - 1) > 0.05 && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, fontSize: fontSize.xs, color: colors.textFaint, background: colors.bgPanel, padding: '3px 6px', borderRadius: radius.sm, border: `1px solid ${colors.bgCardHover}` }}>
          {Math.round(zoomRef.current * 100)}%
        </div>
      )}

      {/* Stage dimensions overlay */}
      {showStageDimensions && (() => {
        const zoom = zoomRef.current;
        const pan = panRef.current;
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
            const zoom = zoomRef.current;
            const pan = panRef.current;
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

// Fix 8: React.memo prevents re-renders when parent (App.tsx) re-renders for unrelated reasons
export default memo(StageCanvas);
