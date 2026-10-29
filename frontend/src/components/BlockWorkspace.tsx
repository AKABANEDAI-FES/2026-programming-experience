import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import * as ja from 'blockly/msg/ja';
import type { Command } from 'shared';
import { MAX_COMMANDS } from 'shared';
import { defineCommandBlocks } from '../lib/blockly/blocks';
import { removeUnusedContextMenuItems } from '../lib/blockly/contextMenu';
import { KIDS_FONT, KIDS_THEME } from '../lib/blockly/theme';
import { TOOLBOX } from '../lib/blockly/toolbox';
import { workspaceToCommands } from '../lib/blockly/workspaceToCommands';
import styles from './BlockWorkspace.module.css';

Blockly.setLocale(ja as unknown as Record<string, string>);
defineCommandBlocks();
removeUnusedContextMenuItems();

/** 1920×1080 の舞台のときのブロックの大きさ（ブロックの一覧がスクロールせずに収まる大きさ） */
const BASE_BLOCK_SCALE = 1.45;

/**
 * ワークスペースが空のときに、手がブロックを一覧から運んで見せるための位置と見た目。
 * 位置はすべて BlockWorkspace の左上からの画面上の px
 */
export type PlacementGuide = {
  /** 運んで見せる、一覧の先頭のブロックの位置と大きさ */
  from: { left: number; top: number; width: number; height: number };
  /** 運ぶ先（ブロックの左上をここに合わせる） */
  to: { left: number; top: number };
  /** 一覧の先頭のブロックを写した SVG（Blockly が描いたもの） */
  blockMarkup: string;
  /** 写したブロックの描き方の範囲（SVG の viewBox） */
  viewBox: string;
  /** Blockly の文字の色などを効かせるためのクラス（レンダラーとテーマ） */
  rendererClassName: string;
};

/** 空のワークスペースなら、一覧の先頭のブロックを真ん中まで運ぶ案内を作る。ブロックがあれば null */
const measurePlacementGuide = (
  workspace: Blockly.WorkspaceSvg,
  container: HTMLElement,
): PlacementGuide | null => {
  if (workspace.getAllBlocks(false).length > 0) {
    return null;
  }

  const flyoutBlock = workspace.getFlyout()?.getWorkspace().getTopBlocks(true)[0];

  if (flyoutBlock === undefined) {
    return null;
  }

  const blockRoot = flyoutBlock.getSvgRoot();
  const blockRect = blockRoot.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const { absoluteLeft, absoluteTop, viewWidth, viewHeight } = workspace.getMetrics();
  // 一覧の中の位置（translate）を外して写し、運ぶ先で描き直す
  const copy = blockRoot.cloneNode(true) as SVGGElement;
  copy.removeAttribute('transform');
  const box = blockRoot.getBBox();

  return {
    from: {
      left: blockRect.left - containerRect.left,
      top: blockRect.top - containerRect.top,
      width: blockRect.width,
      height: blockRect.height,
    },
    to: {
      left: absoluteLeft + (viewWidth - blockRect.width) / 2,
      top: absoluteTop + (viewHeight - blockRect.height) / 2,
    },
    blockMarkup: copy.outerHTML,
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`,
    rendererClassName: workspace.getInjectionDiv().className.replace('injectionDiv', '').trim(),
  };
};

type BlockWorkspaceProps = {
  onCommandsChange?: (commands: Command[]) => void;
  /** 置き方の案内が変わったとき（ブロックを置いた・画面の大きさが変わったなど）に呼ぶ */
  onPlacementGuideChange?: (guide: PlacementGuide | null) => void;
  /** 舞台の縮め具合。Blockly 自体は縮めずに置くため、ブロックの大きさだけを合わせる */
  scale?: number;
};

export function BlockWorkspace({
  onCommandsChange,
  onPlacementGuideChange,
  scale = 1,
}: BlockWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const onCommandsChangeRef = useRef(onCommandsChange);
  const onPlacementGuideChangeRef = useRef(onPlacementGuideChange);
  // Blockly はフォントの読み込みを待ってから作るため、作る時点の最新の倍率を ref で渡す
  const scaleRef = useRef(scale);

  useEffect(() => {
    onCommandsChangeRef.current = onCommandsChange;
  }, [onCommandsChange]);

  useEffect(() => {
    onPlacementGuideChangeRef.current = onPlacementGuideChange;
  }, [onPlacementGuideChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    let disposed = false;
    let cleanup = () => {};

    const setup = () => {
      const workspace = Blockly.inject(container, {
        toolbox: TOOLBOX,
        theme: KIDS_THEME,
        maxBlocks: MAX_COMMANDS,
        trashcan: true,
        zoom: {
          startScale: BASE_BLOCK_SCALE * scaleRef.current,
          controls: false,
          wheel: false,
        },
        grid: { spacing: 40, length: 3, colour: '#c9d9e6', snap: false },
      });
      workspaceRef.current = workspace;

      const reportPlacementGuide = () =>
        onPlacementGuideChangeRef.current?.(measurePlacementGuide(workspace, container));

      const handleChange = () => {
        const json = Blockly.serialization.workspaces.save(workspace);
        onCommandsChangeRef.current?.(workspaceToCommands(json));
        reportPlacementGuide();
      };
      workspace.addChangeListener(handleChange);
      handleChange();

      const resizeObserver = new ResizeObserver(() => {
        Blockly.svgResize(workspace);
        reportPlacementGuide();
      });
      resizeObserver.observe(container);

      cleanup = () => {
        resizeObserver.disconnect();
        workspace.removeChangeListener(handleChange);
        workspace.dispose();
        workspaceRef.current = null;
      };
    };

    // Blockly はブロックを作るときの文字の幅でブロックの幅を決めるため、丸ゴシックの読み込みを待ってから作る。
    // 読み込めなくても（ネットにつながらないなど）使えるよう、失敗しても作る
    document.fonts
      .load(KIDS_FONT)
      .catch(() => undefined)
      .then(() => {
        if (!disposed) {
          setup();
        }
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
    const workspace = workspaceRef.current;
    const container = containerRef.current;

    if (workspace === null || container === null) {
      return;
    }

    workspace.setScale(BASE_BLOCK_SCALE * scale);
    // 一覧（フライアウト）の大きさは workspace のズームとは別なので、作り直して合わせる
    workspace.getFlyout()?.reflow();
    onPlacementGuideChangeRef.current?.(measurePlacementGuide(workspace, container));
  }, [scale]);

  return (
    <div
      ref={containerRef}
      className={styles.workspace}
      aria-label="ブロックプログラミングのワークスペース"
    />
  );
}
