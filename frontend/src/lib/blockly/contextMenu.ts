import * as Blockly from 'blockly';

/** 体験では使わず、無効化で5個制限を抜けられてしまうため右クリックメニューから外す */
const UNUSED_MENU_ITEMS = [
  'blockDisable',
  'blockComment',
  'blockCollapseExpand',
  'blockInline',
  'collapseWorkspace',
  'expandWorkspace',
];

export const removeUnusedContextMenuItems = () => {
  for (const id of UNUSED_MENU_ITEMS) {
    if (Blockly.ContextMenuRegistry.registry.getItem(id) !== null) {
      Blockly.ContextMenuRegistry.registry.unregister(id);
    }
  }
};
