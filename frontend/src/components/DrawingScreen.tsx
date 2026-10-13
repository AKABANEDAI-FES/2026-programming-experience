import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import type { DrawMode } from 'shared';
import inyaaOutline from '../assets/inyaa-outline.svg';
import { DrawingToolbar, type Tool } from './DrawingToolbar';
import { DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH } from './drawingToolbarOptions';
import { DRAW_MODES, DRAW_MODE_COPY } from '../constants/drawModes';
import { applyFillToEditingLayer } from '../lib/paint/applyFillToEditingLayer';
import { clearOuterBackground } from '../lib/paint/clearOuterBackground';
import { createChangedPixelMask } from '../lib/paint/createChangedPixelMask';
import { floodFill, type Rgba } from '../lib/paint/floodFill';
import type { DrawingHistoryEntry } from '../types/drawing';
import styles from './DrawingScreen.module.css';

type DrawingScreenProps = {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  onDrawingComplete: (imageData: string) => void;
};

type Point = {
  x: number;
  y: number;
};

type FillFeedback = {
  id: number;
  message: string;
};

type CursorIndicator = {
  leftPercent: number;
  topPercent: number;
  diameter: number;
};

const DRAWING_WIDTH = 1000;
const DRAWING_HEIGHT = 600;
const MAX_HISTORY_ENTRIES = 10;
const UNFILLABLE_MESSAGE = 'この範囲は塗りつぶせないよ。線で囲んでみよう！';
const FILL_ERROR_MESSAGE = 'うまく塗りつぶせなかったよ。もう一度試してね。';
const HIGHLIGHT_COLOR: Rgba = { r: 239, g: 68, b: 68, a: 104 };
const FILL_CURSOR_DIAMETER = 18;

const toRgba = (hex: string): Rgba => {
  const value = hex.slice(1);

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: 255,
  };
};

export function DrawingScreen({ mode, onModeChange, onDrawingComplete }: DrawingScreenProps) {
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerId = useRef<number | null>(null);
  const previousPoint = useRef<Point | null>(null);
  const lastPointerClient = useRef<{ clientX: number; clientY: number } | null>(null);
  const isReadyToDraw = useRef(false);
  const hasDrawing = useRef(false);
  const history = useRef<DrawingHistoryEntry[]>([]);
  const nextFillFeedbackId = useRef(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(DEFAULT_DRAWING_COLOR);
  const [lineWidth, setLineWidth] = useState<number>(DEFAULT_LINE_WIDTH);
  const [canUndo, setCanUndo] = useState(false);
  const [canClear, setCanClear] = useState(false);
  const [fillFeedback, setFillFeedback] = useState<FillFeedback | null>(null);
  const [cursorIndicator, setCursorIndicator] = useState<CursorIndicator | null>(null);
  const copy = DRAW_MODE_COPY[mode];

  const cancelActiveStroke = () => {
    const pointerId = activePointerId.current;
    const canvas = canvasRef.current;

    if (pointerId !== null && canvas?.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    activePointerId.current = null;
    previousPoint.current = null;
  };

  const saveHistory = (context: CanvasRenderingContext2D) => {
    const entry = {
      imageData: context.getImageData(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT),
      hasDrawing: hasDrawing.current,
    };

    if (history.current.length === MAX_HISTORY_ENTRIES) {
      history.current.shift();
    }

    history.current.push(entry);
    setCanUndo(true);
  };

  const clearFillFeedback = () => {
    const highlightContext = highlightCanvasRef.current?.getContext('2d');

    highlightContext?.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    setFillFeedback(null);
  };

  const showFillFeedback = (message: string, mask?: Uint8Array) => {
    const highlightContext = highlightCanvasRef.current?.getContext('2d');

    if (highlightContext !== null && highlightContext !== undefined) {
      highlightContext.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);

      if (mask?.length === DRAWING_WIDTH * DRAWING_HEIGHT) {
        const highlightImageData = highlightContext.createImageData(DRAWING_WIDTH, DRAWING_HEIGHT);

        for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
          if (mask[pixelIndex] === 0) {
            continue;
          }

          const offset = pixelIndex * 4;
          highlightImageData.data[offset] = HIGHLIGHT_COLOR.r;
          highlightImageData.data[offset + 1] = HIGHLIGHT_COLOR.g;
          highlightImageData.data[offset + 2] = HIGHLIGHT_COLOR.b;
          highlightImageData.data[offset + 3] = HIGHLIGHT_COLOR.a;
        }

        highlightContext.putImageData(highlightImageData, 0, 0);
      }
    }

    nextFillFeedbackId.current += 1;
    setFillFeedback({ id: nextFillFeedbackId.current, message });
  };

  useEffect(() => {
    const backgroundCanvas = backgroundCanvasRef.current;
    const canvas = canvasRef.current;

    if (backgroundCanvas === null || canvas === null) {
      return;
    }

    const backgroundContext = backgroundCanvas.getContext('2d');
    if (backgroundContext === null) {
      return;
    }

    let isCurrent = true;
    isReadyToDraw.current = false;
    cancelActiveStroke();

    const resetBackground = () => {
      backgroundContext.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      backgroundContext.fillStyle = '#ffffff';
      backgroundContext.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    };

    resetBackground();

    if (mode === 'free') {
      isReadyToDraw.current = true;
      return () => {
        isCurrent = false;
        cancelActiveStroke();
      };
    }

    const outlineImage = new Image();
    outlineImage.onload = () => {
      if (!isCurrent) {
        return;
      }

      const scale = Math.min(
        (DRAWING_WIDTH * 0.7) / outlineImage.naturalWidth,
        (DRAWING_HEIGHT * 0.8) / outlineImage.naturalHeight,
      );
      const width = outlineImage.naturalWidth * scale;
      const height = outlineImage.naturalHeight * scale;

      backgroundContext.drawImage(
        outlineImage,
        (DRAWING_WIDTH - width) / 2,
        (DRAWING_HEIGHT - height) / 2,
        width,
        height,
      );
      isReadyToDraw.current = true;
    };
    outlineImage.onerror = () => {
      if (isCurrent) {
        isReadyToDraw.current = true;
      }
    };
    outlineImage.src = inyaaOutline;

    return () => {
      isCurrent = false;
      cancelActiveStroke();
    };
  }, [mode]);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * DRAWING_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * DRAWING_HEIGHT;

    return {
      x: Math.min(Math.max(Math.floor(x), 0), DRAWING_WIDTH - 1),
      y: Math.min(Math.max(Math.floor(y), 0), DRAWING_HEIGHT - 1),
    };
  };

  const updateCursorIndicatorAt = useCallback(
    (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
      const bounds = canvas.getBoundingClientRect();
      const scale = bounds.width / DRAWING_WIDTH;

      setCursorIndicator({
        leftPercent: ((clientX - bounds.left) / bounds.width) * 100,
        topPercent: ((clientY - bounds.top) / bounds.height) * 100,
        diameter: tool === 'fill' ? FILL_CURSOR_DIAMETER : lineWidth * scale,
      });
    },
    [tool, lineWidth, setCursorIndicator],
  );

  const updateCursorIndicator = (event: PointerEvent<HTMLCanvasElement>) => {
    lastPointerClient.current = { clientX: event.clientX, clientY: event.clientY };
    updateCursorIndicatorAt(event.currentTarget, event.clientX, event.clientY);
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null || lastPointerClient.current === null) {
      return;
    }

    updateCursorIndicatorAt(
      canvas,
      lastPointerClient.current.clientX,
      lastPointerClient.current.clientY,
    );
  }, [updateCursorIndicatorAt]);

  const drawDot = (context: CanvasRenderingContext2D, point: Point) => {
    context.beginPath();
    context.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  };

  const configureContext = (context: CanvasRenderingContext2D) => {
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };

  const fillAtPoint = (
    context: CanvasRenderingContext2D,
    editingCanvas: HTMLCanvasElement,
    point: Point,
  ) => {
    const backgroundCanvas = backgroundCanvasRef.current;

    if (backgroundCanvas === null) {
      return;
    }

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = DRAWING_WIDTH;
    compositeCanvas.height = DRAWING_HEIGHT;
    const compositeContext = compositeCanvas.getContext('2d');

    if (compositeContext === null) {
      return;
    }

    compositeContext.drawImage(backgroundCanvas, 0, 0);
    compositeContext.drawImage(editingCanvas, 0, 0);

    const compositeImageData = compositeContext.getImageData(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    const originalCompositeData = new Uint8ClampedArray(compositeImageData.data);
    const fillColor = toRgba(color);
    const result = floodFill(
      compositeImageData.data,
      DRAWING_WIDTH,
      DRAWING_HEIGHT,
      point.x,
      point.y,
      fillColor,
    );

    if (result.aborted) {
      showFillFeedback(FILL_ERROR_MESSAGE);
      return;
    }

    if (result.filledPixels === 0) {
      return;
    }

    const filledMask = createChangedPixelMask(originalCompositeData, compositeImageData.data);

    // Canvas端へつながる領域は背景とみなし、塗らずに対象範囲を案内する。
    if (result.touchesEdge) {
      showFillFeedback(UNFILLABLE_MESSAGE, filledMask);
      return;
    }

    const editingImageData = context.getImageData(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);

    applyFillToEditingLayer(
      editingImageData.data,
      DRAWING_WIDTH,
      DRAWING_HEIGHT,
      filledMask,
      fillColor,
    );

    saveHistory(context);
    context.globalCompositeOperation = 'source-over';
    context.putImageData(editingImageData, 0, 0);
    hasDrawing.current = true;
    setCanClear(true);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (
      !isReadyToDraw.current ||
      !event.isPrimary ||
      activePointerId.current !== null ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const context = event.currentTarget.getContext('2d');

    if (context === null) {
      return;
    }

    event.preventDefault();
    const point = getPoint(event);
    updateCursorIndicator(event);
    clearFillFeedback();

    if (tool === 'fill') {
      try {
        fillAtPoint(context, event.currentTarget, point);
      } catch (error) {
        console.error('塗りつぶし処理に失敗しました', error);
        showFillFeedback(FILL_ERROR_MESSAGE);
      }
      return;
    }

    saveHistory(context);

    activePointerId.current = event.pointerId;
    previousPoint.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    configureContext(context);
    drawDot(context, point);
    hasDrawing.current = true;
    setCanClear(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    updateCursorIndicator(event);

    if (activePointerId.current !== event.pointerId || previousPoint.current === null) {
      return;
    }

    const context = event.currentTarget.getContext('2d');

    if (context === null) {
      return;
    }

    event.preventDefault();
    const point = getPoint(event);

    configureContext(context);
    context.beginPath();
    context.moveTo(previousPoint.current.x, previousPoint.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    previousPoint.current = point;
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    cancelActiveStroke();
  };

  const handleUndo = () => {
    const context = canvasRef.current?.getContext('2d');
    const previousState = history.current.pop();

    if (context === null || context === undefined || previousState === undefined) {
      return;
    }

    clearFillFeedback();
    context.globalCompositeOperation = 'source-over';
    context.putImageData(previousState.imageData, 0, 0);
    hasDrawing.current = previousState.hasDrawing;
    setCanClear(previousState.hasDrawing);
    setCanUndo(history.current.length > 0);
  };

  const handleClear = () => {
    const context = canvasRef.current?.getContext('2d');

    if (context === null || context === undefined || !hasDrawing.current) {
      return;
    }

    if (!window.confirm('いまのおえかきをぜんぶ消しますか？')) {
      return;
    }

    cancelActiveStroke();
    clearFillFeedback();
    saveHistory(context);
    context.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    hasDrawing.current = false;
    setCanClear(false);
  };

  const handleModeChange = (nextMode: DrawMode) => {
    if (nextMode === mode) {
      return;
    }

    cancelActiveStroke();
    clearFillFeedback();
    onModeChange(nextMode);
  };

  const handleNext = () => {
    const backgroundCanvas = backgroundCanvasRef.current;
    const editingCanvas = canvasRef.current;

    if (backgroundCanvas === null || editingCanvas === null) {
      return;
    }

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = DRAWING_WIDTH;
    compositeCanvas.height = DRAWING_HEIGHT;
    const compositeContext = compositeCanvas.getContext('2d');

    if (compositeContext === null) {
      return;
    }

    compositeContext.drawImage(backgroundCanvas, 0, 0);
    compositeContext.drawImage(editingCanvas, 0, 0);

    // 大画面ではキャラクターの形だけを泳がせたいので、外側の白い背景は透明にして渡す
    const imageData = compositeContext.getImageData(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    clearOuterBackground(imageData.data, DRAWING_WIDTH, DRAWING_HEIGHT);
    compositeContext.putImageData(imageData, 0, 0);

    onDrawingComplete(compositeCanvas.toDataURL('image/png'));
  };

  return (
    <section className={styles.screen} aria-labelledby="drawing-title">
      <div className={styles.header}>
        <p className={styles.label}>おえかきモード</p>
        <h1 id="drawing-title" className={styles.title}>
          {copy.label}
        </h1>
        <p className={styles.description}>{copy.drawingDescription}</p>
      </div>

      <div className={styles.modeSwitcher} role="group" aria-label="おえかきモードを切り替える">
        {DRAW_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.modeButton}
            aria-pressed={mode === option}
            onClick={() => handleModeChange(option)}
          >
            {DRAW_MODE_COPY[option].label}
          </button>
        ))}
      </div>

      <DrawingToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        lineWidth={lineWidth}
        onLineWidthChange={setLineWidth}
        canUndo={canUndo}
        canClear={canClear}
        onUndo={handleUndo}
        onClear={handleClear}
      />

      <div className={styles.drawingArea}>
        <canvas
          ref={backgroundCanvasRef}
          className={styles.backgroundCanvas}
          width={DRAWING_WIDTH}
          height={DRAWING_HEIGHT}
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          className={`${styles.canvas} ${styles.canvasNoCursor}`}
          width={DRAWING_WIDTH}
          height={DRAWING_HEIGHT}
          role="img"
          aria-label={`${copy.label}の描画エリア`}
          aria-describedby="drawing-instructions"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnter={updateCursorIndicator}
          onPointerLeave={() => {
            lastPointerClient.current = null;
            setCursorIndicator(null);
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        <canvas
          ref={highlightCanvasRef}
          className={styles.highlightCanvas}
          width={DRAWING_WIDTH}
          height={DRAWING_HEIGHT}
          aria-hidden="true"
        />
        <div className={styles.cursorLayer} aria-hidden="true">
          {cursorIndicator !== null && (
            <div
              className={
                tool === 'eraser'
                  ? styles.eraserCursor
                  : tool === 'fill'
                    ? styles.fillCursor
                    : styles.penCursor
              }
              style={
                {
                  left: `${cursorIndicator.leftPercent}%`,
                  top: `${cursorIndicator.topPercent}%`,
                  width: `${cursorIndicator.diameter}px`,
                  height: `${cursorIndicator.diameter}px`,
                  '--cursor-color': color,
                } as CSSProperties
              }
            />
          )}
        </div>
        {fillFeedback !== null && (
          <div key={fillFeedback.id} className={styles.fillToast} role="status" aria-live="polite">
            {fillFeedback.message}
          </div>
        )}
        <p id="drawing-instructions" className={styles.drawingHint}>
          {copy.drawingHint}
        </p>
      </div>
      <button type="button" className={styles.nextButton} onClick={handleNext}>
        次へ
      </button>
    </section>
  );
}
