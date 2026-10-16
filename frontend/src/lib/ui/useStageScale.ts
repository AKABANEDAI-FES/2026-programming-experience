import { useEffect, useState } from 'react';
import { getStageScale } from './stageScale';

const currentScale = () => getStageScale(window.innerWidth, window.innerHeight);

/** ウィンドウの大きさが変わるたびに、1920×1080 の舞台を収める倍率を返す */
export const useStageScale = (): number => {
  const [scale, setScale] = useState(currentScale);

  useEffect(() => {
    const handleResize = () => setScale(currentScale());

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return scale;
};
