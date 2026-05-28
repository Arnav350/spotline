export const APP_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#84cc16',
];

export function colorFromUserId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return APP_COLORS[Math.abs(hash) % APP_COLORS.length];
}
