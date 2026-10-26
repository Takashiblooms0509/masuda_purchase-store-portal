"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DirectoryCustomer } from "@/lib/customers/search";
import { datetime } from "@/lib/business/format";

export function CustomerDetailPanel({
  customer,
  storeName,
  closeHref,
  editForm,
  relatedHref,
}: {
  customer: DirectoryCustomer;
  storeName: string;
  closeHref: string;
  editForm?: React.ReactNode;
  relatedHref?: string;
}) {
  const [editing, setEditing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  useEffect(() => {
    heading.current?.focus();
  }, [customer.id]);
  function restoreSelectionFocus() {
    document.querySelector<HTMLAnchorElement>(".customer-selected a")?.focus();
  }
  return (
    <aside
      className="card customer-detail"
      aria-label="顧客詳細"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !editing) {
          event.preventDefault();
          restoreSelectionFocus();
          router.push(closeHref, { scroll: false });
        }
      }}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUSTOMER</p>
          <h2 ref={heading} tabIndex={-1}>
            {customer.name}
          </h2>
        </div>
        <Link
          className="text-link"
          href={closeHref}
          scroll={false}
          onClick={restoreSelectionFocus}
          aria-label="顧客詳細を閉じる"
        >
          閉じる
        </Link>
      </div>
      <dl className="customer-facts">
        <div>
          <dt>登録店舗</dt>
          <dd>{storeName}</dd>
        </div>
        <div>
          <dt>フリガナ</dt>
          <dd>{customer.name_kana || "—"}</dd>
        </div>
        <div>
          <dt>電話番号</dt>
          <dd>{customer.phone || "—"}</dd>
        </div>
        <div>
          <dt>リピーターズカード番号</dt>
          <dd>{customer.membership_card_number || "—"}</dd>
        </div>
        <div>
          <dt>登録日時（日本時間）</dt>
          <dd>{datetime(customer.created_at)}</dd>
        </div>
      </dl>
      {editForm && (
        <>
          <button
            type="button"
            className="secondary"
            aria-expanded={editing}
            aria-controls="customer-panel-edit"
            onClick={() => setEditing(!editing)}
          >
            {editing ? "編集を閉じる" : "顧客情報を編集"}
          </button>
          {editing && (
            <section id="customer-panel-edit" className="section-detail">
              <h2>顧客情報の編集</h2>
              {editForm}
            </section>
          )}
        </>
      )}
      {relatedHref && (
        <div className="inline-actions">
          <Link className="text-link" href={relatedHref}>
            書類・来店履歴を確認
          </Link>
        </div>
      )}
    </aside>
  );
}
