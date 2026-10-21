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

type BlockWorkspaceProps = {
  onCommandsChange?: (commands: Command[]) => void;
  /** 舞台の縮め具合。Blockly 自体は縮めずに置くため、ブロックの大きさだけを合わせる */
  scale?: number;
};

export function BlockWorkspace({ onCommandsChange, scale = 1 }: BlockWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const onCommandsChangeRef = useRef(onCommandsChange);
  // Blockly はフォントの読み込みを待ってから作るため、作る時点の最新の倍率を ref で渡す
  const scaleRef = useRef(scale);

  useEffect(() => {
    onCommandsChangeRef.current = onCommandsChange;
  }, [onCommandsChange]);

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

      const handleChange = () => {
        const json = Blockly.serialization.workspaces.save(workspace);
        onCommandsChangeRef.current?.(workspaceToCommands(json));
      };
      workspace.addChangeListener(handleChange);

      const resizeObserver = new ResizeObserver(() => {
        Blockly.svgResize(workspace);
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

    if (workspace === null) {
      return;
    }

    workspace.setScale(BASE_BLOCK_SCALE * scale);
    // 一覧（フライアウト）の大きさは workspace のズームとは別なので、作り直して合わせる
    workspace.getFlyout()?.reflow();
  }, [scale]);

  return (
    <div
      ref={containerRef}
      className={styles.workspace}
      aria-label="ブロックプログラミングのワークスペース"
    />
  );
}
