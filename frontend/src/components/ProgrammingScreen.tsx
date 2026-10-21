import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MAX_COMMANDS, type Command, type ReleaseRequest, type ReleaseResponse } from 'shared';
import { countCommands } from 'shared/release';
import inyaaGuide from '../assets/inyaa-guide.png';
import { getReleaseFeedback, type ReleaseState } from '../lib/release-feedback';
import {
  DEV_RELEASE_TOKEN,
  getReleaseAuthorizationHeader,
  prepareSubmissionAttempt,
  shouldRecoverIdempotencyKey,
  type SubmissionAttempt,
} from '../lib/release-submission';
import { BlockWorkspace } from './BlockWorkspace';
import styles from './ProgrammingScreen.module.css';
import { StageScreen } from './StageScreen';
import { StepIndicator } from './StepIndicator';

type ProgrammingScreenProps = {
  imageData: string;
  onReleaseComplete: () => void;
};

type BlocklyOverlayProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  scale: number;
  disabled: boolean;
  onCommandsChange: (commands: Command[]) => void;
};

/**
 * Blockly は縮めた舞台の中に置くとドラッグの位置がずれるため、舞台の外に置き、
 * 舞台の中の置き場所（slot）とぴったり同じ位置・大きさに重ねる。
 */
function BlocklyOverlay({ slotRef, scale, disabled, onCommandsChange }: BlocklyOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const slot = slotRef.current;

      if (slot !== null) {
        setRect(slot.getBoundingClientRect());
      }
    };

    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [slotRef, scale]);

  return (
    <div
      className={styles.blocklyOverlay}
      style={
        rect === null
          ? { visibility: 'hidden' }
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }
      inert={disabled}
    >
      <BlockWorkspace onCommandsChange={onCommandsChange} scale={scale} />
    </div>
  );
}

export function ProgrammingScreen({ imageData, onReleaseComplete }: ProgrammingScreenProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [releaseState, setReleaseState] = useState<ReleaseState>('idle');
  const attemptRef = useRef<SubmissionAttempt | null>(null);
  const requestInFlightRef = useRef(false);
  const blocklySlotRef = useRef<HTMLDivElement>(null);
  const feedback = getReleaseFeedback(releaseState);
  // くりかえしの中のブロックも合わせて数える（バックエンドの上限と同じ数え方）
  const usedBlocks = countCommands(commands);
  const isFull = usedBlocks >= MAX_COMMANDS;

  const handleCommandsChange = useCallback((nextCommands: Command[]) => {
    setCommands(nextCommands);
    setReleaseState('idle');
  }, []);

  const sendSubmission = async (attempt: SubmissionAttempt, keyRecoveryCount = 0) => {
    // 開発中（npm run dev）だけ、トークン未設定でも開発用トークンで放流できるようにする
    const authorization = getReleaseAuthorizationHeader(
      window.localStorage,
      import.meta.env.DEV ? DEV_RELEASE_TOKEN : null,
    );

    if (authorization === null) {
      setReleaseState('notReady');
      return;
    }

    setReleaseState('sending');

    let response: Response;
    let result: ReleaseResponse;

    try {
      response = await fetch('/api/release', {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'Idempotency-Key': attempt.key,
        },
        body: attempt.body,
      });
      const responseBody: unknown = await response.json();

      if (typeof responseBody !== 'object' || responseBody === null) {
        throw new Error('APIから有効な応答を受け取れませんでした');
      }

      result = responseBody as ReleaseResponse;
    } catch {
      setReleaseState('unknown');
      return;
    }

    if (shouldRecoverIdempotencyKey(result, keyRecoveryCount)) {
      const recoveredAttempt = { ...attempt, key: crypto.randomUUID() };
      attemptRef.current = recoveredAttempt;
      await sendSubmission(recoveredAttempt, keyRecoveryCount + 1);
      return;
    }

    if (!result.success && result.code === 'REQUEST_IN_PROGRESS') {
      setReleaseState('processing');
      return;
    }

    if (!result.success && result.code === 'RELEASE_STATUS_UNKNOWN') {
      setReleaseState('unknown');
      return;
    }

    if (!response.ok || !result.success) {
      setReleaseState('error');
      return;
    }

    onReleaseComplete();
  };

  const handleRelease = async () => {
    if (requestInFlightRef.current || releaseState === 'sending') {
      return;
    }

    requestInFlightRef.current = true;

    try {
      const request: ReleaseRequest = {
        image_base64: imageData,
        commands,
      };
      const body = JSON.stringify(request);
      const attempt = prepareSubmissionAttempt(body, attemptRef.current);

      attemptRef.current = attempt;
      await sendSubmission(attempt);
    } catch {
      setReleaseState('error');
    } finally {
      requestInFlightRef.current = false;
    }
  };

  // 送っている途中や、送れたかわからない間は、ブロックを変えられないようにする
  const isSubmissionUnresolved =
    releaseState === 'sending' || releaseState === 'processing' || releaseState === 'unknown';

  return (
    <StageScreen
      labelledBy="programming-title"
      overlay={(scale) => (
        <BlocklyOverlay
          slotRef={blocklySlotRef}
          scale={scale}
          disabled={isSubmissionUnresolved}
          onCommandsChange={handleCommandsChange}
        />
      )}
    >
      <StepIndicator current={2} />

      <div className={styles.creatureCard}>
        <p className={styles.cardTitle}>きみの なかま</p>
        <div className={styles.creatureFrame}>
          <img className={styles.creatureImage} src={imageData} alt="かいた え" />
        </div>
      </div>

      <img className={styles.guideImage} src={inyaaGuide} alt="" />

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h1 id="programming-title" className={styles.panelTitle}>
            ブロックを ならべよう
          </h1>
          <div className={styles.counter} data-full={isFull} aria-live="polite">
            <span className={styles.counterLabel}>
              {isFull ? 'もう おけないよ' : 'つかった ブロック'}
            </span>
            <span className={styles.pips} aria-hidden="true">
              {Array.from({ length: MAX_COMMANDS }, (_, index) => (
                <span key={index} className={styles.pip} data-used={index < usedBlocks} />
              ))}
            </span>
            <span className={styles.counterValue}>
              {usedBlocks} / {MAX_COMMANDS}
            </span>
          </div>
        </div>
        {/* ここに Blockly を重ねる（BlocklyOverlay） */}
        <div ref={blocklySlotRef} className={styles.blocklySlot} />
      </div>

      {/* ふだんは「うみに はなす」ボタンだけで伝わるので、送信中・失敗のときだけ出す */}
      {feedback.message !== null && (
        <div
          className={styles.message}
          data-tone={feedback.tone}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.tone === 'sending' && (
            <span className={styles.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
          {feedback.tone === 'error' && (
            <span className={styles.errorMark} aria-hidden="true">
              !
            </span>
          )}
          <span className={styles.messageText}>
            <span className={styles.messageMain}>{feedback.message}</span>
            {feedback.detail !== null && (
              <span className={styles.messageDetail}>{feedback.detail}</span>
            )}
          </span>
        </div>
      )}

      <button
        type="button"
        className={styles.releaseButton}
        onClick={handleRelease}
        disabled={feedback.buttonDisabled}
      >
        {feedback.buttonLabel}
      </button>
    </StageScreen>
  );
}
