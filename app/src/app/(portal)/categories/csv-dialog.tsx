"use client";
import { useRef, useState } from "react";
import { CategoryCsvPanel } from "./csv-panel";
import styles from "./master.module.css";

export function CategoryCsvDialog({ disabled }: { disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  function close() {
    if (pending) return;
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <>
      <button
        type="button"
        className="secondary"
        ref={trigger}
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        CSV取込
      </button>
      <dialog
        ref={dialog}
        className={`${styles.dialog} ${styles.csvDialog}`}
        aria-labelledby="category-csv-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), summary',
            ),
          ).filter((el) => el.getClientRects().length);
          if (!nodes.length) {
            e.preventDefault();
            return;
          }
          if (e.shiftKey && document.activeElement === nodes[0]) {
            e.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
            e.preventDefault();
            nodes[0].focus();
          }
        }}
      >
        <header className={styles.csvHeader}>
          <h2 id="category-csv-title">カテゴリCSV取込</h2>
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={close}
            aria-label="CSV取込を閉じる"
          >
            閉じる
          </button>
        </header>
        <div className={styles.csvBody}>
          {open && <CategoryCsvPanel onPendingChange={setPending} />}
        </div>
      </dialog>
    </>
  );
}
