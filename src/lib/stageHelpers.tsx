import React from 'react';
import { Ellipse, Rect, RegularPolygon, Star, Text, Group } from 'react-konva';
import Konva from 'konva';
import type { Performer, Prop, StageConfig } from './types';
import { colors } from './theme';

export const CANVAS_PADDING = 40;
export const PERFORMER_RADIUS = 12;
export const LABEL_OFFSET = 16;
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 12;
export const ZOOM_FACTOR = 1.04;

export interface AnimatedPosition {
  x: number;
  y: number;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function applyEasing(t: number, easing?: string | null): number {
  switch (easing) {
    case 'ease-in': return t * t * t;
    case 'ease-out': return 1 - (1 - t) ** 3;
    case 'ease': return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    default: return 1 - (1 - t) ** 3; // ease-out for smooth default
  }
}

export function interpolatePosition(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  t: number,
  cp?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (!cp) {
    return { x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t) };
  }
  const u = 1 - t;
  return {
    x: u * u * prev.x + 2 * u * t * cp.x + t * t * curr.x,
    y: u * u * prev.y + 2 * u * t * cp.y + t * t * curr.y,
  };
}

export function worldToCanvas(
  x: number, y: number,
  offsetX: number, offsetY: number, cellScale: number,
) {
  return { x: offsetX + x * cellScale, y: offsetY + y * cellScale };
}

export function canvasToWorld(
  cx: number, cy: number,
  offsetX: number, offsetY: number, cellScale: number,
) {
  return { x: (cx - offsetX) / cellScale, y: (cy - offsetY) / cellScale };
}

export function snapWorld(x: number, y: number, stageConfig: StageConfig) {
  if (!stageConfig.snapToGrid) return { x, y };
  const stepX = stageConfig.width / stageConfig.divisionsX / stageConfig.subdivisionsX;
  const stepY = stageConfig.height / stageConfig.divisionsY / stageConfig.subdivisionsY;
  return {
    x: Math.round(x / stepX) * stepX,
    y: Math.round(y / stepY) * stepY,
  };
}

export function drawShape(
  item: Performer | Prop,
  x: number,
  y: number,
  size: number,
  isSelected: boolean,
  isDragging: boolean,
  onDragStart: () => void,
  onDragEnd: (x: number, y: number, node: Konva.Node) => void,
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void,
  key: string,
  showLabel = true,
  ghostOpacity?: number,
  onDragMove?: (x: number, y: number) => void,
  depth?: number,
): React.ReactNode {
  const { shape, color, name } = item;
  const d = depth ?? size;
  const opacity = ghostOpacity ?? (isDragging ? 0.85 : 1);
  const isGhost = ghostOpacity !== undefined;
  const strokeWidth = isSelected ? 2.5 : 1.5;
  const stroke = isGhost ? 'transparent' : isSelected ? colors.text : 'rgba(255,255,255,0.25)';

  const shapeProps = {
    fill: color,
    stroke,
    strokeWidth,
    shadowEnabled: false,
  };

  let shapeEl: React.ReactNode;
  if (shape === 'circle') {
    shapeEl = <Ellipse radiusX={size} radiusY={d} {...shapeProps} />;
  } else if (shape === 'square') {
    shapeEl = <Rect width={size * 2} height={d * 2} offsetX={size} offsetY={d} cornerRadius={3} {...shapeProps} />;
  } else if (shape === 'triangle') {
    const ref = Math.max(size, d);
    shapeEl = (
      <Group scaleX={size / ref} scaleY={d / ref}>
        <RegularPolygon sides={3} radius={ref} {...shapeProps} strokeWidth={strokeWidth / Math.min(size / ref, d / ref)} />
      </Group>
    );
  } else {
    const ref = Math.max(size, d);
    shapeEl = (
      <Group scaleX={size / ref} scaleY={d / ref}>
        <Star numPoints={5} innerRadius={ref * 0.5} outerRadius={ref} {...shapeProps} strokeWidth={strokeWidth / Math.min(size / ref, d / ref)} />
      </Group>
    );
  }

  return (
    <Group
      id={key}
      key={key}
      x={x}
      y={y}
      opacity={opacity}
      draggable={!isGhost}
      onDragStart={isGhost ? undefined : onDragStart}
      onDragMove={isGhost || !onDragMove ? undefined : (e: Konva.KonvaEventObject<DragEvent>) => {
        onDragMove(e.target.x(), e.target.y());
      }}
      onDragEnd={isGhost ? undefined : (e: Konva.KonvaEventObject<DragEvent>) => {
        onDragEnd(e.target.x(), e.target.y(), e.target);
      }}
      onClick={isGhost ? undefined : onClick}
      listening={!isGhost}
    >
      {shapeEl}
      {showLabel && (
        <Text
          x={0}
          y={LABEL_OFFSET}
          text={name}
          fontSize={10}
          fontFamily="Inter, sans-serif"
          fill="rgba(255,255,255,0.7)"
          align="center"
          offsetX={30}
          width={60}
          listening={false}
        />
      )}
    </Group>
  );
}
