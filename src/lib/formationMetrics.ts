import type { StageConfig } from './types';

export interface Point {
  x: number;
  y: number;
}

// Default stage units per second — used until a show sets its own value in Stage settings.
export const DEFAULT_MAX_TRANSITION_SPEED = 8;

export interface StageBalance {
  dx: number; // -1..1, centroid offset from center as a fraction of half-width (negative = left)
  dy: number; // -1..1, centroid offset from center as a fraction of half-height (negative = up)
}

export function stageBalance(points: Point[], stage: StageConfig): StageBalance | null {
  if (points.length === 0) return null;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return {
    dx: (cx - stage.width / 2) / (stage.width / 2),
    dy: (cy - stage.height / 2) / (stage.height / 2),
  };
}

export interface PerformerPath {
  id: string;
  from: Point;
  to: Point;
}

export interface PerformerSpeed {
  id: string;
  speed: number;
}

export function transitionSpeeds(paths: PerformerPath[], transitionDuration: number): PerformerSpeed[] {
  if (transitionDuration <= 0) return [];
  return paths.map(p => ({
    id: p.id,
    speed: Math.sqrt((p.from.x - p.to.x) ** 2 + (p.from.y - p.to.y) ** 2) / transitionDuration,
  }));
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

// A proper transversal crossing only — both segments pass through each other's interior.
// Deliberately excludes any collinear/touching case (o == 0 for any triple): a performer
// walking into another performer's vacated spot shares an endpoint but never collides.
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

// Returns each pair of performer ids whose travel paths genuinely cross during the transition.
export function pathCrossingPairs(paths: PerformerPath[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      if (segmentsCross(paths[i].from, paths[i].to, paths[j].from, paths[j].to)) {
        pairs.push([paths[i].id, paths[j].id]);
      }
    }
  }
  return pairs;
}
