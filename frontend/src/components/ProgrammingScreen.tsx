import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Pointer } from 'lucide-react';
import { MAX_COMMANDS, type Command, type ReleaseRequest, type ReleaseResponse } from 'shared';
import { countCommands } from 'shared/release';
import inyaaGuide from '../assets/inyaa-guide.png';
import {
  conditionsUsed,
  createPreviewMotion,
  isSameCommands,
  previewWorldAt,
  stepPreviewMotion,
  toPreviewVisual,
} from '../lib/display/previewMotion';
import { getReleaseFeedback, type ReleaseState } from '../lib/release-feedback';
import {
  DEV_RELEASE_TOKEN,
  getReleaseAuthorizationHeader,
  prepareSubmissionAttempt,
  shouldRecoverIdempotencyKey,
  type SubmissionAttempt,
} from '../lib/release-submission';
import { BlockWorkspace, type PlacementGuide } from './BlockWorkspace';
import { RestartControl } from './RestartControl';
import styles from './ProgrammingScreen.module.css';
import { StageScreen } from './StageScreen';
import { StepIndicator } from './StepIndicator';
import { ConfirmDialog } from './ConfirmDialog';

type ProgrammingScreenProps = {
  imageData: string;
  onReleaseComplete: () => void;
  onRestart: () => void;
};

type PlacementDemoProps = {
  guide: PlacementGuide;
};

/** ワークスペースが空のあいだ、手がブロックを一覧からワークスペースの真ん中まで運んで見せる */
function PlacementDemo({ guide }: PlacementDemoProps) {
  const { from, to } = guide;

  return (
    <div
      className={styles.placementDemo}
      style={
        {
          left: from.left,
          top: from.top,
          '--demo-dx': `${to.left - from.left}px`,
          '--demo-dy': `${to.top - from.top}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <svg
        className={`${styles.demoBlock} ${guide.rendererClassName}`}
        width={from.width}
        height={from.height}
        viewBox={guide.viewBox}
        // 自分たちで定義したブロックを Blockly が描いたものを写すだけなので、そのまま入れてよい
        dangerouslySetInnerHTML={{ __html: guide.blockMarkup }}
      />
      <Pointer
        className={styles.demoHand}
        style={{ left: from.width * 0.4, top: from.height * 0.45 }}
        size={from.height * 1.4}
      />
    </div>
  );
}

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
  const [placementGuide, setPlacementGuide] = useState<PlacementGuide | null>(null);

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
      <BlockWorkspace
        onCommandsChange={onCommandsChange}
        onPlacementGuideChange={setPlacementGuide}
        scale={scale}
      />
      {placementGuide !== null && <PlacementDemo guide={placementGuide} />}
    </div>
  );
}

/** 一度に進める時間の上限。タブを離れて戻ったときに、動きが一気に飛ばないようにする */
const MAX_PREVIEW_DELTA_MS = 100;

type CreaturePreviewProps = {
  imageData: string;
  commands: Command[];
};

/**
 * 組んだブロックの順に、かいた絵をその場で動かして見せる（大画面と同じ動きの計算を使う）。
 * ブロックを変えたら、最初から再生し直す。
 */
function CreaturePreview({ imageData, commands }: CreaturePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const friendRef = useRef<HTMLSpanElement>(null);
  const commandsRef = useRef(commands);
  const motionRef = useRef(createPreviewMotion());
  // 「もし」の条件を試すための見立ての時計（ブロックを変えたら 0 に戻す）
  const worldClockRef = useRef(0);

  useEffect(() => {
    // ワークスペースをクリックしただけなど、中身が変わっていなければ再生を続ける
    if (isSameCommands(commands, commandsRef.current)) {
      return;
    }

    commandsRef.current = commands;
    motionRef.current = createPreviewMotion();
    worldClockRef.current = 0;
  }, [commands]);

  useEffect(() => {
    let previous: number | null = null;

    const tick = (now: number) => {
      const delta = previous === null ? 0 : Math.min(now - previous, MAX_PREVIEW_DELTA_MS);
      previous = now;
      worldClockRef.current += delta;

      // なかまやはしの見立ては、その条件を使っているときだけ見せる
      const used = conditionsUsed(commandsRef.current);
      const world = previewWorldAt(worldClockRef.current);
      const shownWorld = {
        friendNear: used.has('near_friend') && world.friendNear,
        friendProgress: used.has('near_friend') ? world.friendProgress : null,
        atEdge: used.has('at_edge') && world.atEdge,
      };

      motionRef.current = stepPreviewMotion(
        motionRef.current,
        commandsRef.current,
        delta,
        shownWorld,
      );
      const visual = toPreviewVisual(motionRef.current, commandsRef.current);
      const image = imageRef.current;
      const bubble = bubbleRef.current;
      const friend = friendRef.current;

      if (friend !== null) {
        friend.hidden = shownWorld.friendProgress === null;
        // 右から左へ、作品のうしろを通りかかる
        friend.style.left = `${100 - (shownWorld.friendProgress ?? 0) * 100}%`;
      }

      frameRef.current?.toggleAttribute('data-at-edge', shownWorld.atEdge);

      if (image !== null) {
        image.style.transform = `translate(${visual.offsetX}px, ${visual.offsetY}px) rotate(${visual.rotation}deg) scale(${visual.scale})`;
      }

      if (bubble !== null) {
        bubble.hidden = visual.sayText === null;
        bubble.textContent = visual.sayText;
      }

      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={frameRef} className={styles.creatureFrame}>
      {/* 「なかまが ちかくに いる」を試すときに通りかかる、なかまの影 */}
      <span ref={friendRef} className={styles.previewFriend} aria-hidden="true" hidden />
      <p ref={bubbleRef} className={styles.previewBubble} hidden />
      <img ref={imageRef} className={styles.creatureImage} src={imageData} alt="かいた え" />
    </div>
  );
}

export function ProgrammingScreen({
  imageData,
  onReleaseComplete,
  onRestart,
}: ProgrammingScreenProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [releaseState, setReleaseState] = useState<ReleaseState>('idle');
  const [isConfirmingRelease, setIsConfirmingRelease] = useState(false);
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
      <RestartControl onRestart={onRestart} disabled={isSubmissionUnresolved} />

      <div className={styles.creatureCard}>
        <p className={styles.cardTitle}>きみの なかま</p>
        <CreaturePreview imageData={imageData} commands={commands} />
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
        // 大画面に出ると取り消せないので、最初に押したときは確かめる（送り直すときは確かめない）
        onClick={releaseState === 'idle' ? () => setIsConfirmingRelease(true) : handleRelease}
        disabled={feedback.buttonDisabled}
      >
        {feedback.buttonLabel}
      </button>

      <ConfirmDialog
        open={isConfirmingRelease}
        message="うみに はなして いい？"
        detail="もう なおせないよ"
        imageSrc={imageData}
        cancelLabel="まだ なおす"
        onCancel={() => setIsConfirmingRelease(false)}
        confirmLabel="はなす！"
        onConfirm={() => {
          setIsConfirmingRelease(false);
          void handleRelease();
        }}
      />
    </StageScreen>
  );
}
