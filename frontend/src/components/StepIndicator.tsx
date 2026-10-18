import styles from './StepIndicator.module.css';

const STEPS = ['かく', 'うごかす', 'うみへ'] as const;

type StepIndicatorProps = {
  /** 今いる手順（1 から数える） */
  current: 1 | 2 | 3;
};

/** 画面の上に出す進み具合（① かく ▶ ② うごかす ▶ ③ うみへ） */
export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol className={styles.steps} aria-label="すすみぐあい">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const state = step < current ? 'done' : step === current ? 'current' : 'todo';

        return (
          <li
            key={label}
            className={styles.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.number}>{state === 'done' ? '✓' : step}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
