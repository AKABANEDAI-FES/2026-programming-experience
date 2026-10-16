import goggles from '../assets/inyaa-coloring-goggles.png';
import snorkel from '../assets/inyaa-coloring-snorkel.png';

export type ColoringTemplateId = 'goggles' | 'snorkel';

type ColoringTemplate = {
  id: ColoringTemplateId;
  /** 選ぶボタンに出す名前 */
  label: string;
  /** 1000×600 の線画（背景は透明） */
  src: string;
};

/** 塗り絵の下絵。先頭が最初に表示される */
export const COLORING_TEMPLATES: readonly ColoringTemplate[] = [
  { id: 'goggles', label: 'ゴーグル', src: goggles },
  { id: 'snorkel', label: 'シュノーケル', src: snorkel },
];

export const DEFAULT_COLORING_TEMPLATE_ID: ColoringTemplateId = COLORING_TEMPLATES[0].id;
