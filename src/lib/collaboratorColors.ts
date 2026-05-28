const PLAYHEAD_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#06b6d4', '#ec4899',
];

const colorMap = new Map<string, string>();

export function getCollaboratorPlayheadColor(userId: string): string {
  if (colorMap.has(userId)) return colorMap.get(userId)!;
  const used = new Set(colorMap.values());
  const next = PLAYHEAD_COLORS.find(c => !used.has(c)) ?? PLAYHEAD_COLORS[colorMap.size % PLAYHEAD_COLORS.length];
  colorMap.set(userId, next);
  return next;
}
