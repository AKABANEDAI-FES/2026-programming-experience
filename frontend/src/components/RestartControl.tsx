import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './RestartControl.module.css';

type RestartControlProps = {
  onRestart: () => void;
  disabled?: boolean;
};

export function RestartControl({ onRestart, disabled = false }: RestartControlProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const cancel = () => setIsDialogOpen(false);
  const confirm = () => {
    setIsDialogOpen(false);
    onRestart();
  };

  return (
    <>
      <button
        type="button"
        className={styles.button}
        aria-label="さいしょから"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setIsDialogOpen(true)}
      >
        <span className={styles.icon} aria-hidden="true">
          ◀
        </span>
        <span>さいしょから</span>
      </button>
      <ConfirmDialog
        open={isDialogOpen}
        message="さいしょから やりなおす？"
        cancelLabel="やめる"
        onCancel={cancel}
        confirmLabel="やりなおす"
        onConfirm={confirm}
        tone="danger"
      />
    </>
  );
}
