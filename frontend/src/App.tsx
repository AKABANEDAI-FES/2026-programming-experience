import { useEffect, useState } from 'react';
import type { DrawMode } from 'shared';
import { CompleteScreen } from './components/CompleteScreen';
import { DrawingScreen } from './components/DrawingScreen';
import { HomeScreen } from './components/HomeScreen';
import { ProgrammingScreen } from './components/ProgrammingScreen';
import styles from './App.module.css';
import { installKioskSafety } from './lib/ui/kioskSafety';

type AppStep = 'home' | 'drawing' | 'programming' | 'complete';

/** 完了画面を表示する時間。展示運用に合わせて変更する。 */
const COMPLETION_SCREEN_DURATION_MS = 5_000;

function App() {
  useEffect(() => installKioskSafety(window), []);

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

  const handleRestart = () => {
    setDrawMode(null);
    setImageData(null);
    setStep('home');
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
          onRestart={handleRestart}
        />
      );
    }

    if (step === 'complete') {
      return <CompleteScreen imageData={imageData} />;
    }

    if (imageData === null) {
      return <HomeScreen onSelectMode={handleSelectMode} />;
    }

    return (
      <ProgrammingScreen
        imageData={imageData}
        onReleaseComplete={handleReleaseComplete}
        onRestart={handleRestart}
      />
    );
  };

  return <main className={styles.app}>{renderCurrentScreen()}</main>;
}

export default App;
