import type { StageConfig } from './types';

export function isOnStage(x: number, y: number, stage: StageConfig): boolean {
  return x >= 0 && x <= stage.width && y >= 0 && y <= stage.height;
}
