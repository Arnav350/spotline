import type { Handler } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const WEEKLY_LIMIT = 2;

interface PerformerInput {
  id: string;
  name: string;
  group?: string;
}

interface PositionInput {
  id: string;
  x: number;
  y: number;
}

interface GenerateRequest {
  prompt: string;
  stageWidth: number;
  stageHeight: number;
  performers: PerformerInput[];
  prevPositions?: PositionInput[];
  nextPositions?: PositionInput[];
  stageUnit?: string;
}

interface PositionOutput {
  id: string;
  x: number;
  y: number;
}

const client = new Anthropic();

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function getAuthToken(event: Parameters<Handler>[0]): string | null {
  const header = event.headers['authorization'] ?? '';
  const token = header.replace('Bearer ', '').trim();
  return token || null;
}

async function getUsageCount(supabase: SupabaseClient<any, any, any>, userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  return count ?? 0;
}

function sanitize(s: string): string {
  return s.replace(/[\r\n\t`]/g, ' ').slice(0, 60);
}

export const handler: Handler = async (event) => {
  // supabase-js initializes a realtime client (WebSocket) on construction;
  // Node.js 20 lacks native WebSocket, so polyfill with a stub — we never open realtime channels
  if (!('WebSocket' in globalThis)) {
    (globalThis as unknown as Record<string, unknown>).WebSocket = function () {};
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { statusCode: 500, body: 'Server configuration error' };
  }

  const token = getAuthToken(event);
  if (!token) return { statusCode: 401, body: 'Authentication required' };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { statusCode: 401, body: 'Invalid session' };

  // GET — return remaining count
  if (event.httpMethod === 'GET') {
    const used = await getUsageCount(supabase, user.id);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remaining: Math.max(0, WEEKLY_LIMIT - used), limit: WEEKLY_LIMIT }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body: GenerateRequest;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { prompt, stageWidth, stageHeight, stageUnit, performers, prevPositions, nextPositions } = body;

  if (prompt && prompt.length > 500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Description must be 500 characters or fewer.' }) };
  }
  if (!Array.isArray(performers) || performers.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No performers provided.' }) };
  }
  if (performers.length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Too many performers (max 50).' }) };
  }

  // Atomic check + insert via RPC — per-user advisory lock prevents concurrent bypass
  const { data: remaining } = await supabase.rpc('try_log_ai_generation', { p_limit: WEEKLY_LIMIT });
  if (remaining === -1) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: `Weekly limit of ${WEEKLY_LIMIT} AI generations reached. Try again next week.` }),
    };
  }

  const unit = stageUnit ?? 'ft';
  const cx = stageWidth / 2;
  const cy = stageHeight / 2;

  // Map real IDs to short tokens (p0, p1, …) to save tokens — UUIDs are expensive to tokenize
  const idToShort = new Map<string, string>();
  const shortToId = new Map<string, string>();
  performers.forEach((p, i) => {
    const short = `p${i}`;
    idToShort.set(p.id, short);
    shortToId.set(short, p.id);
  });

  const shortId = (id: string) => idToShort.get(id) ?? id;

  const performerList = performers
    .map(p => `- ${sanitize(p.name)} (${shortId(p.id)})${p.group ? ` [group: ${sanitize(p.group)}]` : ''}`)
    .join('\n');

  const formatPositions = (positions: PositionInput[]) =>
    positions.map(p => `  ${shortId(p.id)}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join('\n');

  let contextSection = '';
  if (prevPositions && prevPositions.length > 0) {
    contextSection += `\nPrevious formation (for flow reference):\n${formatPositions(prevPositions)}`;
  }
  if (nextPositions && nextPositions.length > 0) {
    contextSection += `\nNext formation (for flow reference):\n${formatPositions(nextPositions)}`;
  }

  const isCreative = !prompt.trim();
  const taskDescription = isCreative
    ? `Task: Design a visually compelling formation that flows naturally between the previous and next formations. Be creative — think of an interesting geometric shape, pattern, or grouping that would look great on stage and make sense as a middle moment in this sequence.`
    : `Task: Create a NEW formation from scratch that matches this description: "${prompt}"
Treat the description as the PRIMARY constraint. Compute positions geometrically based on the shape described. Do NOT anchor to the previous/next positions — use those only to understand the show's context and flow.`;

  const systemPrompt = `You are a choreography assistant that places performers on a stage.

STAGE COORDINATES (${stageWidth} × ${stageHeight} ${unit}):
- x=0 = stage LEFT, x=${stageWidth} = stage RIGHT, center x=${cx}
- y=0 = UPSTAGE (back wall, away from audience, visually TOP), y=${stageHeight} = DOWNSTAGE (front, facing audience, visually BOTTOM), center y=${cy}
- "top left" = low x, low y (upstage left). "bottom right" = high x, high y (downstage right).
- Keep performers at least 3 ${unit} apart

FORMATION SHAPES — apply geometrically, not by modifying existing positions:
- Line: evenly spaced along a straight path
- Diagonal: straight line between two opposite corners (e.g. top-left=(0,0) to bottom-right=(${stageWidth},${stageHeight}))
- X / cross: two diagonals intersecting at center — one from (0,0)→(${stageWidth},${stageHeight}), one from (0,${stageHeight})→(${stageWidth},0)
- Arc/curve: evenly spaced along a curved path
- Circle: evenly spaced around center point
- V-shape/chevron: two lines meeting at a downstage point
- Grid/block: rows and columns across a region

GROUPS: When the description assigns groups to specific regions or diagonals, place each group's performers evenly spaced along their assigned path. Treat group membership as a strict spatial constraint.

PERFORMERS:
${performerList}
${contextSection}

${taskDescription}

Rules:
- All positions within bounds: x in [0, ${stageWidth}], y in [0, ${stageHeight}]
- Output every listed performer exactly once
- Think step-by-step: identify the shape, map groups to regions, compute evenly-spaced positions along each path

Output ONLY a valid JSON array — no explanation, no prose. Format: [{"id":"p0","x":number,"y":number}, ...]`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      messages: [{ role: 'user', content: systemPrompt }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const jsonStr = extractJsonArray(text);
    if (!jsonStr) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No JSON array in response', raw: text }) };
    }

    const positions: PositionOutput[] = JSON.parse(jsonStr);
    const result = positions
      .filter(p => shortToId.has(p.id))
      .map(p => ({
        id: shortToId.get(p.id)!,
        x: Math.max(0, Math.min(stageWidth, p.x)),
        y: Math.max(0, Math.min(stageHeight, p.y)),
      }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: result, remaining, limit: WEEKLY_LIMIT }),
    };
  } catch (err) {
    console.error('[generate-formation] ERROR:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error('[generate-formation] STACK:', err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Generation failed. Please try again.' }),
    };
  }
};
