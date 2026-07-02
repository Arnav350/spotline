import type { StageConfig, Performer, PerformerGroup, PerformerPosition } from './types';
import { isOnStage } from './stageUtils';
import { supabase } from './supabase';

export interface AIGenerationOptions {
  prompt: string;
  stageConfig: StageConfig;
  performers: Performer[];
  groups: PerformerGroup[];
  formationId: string;
  performerPositions: Record<string, PerformerPosition>;
  prevFormationId?: string | null;
  nextFormationId?: string | null;
}

export interface AIGeneratedPosition {
  id: string;
  x: number;
  y: number;
}

export interface AIGenerationResult {
  positions: AIGeneratedPosition[];
  remaining: number | null;
  limit: number | null;
}

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface AIUsage {
  remaining: number;
  limit: number;
}

const USAGE_CACHE_KEY = 'ai_usage_cache';

export function getCachedAIUsage(): AIUsage | null {
  try {
    const raw = localStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.remaining === 'number' && typeof parsed.limit === 'number') {
      return parsed as AIUsage;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAIUsage(): Promise<AIUsage | null> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return null;
    const res = await fetch('/.netlify/functions/generate-formation', {
      headers: authHeader,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.remaining === 'number' && typeof data.limit === 'number') {
      const usage = { remaining: data.remaining, limit: data.limit };
      localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(usage));
      return usage;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateFormation(opts: AIGenerationOptions): Promise<AIGenerationResult> {
  const {
    prompt, stageConfig, performers, groups, formationId,
    performerPositions, prevFormationId, nextFormationId,
  } = opts;

  const groupMap = new Map(groups.map(g => [g.id, g.name]));

  const onStagePerformers = performers.filter(p => {
    const pos = performerPositions[`${p.id}-${formationId}`];
    return pos && isOnStage(pos.x, pos.y, stageConfig);
  });

  if (onStagePerformers.length === 0) {
    throw new Error('No performers are currently on stage.');
  }

  const toPositionList = (fId: string) =>
    onStagePerformers
      .map(p => performerPositions[`${p.id}-${fId}`])
      .filter(Boolean)
      .map(p => ({ id: p.performer_id, x: p.x, y: p.y }));

  const body = {
    prompt,
    stageWidth: stageConfig.width,
    stageHeight: stageConfig.height,
    stageUnit: stageConfig.unit,
    performers: onStagePerformers.map(p => ({
      id: p.id,
      name: p.name,
      group: p.group_id ? groupMap.get(p.group_id) : undefined,
    })),
    prevPositions: prevFormationId ? toPositionList(prevFormationId) : undefined,
    nextPositions: nextFormationId ? toPositionList(nextFormationId) : undefined,
  };

  const authHeader = await getAuthHeader();
  const res = await fetch('/.netlify/functions/generate-formation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Generation failed: ${text}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {}
    throw new Error(message);
  }

  const data = await res.json();
  let positions = data.positions as AIGeneratedPosition[];
  const remaining: number | null = typeof data.remaining === 'number' ? data.remaining : null;
  const limit: number | null = typeof data.limit === 'number' ? data.limit : null;

  if (stageConfig.snapToGrid) {
    const stepX = stageConfig.width / stageConfig.divisionsX / stageConfig.subdivisionsX;
    const stepY = stageConfig.height / stageConfig.divisionsY / stageConfig.subdivisionsY;
    positions = positions.map(p => ({
      ...p,
      x: Math.max(0, Math.min(stageConfig.width, snapToGrid(p.x, stepX))),
      y: Math.max(0, Math.min(stageConfig.height, snapToGrid(p.y, stepY))),
    }));
  }

  return { positions, remaining, limit };
}
