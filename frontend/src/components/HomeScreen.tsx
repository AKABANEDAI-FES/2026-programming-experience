import type { DrawMode } from 'shared';
import coloringPreview from '../assets/inyaa-coloring-goggles.png';
import inyaaGuide from '../assets/inyaa-guide.png';
import { DRAW_MODES, DRAW_MODE_COPY } from '../constants/drawModes';
import styles from './HomeScreen.module.css';
import { StageScreen } from './StageScreen';

type HomeScreenProps = {
  onSelectMode: (mode: DrawMode) => void;
};

export function HomeScreen({ onSelectMode }: HomeScreenProps) {
  return (
    <StageScreen labelledBy="home-title">
      <div className={styles.titleArea}>
        <p className={styles.subtitle}>プログラミング たいけんかい</p>
        <h1 id="home-title" className={styles.title}>
          うみの なかまを つくろう！
        </h1>
      </div>

      <div className={styles.guide}>
        <p className={styles.bubble}>どっちに するにゃ？</p>
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
    </StageScreen>
  );
}
