export const COLORS = [
  { value: '#1f2937', label: 'くろ' },
  { value: '#ef4444', label: 'あか' },
  { value: '#f59e0b', label: 'オレンジ' },
  { value: '#eab308', label: 'きいろ' },
  { value: '#22c55e', label: 'みどり' },
  { value: '#3b82f6', label: 'あお' },
  { value: '#8b5cf6', label: 'むらさき' },
  { value: '#ec4899', label: 'ピンク' },
] as const;

export const LINE_WIDTHS = [4, 8, 16, 24] as const;

export const DEFAULT_DRAWING_COLOR = COLORS[0].value;
export const DEFAULT_LINE_WIDTH = LINE_WIDTHS[1];
