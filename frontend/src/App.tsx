import { useEffect, useState } from 'react';
import type { DrawMode } from 'shared';
import { DrawingScreen } from './components/DrawingScreen';
import { HomeScreen } from './components/HomeScreen';
import { ProgrammingScreen } from './components/ProgrammingScreen';
import styles from './App.module.css';

type AppStep = 'home' | 'drawing' | 'programming' | 'complete';

/** 完了画面を表示する時間。展示運用に合わせて変更する。 */
const COMPLETION_SCREEN_DURATION_MS = 5_000;

function App() {
  const [step, setStep] = useState<AppStep>('home');
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);

  const handleSelectMode = (mode: DrawMode) => {
    setDrawMode(mode);
    setImageData(null);
    setStep('drawing');
  };

  const handleDrawingComplete = (nextImageData: string) => {
    setImageData(nextImageData);
    setStep('programming');
  };

  const handleReleaseComplete = () => setStep('complete');

  useEffect(() => {
    if (step !== 'complete') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDrawMode(null);
      setImageData(null);
      setStep('home');
    }, COMPLETION_SCREEN_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [step]);

  const renderCurrentScreen = () => {
    if (step === 'home' || drawMode === null) {
      return <HomeScreen onSelectMode={handleSelectMode} />;
    }

    if (step === 'drawing') {
      return (
        <DrawingScreen
          mode={drawMode}
          onModeChange={setDrawMode}
          onDrawingComplete={handleDrawingComplete}
        />
      );
    }

    if (step === 'complete') {
      return (
        <section aria-labelledby="release-complete-title" className={styles.completeScreen}>
          <p className={styles.completeLabel}>作品を保存しました</p>
          <h1 id="release-complete-title">保存できたよ！</h1>
          <p>作品を受け付けました。</p>
        </section>
      );
    }

    if (imageData === null) {
      return <HomeScreen onSelectMode={handleSelectMode} />;
    }

    return <ProgrammingScreen imageData={imageData} onReleaseComplete={handleReleaseComplete} />;
  };

  return <main className={styles.app}>{renderCurrentScreen()}</main>;
}

export default App;
