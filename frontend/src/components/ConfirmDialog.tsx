import { useEffect, useRef } from 'react';
import { useStageScale } from '../lib/ui/useStageScale';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  open: boolean;
  /** 大きく出す問いかけ（例：この えで いい？） */
  message: string;
  /** 2 行目の補足（例：もう なおせないよ） */
  detail?: string;
  /** 確かめてほしい絵 */
  imageSrc?: string;
  /** 戻るボタン（左・控えめ） */
  cancelLabel: string;
  onCancel: () => void;
  /** 進むボタン（右・目立つ色）。ないときは戻るボタンだけを出す */
  confirmLabel?: string;
  onConfirm?: () => void;
  /** 進むボタンの色。消すなど取り消せない操作は danger にする */
  tone?: 'go' | 'danger';
};

/**
 * 進む・消すなど大事な操作の前に出す、子ども向けの確認。
 * <dialog> のモーダルで出すので、縮めた舞台や Blockly より手前に出て、うしろは操作できなくなる。
 * Esc で閉じたときは「戻る」と同じ扱いにする。
 */
export function ConfirmDialog({
  open,
  message,
  detail,
  imageSrc,
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  tone = 'go',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scale = useStageScale();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      style={{ transform: `scale(${scale})` }}
      aria-labelledby="confirm-dialog-message"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {imageSrc !== undefined && (
        <div className={styles.preview}>
          <img className={styles.previewImage} src={imageSrc} alt="かいた え" />
        </div>
      )}
      <p id="confirm-dialog-message" className={styles.message}>
        {message}
      </p>
      {detail !== undefined && <p className={styles.detail}>{detail}</p>}
      <div className={styles.actions} data-single={confirmLabel === undefined}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          {cancelLabel}
        </button>
        {confirmLabel !== undefined && (
          <button
            type="button"
            className={styles.confirmButton}
            data-tone={tone}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </dialog>
  );
}
