import { useEffect, useRef } from 'react';
import inyaaGuide from '../assets/inyaa-guide.png';
import { createBubblePool } from '../lib/display/dashBubbles';
import { STAGE_WIDTH } from '../lib/ui/stageScale';
import styles from './CompleteScreen.module.css';
import { StageScreen } from './StageScreen';
import { StepIndicator } from './StepIndicator';

/** 絵が上へ泳ぎ出すまでの時間と、泳いで画面の外へ出るまでの時間（CSS の swim-away と合わせる） */
const SWIM_DELAY_MS = 1200;
const SWIM_DURATION_MS = 2200;
/** 泳いでいる間に、絵のまわりから泡を出す間隔 */
const BUBBLE_INTERVAL_MS = 70;

type CompleteScreenProps = {
  imageData: string | null;
};

/**
 * 作品を送ったあとの画面（③ うみへ）。
 * 描いた絵が泡と一緒に上へ泳いでいき、大画面では上から沈んでくるので、つながって見える。
 */
export function CompleteScreen({ imageData }: CompleteScreenProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const bubbleLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = bubbleLayerRef.current;
    const image = imageRef.current;

    if (layer === null || image === null) {
      return;
    }

    const bubblePool = createBubblePool(layer);
    let intervalId: number | undefined;

    // 泳いでいる絵のまわりから泡を出す。泡は舞台に置くので、舞台の実寸に直して渡す
    const spawnBubble = () => {
      const stageRect = layer.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const scale = stageRect.width / STAGE_WIDTH;
      const x = (imageRect.left - stageRect.left + Math.random() * imageRect.width) / scale;
      const y = (imageRect.bottom - stageRect.top) / scale - Math.random() * 60;

      bubblePool.rise(x, y);
    };

    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(spawnBubble, BUBBLE_INTERVAL_MS);
    }, SWIM_DELAY_MS);
    const stopId = window.setTimeout(
      () => window.clearInterval(intervalId),
      SWIM_DELAY_MS + SWIM_DURATION_MS,
    );

    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(stopId);
      window.clearInterval(intervalId);
      bubblePool.dispose();
    };
  }, []);

  return (
    <StageScreen labelledBy="complete-title">
      <StepIndicator current={3} />

      <div className={styles.paper}>
        <span className={styles.tape} aria-hidden="true" />
        {imageData !== null && (
          <img ref={imageRef} className={styles.creature} src={imageData} alt="かいた え" />
        )}
      </div>

      {/* 泡は紙より手前に出す */}
      <div
        ref={bubbleLayerRef}
        className={styles.bubbleLayer}
        data-bubble-class={styles.bubble}
        aria-hidden="true"
      />

      <div className={styles.message}>
        <h1 id="complete-title" className={styles.title}>
          うみに はなしたよ！
        </h1>
        <p className={styles.subtitle}>おおきな がめんを みてね</p>
      </div>

      <img className={styles.guideImage} src={inyaaGuide} alt="" />
    </StageScreen>
  );
}
