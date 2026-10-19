import type { CSSProperties, ReactNode } from 'react';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../lib/ui/stageScale';
import { useStageScale } from '../lib/ui/useStageScale';
import styles from './StageScreen.module.css';

type StageScreenProps = {
  /** 見出しの id（画面の名前として読み上げに使う） */
  labelledBy: string;
  /** 舞台の外に重ねるもの（縮めると困る Blockly など）。倍率を受け取って描く */
  overlay?: (scale: number) => ReactNode;
  children: ReactNode;
};

/**
 * 海の背景の上に 1920×1080 の舞台を置き、画面の大きさに合わせて比率を保ったまま縮めて表示する。
 * 中身は 1920×1080 の実寸で配置する。
 */
export function StageScreen({ labelledBy, overlay, children }: StageScreenProps) {
  const scale = useStageScale();
  const stageStyle = {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    transform: `translate(-50%, -50%) scale(${scale})`,
  } satisfies CSSProperties;

  return (
    <section className={styles.screen} aria-labelledby={labelledBy}>
      <div className={styles.stage} style={stageStyle}>
        {children}
      </div>
      {overlay?.(scale)}
    </section>
  );
}
