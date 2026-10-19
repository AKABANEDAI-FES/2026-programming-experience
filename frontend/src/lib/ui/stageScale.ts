/** デザインの基準にしている画面の大きさ（1920×1080） */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** 画面の大きさに、1920×1080 の舞台を比率を保ったまま収める倍率 */
export const getStageScale = (viewportWidth: number, viewportHeight: number): number => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  return Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT);
};
