import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import type { DrawMode } from 'shared';
import { Eraser, PaintRoller, PenLine } from 'lucide-react';
import {
  COLORING_TEMPLATES,
  DEFAULT_COLORING_TEMPLATE_ID,
  type ColoringTemplateId,
} from '../constants/coloringTemplates';
import { DRAW_MODES, DRAW_MODE_COPY } from '../constants/drawModes';
import { applyFillToEditingLayer } from '../lib/paint/applyFillToEditingLayer';
import { clearOuterBackground } from '../lib/paint/clearOuterBackground';
import { createChangedPixelMask } from '../lib/paint/createChangedPixelMask';
import { MAX_CUSTOM_COLORS, rememberCustomColor } from '../lib/paint/customColorHistory';
import { findVisibleArtworkBounds } from '../lib/display/visibleArtworkBounds';
import { floodFill, type Rgba } from '../lib/paint/floodFill';
import type { DrawingHistoryEntry } from '../types/drawing';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './DrawingScreen.module.css';
import { StageScreen } from './StageScreen';
import { StepIndicator } from './StepIndicator';

const TOOL_OPTIONS = [
  { id: 'pen', label: 'ペン', Icon: PenLine },
  { id: 'eraser', label: 'けしゴム', Icon: Eraser },
  { id: 'fill', label: 'ぬりつぶし', Icon: PaintRoller },
] as const;

type DrawingScreenProps = {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  onDrawingComplete: (imageData: string) => void;
};

type Point = {
  x: number;
  y: number;
};

type Tool = (typeof TOOL_OPTIONS)[number]['id'];

type FillFeedback = {
  id: number;
  message: string;
};

/** 出している確認（なにを確かめているか） */
type DrawingDialog =
  | { kind: 'next'; imageSrc: string }
  | { kind: 'blank' }
  | { kind: 'clear' }
  | { kind: 'template'; templateId: ColoringTemplateId }
  | { kind: 'mode'; mode: DrawMode };

type CursorIndicator = {
  leftPercent: number;
  topPercent: number;
  diameter: number;
};

const DRAWING_WIDTH = 1000;
const DRAWING_HEIGHT = 600;
const MAX_HISTORY_ENTRIES = 10;
const FILL_FEEDBACK_DURATION_MS = 3000;
const UNFILLABLE_MESSAGE = 'ここは ぬれないよ。せんで かこんでから ぬってみよう！';
const FILL_ERROR_MESSAGE = 'うまく ぬれなかったよ。もう いちど ためしてね';
const HIGHLIGHT_COLOR: Rgba = { r: 239, g: 68, b: 68, a: 104 };
/** ぬりつぶしのカーソルの大きさ（舞台の実寸） */
const FILL_CURSOR_DIAMETER = 24;

/**
 * 用意した色。右のパネルに 5 列で並べ、似た色が隣どうしになる順にする
 * （1 段目：あたたかい色、2 段目：つめたい色、3 段目：みどりと黒・灰色。最後のマスは「じぶんでえらぶ」）
 */
const PRESET_COLOR_OPTIONS = [
  { value: '#ef4444', label: 'あか' },
  { value: '#f59e0b', label: 'オレンジ' },
  { value: '#eab308', label: 'きいろ' },
  { value: '#f2a879', label: 'はだいろ' },
  { value: '#92400e', label: 'ちゃいろ' },
  { value: '#ec4899', label: 'ピンク' },
  { value: '#8b5cf6', label: 'むらさき' },
  { value: '#1e3a8a', label: 'こん' },
  { value: '#3b82f6', label: 'あお' },
  { value: '#38bdf8', label: 'みずいろ' },
  { value: '#84cc16', label: 'きみどり' },
  { value: '#22c55e', label: 'みどり' },
  { value: '#6b7280', label: 'はいいろ' },
  { value: '#1f2937', label: 'くろ' },
] as const;

const DEFAULT_COLOR = '#1f2937';
const PRESET_COLORS = new Set<string>(PRESET_COLOR_OPTIONS.map(({ value }) => value));
// カラーピッカー操作中に続けて届く中間色を保存しないための待ち時間。
const CUSTOM_COLOR_SAVE_DELAY_MS = 300;
const NEAR_WHITE_MESSAGE = 'しろっぽい いろは つかえないよ。べつの いろを えらんでね';

/** 線の太さ。ボタンには太さの違いがひと目でわかる大きさの丸を出す（dot は舞台の実寸） */
const LINE_WIDTH_OPTIONS = [
  { width: 4, label: 'ほそい', dot: 12 },
  { width: 8, label: 'ふつう', dot: 20 },
  { width: 16, label: 'ふとい', dot: 32 },
  { width: 24, label: 'いちばん ふとい', dot: 44 },
] as const;

const toRgba = (hex: string): Rgba => {
  const value = hex.slice(1);

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: 255,
  };
};

const isNearWhite = (hex: string): boolean => {
  const { r, g, b } = toRgba(hex);
  return r >= 240 && g >= 240 && b >= 240;
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
  const customColorSaveTimeout = useRef<number | null>(null);
  const nextFillFeedbackId = useRef(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [customColor, setCustomColor] = useState<string>(DEFAULT_COLOR);
  const [savedColors, setSavedColors] = useState<string[]>([]);
  const [colorSource, setColorSource] = useState<'preset' | 'custom' | 'saved'>('preset');
  const [colorNotice, setColorNotice] = useState<string | null>(null);
  const [lineWidth, setLineWidth] = useState<number>(LINE_WIDTH_OPTIONS[1].width);
  const [canUndo, setCanUndo] = useState(false);
  const [canClear, setCanClear] = useState(false);
  const [fillFeedback, setFillFeedback] = useState<FillFeedback | null>(null);
  const [cursorIndicator, setCursorIndicator] = useState<CursorIndicator | null>(null);
  const [templateId, setTemplateId] = useState<ColoringTemplateId>(DEFAULT_COLORING_TEMPLATE_ID);
  const [dialog, setDialog] = useState<DrawingDialog | null>(null);
  const copy = DRAW_MODE_COPY[mode];
  const templateSrc =
    COLORING_TEMPLATES.find(({ id }) => id === templateId)?.src ?? COLORING_TEMPLATES[0].src;

  useEffect(
    () => () => {
      if (customColorSaveTimeout.current !== null) {
        window.clearTimeout(customColorSaveTimeout.current);
      }
    },
    [],
  );

  const saveCustomColor = (nextColor: string) => {
    if (customColorSaveTimeout.current !== null) {
      window.clearTimeout(customColorSaveTimeout.current);
    }

    customColorSaveTimeout.current = null;
    setSavedColors((colors) => rememberCustomColor(colors, nextColor, PRESET_COLORS));
  };

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

  const clearFillFeedback = useCallback(() => {
    const highlightContext = highlightCanvasRef.current?.getContext('2d');

    highlightContext?.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    setFillFeedback(null);
  }, []);

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
    if (fillFeedback === null) {
      return;
    }

    const timeoutId = window.setTimeout(clearFillFeedback, FILL_FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [fillFeedback, clearFillFeedback]);

  // 白っぽい色の注意も、ぬりつぶしの案内と同じように少したったら消す
  useEffect(() => {
    if (colorNotice === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setColorNotice(null), FILL_FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [colorNotice]);

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

      // 下絵はキャンバスと同じ 1000×600 で描かれているため、全体に収まるように描く
      const scale = Math.min(
        DRAWING_WIDTH / outlineImage.naturalWidth,
        DRAWING_HEIGHT / outlineImage.naturalHeight,
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
    outlineImage.src = templateSrc;

    return () => {
      isCurrent = false;
      cancelActiveStroke();
    };
  }, [mode, templateSrc]);

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
      // カーソルは縮めた舞台の中に描くので、画面上の大きさではなく舞台の実寸（offsetWidth）で合わせる
      const scale = canvas.offsetWidth / DRAWING_WIDTH;

      const pointerX = clientX - bounds.left;
      const diameter = tool === 'fill' ? FILL_CURSOR_DIAMETER : lineWidth * scale;
      setCursorIndicator({
        leftPercent: (pointerX / bounds.width) * 100,
        topPercent: ((clientY - bounds.top) / bounds.height) * 100,
        diameter,
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

  const handleUndoKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      !(event.ctrlKey || event.metaKey) ||
      event.shiftKey ||
      event.altKey ||
      event.key.toLowerCase() !== 'z' ||
      !isReadyToDraw.current ||
      history.current.length === 0
    ) {
      return;
    }

    // 文字入力欄ではブラウザー本来のUndoを優先する。
    const target = event.target;
    if (target instanceof HTMLElement) {
      const input = target.closest('input');
      const isTextInput =
        input !== null &&
        ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(input.type);

      if (isTextInput || target.isContentEditable || target.closest('textarea, [role="textbox"]')) {
        return;
      }
    }

    event.preventDefault();
    handleUndo();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleUndoKeyDown(event);
    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClear = () => {
    if (hasDrawing.current) {
      setDialog({ kind: 'clear' });
    }
  };

  const clearDrawing = () => {
    const context = canvasRef.current?.getContext('2d');

    if (context === null || context === undefined || !hasDrawing.current) {
      return;
    }

    cancelActiveStroke();
    clearFillFeedback();
    saveHistory(context);
    context.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    hasDrawing.current = false;
    setCanClear(false);
  };

  /**
   * 描いた絵を消し、「ひとつ もどす」の履歴も捨てる。
   * 下絵が変わるときに使い、前の絵が新しい下絵に重なったり、もどすで戻ったりしないようにする
   */
  const resetDrawing = () => {
    const context = canvasRef.current?.getContext('2d');

    if (context === null || context === undefined) {
      return;
    }

    cancelActiveStroke();
    clearFillFeedback();
    context.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    hasDrawing.current = false;
    history.current = [];
    setCanUndo(false);
    setCanClear(false);
  };

  const handleModeChange = (nextMode: DrawMode) => {
    if (nextMode === mode) {
      return;
    }

    // 描いた絵は消えるので、何か描いてあるときだけ確かめる
    if (hasDrawing.current) {
      setDialog({ kind: 'mode', mode: nextMode });
      return;
    }

    changeMode(nextMode);
  };

  const changeMode = (nextMode: DrawMode) => {
    resetDrawing();
    onModeChange(nextMode);
  };

  const handleTemplateChange = (nextTemplateId: ColoringTemplateId) => {
    if (nextTemplateId === templateId) {
      return;
    }

    // 描いた絵は消えるので、何か描いてあるときだけ確かめる
    if (hasDrawing.current) {
      setDialog({ kind: 'template', templateId: nextTemplateId });
      return;
    }

    changeTemplate(nextTemplateId);
  };

  const changeTemplate = (nextTemplateId: ColoringTemplateId) => {
    resetDrawing();
    setTemplateId(nextTemplateId);
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

    // 何も描いていないと全部透明になり、大画面で見えない作品になるので先へ進ませない
    if (findVisibleArtworkBounds(imageData.data, DRAWING_WIDTH, DRAWING_HEIGHT) === null) {
      setDialog({ kind: 'blank' });
      return;
    }

    compositeContext.putImageData(imageData, 0, 0);
    setDialog({ kind: 'next', imageSrc: compositeCanvas.toDataURL('image/png') });
  };

  const closeDialog = () => setDialog(null);

  /** 確認で「進む」ほうを選んだとき */
  const handleDialogConfirm = () => {
    if (dialog?.kind === 'next') {
      onDrawingComplete(dialog.imageSrc);
      return;
    }

    if (dialog?.kind === 'clear') {
      clearDrawing();
    } else if (dialog?.kind === 'template') {
      changeTemplate(dialog.templateId);
    } else if (dialog?.kind === 'mode') {
      changeMode(dialog.mode);
    }

    closeDialog();
  };

  /** 出している確認ごとの文とボタン */
  const getDialogCopy = (): Pick<
    ComponentProps<typeof ConfirmDialog>,
    'message' | 'detail' | 'imageSrc' | 'cancelLabel' | 'confirmLabel' | 'tone'
  > => {
    switch (dialog?.kind) {
      case 'next':
        return {
          message: 'この えで いい？',
          imageSrc: dialog.imageSrc,
          cancelLabel: 'まだ かく',
          confirmLabel: 'これで いい！',
        };
      case 'clear':
        return {
          message: 'ぜんぶ けして いい？',
          cancelLabel: 'やめる',
          confirmLabel: 'けす',
          tone: 'danger',
        };
      case 'template':
      case 'mode':
        return {
          message: 'かいた えが きえるけど いい？',
          cancelLabel: 'やめる',
          confirmLabel: 'かえる',
          tone: 'danger',
        };
      default:
        // 何も描いていないとき（閉じているときも、閉じる途中の見た目のためにこの文を使う）
        return {
          message: 'まだ なにも かいてないよ',
          detail: 'すきな ものを かいてみよう！',
          cancelLabel: 'かく',
        };
    }
  };

  const selectColor = (nextColor: string, source: 'preset' | 'saved') => {
    if (source === 'saved') {
      setCustomColor(nextColor);
    }

    setColor(nextColor);
    setColorSource(source);
    setColorNotice(null);
  };

  const handleCustomColorChange = (nextColor: string) => {
    if (isNearWhite(nextColor)) {
      setColorNotice(NEAR_WHITE_MESSAGE);
      return;
    }

    setCustomColor(nextColor);
    setColor(nextColor);
    setColorSource(PRESET_COLORS.has(nextColor) ? 'preset' : 'custom');

    if (customColorSaveTimeout.current !== null) {
      window.clearTimeout(customColorSaveTimeout.current);
      customColorSaveTimeout.current = null;
    }

    if (!PRESET_COLORS.has(nextColor)) {
      customColorSaveTimeout.current = window.setTimeout(
        () => saveCustomColor(nextColor),
        CUSTOM_COLOR_SAVE_DELAY_MS,
      );
    }

    setColorNotice(null);
  };

  return (
    <StageScreen labelledBy="drawing-title">
      <h1 id="drawing-title" className={styles.visuallyHidden}>
        {copy.label}
      </h1>

      <StepIndicator current={1} />

      <div className={styles.topBar}>
        <div className={styles.modeSwitcher} role="group" aria-label="おえかきの しかたを えらぶ">
          {DRAW_MODES.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.modeButton}
              aria-pressed={mode === option}
              onClick={() => handleModeChange(option)}
            >
              {DRAW_MODE_COPY[option].homeLabel}
            </button>
          ))}
        </div>

        {mode === 'coloring' && (
          <div className={styles.templateSwitcher} role="group" aria-label="ぬりえを えらぶ">
            {COLORING_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={styles.templateButton}
                aria-pressed={templateId === template.id}
                onClick={() => handleTemplateChange(template.id)}
              >
                <img className={styles.templateThumbnail} src={template.src} alt="" />
                {template.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.paper}>
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
            <div key={fillFeedback.id} className={styles.toast} role="status" aria-live="polite">
              {fillFeedback.message}
            </div>
          )}
          {fillFeedback === null && colorNotice !== null && (
            <div className={styles.toast} role="status" aria-live="polite">
              {colorNotice}
            </div>
          )}
        </div>
      </div>

      {/* 道具は右のパネルに縦に並べる。見出しは置かず、アイコン・色の丸・太さの丸で伝える */}
      <div className={styles.panel} aria-label="おえかきの どうぐ">
        <div className={styles.toolGroup} role="group" aria-label="どうぐを えらぶ">
          {TOOL_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className={styles.colorGrid} role="group" aria-label="いろを えらぶ">
          {PRESET_COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.colorButton}
              style={{ '--color-swatch': option.value } as CSSProperties}
              aria-label={`${option.label}を えらぶ`}
              title={option.label}
              aria-pressed={colorSource === 'preset' && color === option.value}
              onClick={() => selectColor(option.value, 'preset')}
            />
          ))}
          <label
            className={styles.customColorLabel}
            data-active={colorSource === 'custom'}
            title="じぶんで えらぶ"
          >
            <input
              className={styles.customColorInput}
              type="color"
              value={customColor}
              aria-label="じぶんで いろを えらぶ"
              onBlur={() => {
                if (customColorSaveTimeout.current !== null) {
                  saveCustomColor(customColor);
                }
              }}
              onChange={(event) => handleCustomColorChange(event.target.value)}
            />
          </label>
        </div>

        {/* 「じぶんでえらぶ」でつくった色。1 色もないときは段ごと出さない */}
        {savedColors.length > 0 && (
          <div
            className={styles.savedColors}
            role="group"
            aria-label={`つくった いろ（${MAX_CUSTOM_COLORS}いろまで）`}
          >
            {savedColors.map((savedColor, index) => (
              <button
                key={savedColor}
                type="button"
                className={`${styles.colorButton} ${styles.savedColorButton}`}
                style={{ '--color-swatch': savedColor } as CSSProperties}
                aria-label={`つくった いろ ${index + 1}を えらぶ`}
                aria-pressed={colorSource === 'saved' && color === savedColor}
                onClick={() => selectColor(savedColor, 'saved')}
              />
            ))}
          </div>
        )}

        <div className={styles.widthGroup} role="group" aria-label="せんの ふとさを えらぶ">
          {LINE_WIDTH_OPTIONS.map((option) => (
            <button
              key={option.width}
              type="button"
              className={styles.widthButton}
              aria-label={option.label}
              title={option.label}
              aria-pressed={lineWidth === option.width}
              onClick={() => setLineWidth(option.width)}
            >
              <span
                className={styles.widthDot}
                style={{ width: option.dot, height: option.dot, background: color }}
              />
            </button>
          ))}
        </div>

        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.actionButton}
            disabled={!canUndo}
            onClick={handleUndo}
          >
            ひとつ もどす
          </button>
          <button
            type="button"
            className={styles.actionButton}
            disabled={!canClear}
            onClick={handleClear}
          >
            ぜんぶ けす
          </button>
        </div>
      </div>

      <button type="button" className={styles.nextButton} onClick={handleNext}>
        つぎへ
        <span aria-hidden="true">›</span>
      </button>

      <ConfirmDialog
        open={dialog !== null}
        {...getDialogCopy()}
        onCancel={closeDialog}
        onConfirm={handleDialogConfirm}
      />
    </StageScreen>
  );
}
