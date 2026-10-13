import type { CSSProperties } from 'react';
import { COLORS, LINE_WIDTHS } from './drawingToolbarOptions';
import styles from './DrawingToolbar.module.css';

export type Tool = 'pen' | 'eraser' | 'fill';

type DrawingToolbarProps = {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  lineWidth: number;
  onLineWidthChange: (lineWidth: number) => void;
  canUndo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onClear: () => void;
};

export function DrawingToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  lineWidth,
  onLineWidthChange,
  canUndo,
  canClear,
  onUndo,
  onClear,
}: DrawingToolbarProps) {
  return (
    <div className={styles.toolbar} aria-label="おえかきのどうぐ">
      <div className={styles.toolGroup} role="group" aria-label="どうぐを選ぶ">
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={tool === 'pen'}
          onClick={() => onToolChange('pen')}
        >
          ペン
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={tool === 'eraser'}
          onClick={() => onToolChange('eraser')}
        >
          けしゴム
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={tool === 'fill'}
          onClick={() => onToolChange('fill')}
        >
          ぬりつぶし
        </button>
      </div>

      <div className={styles.colorGroup} role="group" aria-label="色を選ぶ">
        {COLORS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.colorButton}
            style={{ '--color-swatch': option.value } as CSSProperties}
            aria-label={`${option.label}を選ぶ`}
            aria-pressed={color === option.value}
            onClick={() => onColorChange(option.value)}
          />
        ))}
      </div>

      <label className={styles.lineWidthLabel}>
        太さ
        <select
          value={lineWidth}
          onChange={(event) => onLineWidthChange(Number(event.target.value))}
        >
          {LINE_WIDTHS.map((width) => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>

      <div className={styles.actionGroup}>
        <button type="button" className={styles.actionButton} disabled={!canUndo} onClick={onUndo}>
          ひとつ戻す
        </button>
        <button type="button" className={styles.clearButton} disabled={!canClear} onClick={onClear}>
          全部消す
        </button>
      </div>
    </div>
  );
}
