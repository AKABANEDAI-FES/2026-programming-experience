import type { CSSProperties } from 'react';
import type { DrawMode } from 'shared';
import coloringPreview from '../assets/inyaa-coloring-goggles.png';
import inyaaGuide from '../assets/inyaa-guide.png';
import { DRAW_MODES, DRAW_MODE_COPY } from '../constants/drawModes';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../lib/ui/stageScale';
import { useStageScale } from '../lib/ui/useStageScale';
import styles from './HomeScreen.module.css';

type HomeScreenProps = {
  onSelectMode: (mode: DrawMode) => void;
};

export function HomeScreen({ onSelectMode }: HomeScreenProps) {
  const scale = useStageScale();
  const stageStyle = {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    transform: `translate(-50%, -50%) scale(${scale})`,
  } satisfies CSSProperties;

  return (
    <section className={styles.screen} aria-labelledby="home-title">
      {/* デザインは 1920×1080 で作り、画面の大きさに合わせて比率を保って縮める */}
      <div className={styles.stage} style={stageStyle}>
        <div className={styles.titleArea}>
          <p className={styles.subtitle}>プログラミング たいけんかい</p>
          <h1 id="home-title" className={styles.title}>
            うみの なかまを つくろう！
          </h1>
        </div>

        <div className={styles.guide}>
          <p className={styles.bubble}>どっちに する？</p>
          <img className={styles.guideImage} src={inyaaGuide} alt="" />
        </div>

        <div className={styles.choices}>
          {DRAW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.choice}
              data-mode={mode}
              onClick={() => onSelectMode(mode)}
            >
              <span className={styles.paper}>
                <span className={styles.tape} />
                {mode === 'coloring' && (
                  <img className={styles.paperImage} src={coloringPreview} alt="" />
                )}
              </span>
              <span className={styles.choiceLabel}>{DRAW_MODE_COPY[mode].homeLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
