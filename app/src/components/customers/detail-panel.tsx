"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DirectoryCustomer } from "@/lib/customers/search";
import {
  customerAge,
  genderLabels,
  type CustomerDetail,
} from "@/lib/customers/detail";
import { datetime, money, documentTypes } from "@/lib/business/format";

export function CustomerDetailPanel({
  customer,
  storeName,
  closeHref,
  editForm,
  relatedHref,
  detail,
  documentPage = 1,
  previousDocumentHref,
  nextDocumentHref,
  historyPage = 1,
  previousHistoryHref,
  nextHistoryHref,
  today,
}: {
  customer: DirectoryCustomer;
  storeName: string;
  closeHref: string;
  editForm?: React.ReactNode;
  relatedHref?: string;
  detail?: CustomerDetail;
  documentPage?: number;
  previousDocumentHref?: string;
  nextDocumentHref?: string;
  historyPage?: number;
  previousHistoryHref?: string;
  nextHistoryHref?: string;
  today?: string;
}) {
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState("basic"),
    [revealed, setRevealed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    editButton = useRef<HTMLButtonElement>(null),
    body = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    heading.current?.focus();
    return () => node?.close();
  }, [customer.id]);
  function restore() {
    dialog.current?.close();
    document.querySelector<HTMLAnchorElement>(".customer-selected a")?.focus();
  }
  function choose(next: string) {
    setTab(next);
    setRevealed(false);
    body.current?.scrollTo(0, 0);
  }
  const c = detail?.customer;
  const facts: [string, React.ReactNode, boolean?][] = [
    ["氏名", customer.name],
    ["フリガナ", customer.name_kana],
    ["電話番号", customer.phone],
    ["カード番号", customer.membership_card_number],
    ["登録店舗", storeName],
    ["登録日時", datetime(customer.created_at)],
  ];
  if (c)
    facts.push(
      [
        "生年月日 / 年齢",
        `${c.birth_date ?? "未登録"} / ${customerAge(c.birth_date, today ?? "") ?? "—"}歳`,
      ],
      ["性別", c.gender ? genderLabels[c.gender] : "未登録"],
      ["職業", c.occupation],
      ["郵便番号", c.postal_code],
      ["住所", c.address, true],
      [
        "DM可否",
        c.dm_allowed === null ? "不明・未確認" : c.dm_allowed ? "可" : "不可",
      ],
      [
        "初回 / 最終来店",
        `${c.first_visit_date ?? "未登録"} / ${c.last_visit_date ?? "未登録"}`,
      ],
      ["本人確認書類の種類", c.identification_type],
      [
        "本人確認書類番号",
        c.identification_number ? (
          <span className="customer-secret">
            {revealed ? c.identification_number : "••••••••"}{" "}
            <button
              type="button"
              className="secondary"
              aria-pressed={revealed}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "隠す" : "表示"}
            </button>
          </span>
        ) : (
          "未登録"
        ),
      ],
      [
        "メモ",
        <span key="memo" className="customer-memo">
          {c.memo || "メモはありません"}
        </span>,
        true,
      ],
    );
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (editing) {
          setEditing(false);
          editButton.current?.focus();
        } else {
          restore();
          router.push(closeHref, { scroll: false });
        }
      }}
      className="card customer-detail"
      aria-label="顧客詳細"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (editing) {
            setEditing(false);
            editButton.current?.focus();
          } else {
            restore();
            router.push(closeHref, { scroll: false });
          }
        }
      }}
    >
      <header className="page-heading">
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
          onClick={restore}
          aria-label="顧客詳細を閉じる"
        >
          閉じる
        </Link>
      </header>
      <div className="customer-detail-body" ref={body}>
        {editing ? (
          <section id="customer-panel-edit">{editForm}</section>
        ) : (
          <>
            <div className="customer-tabs" role="tablist" aria-label="顧客情報">
              {[
                ["basic", "基本情報"],
                ["history", "直近の取引"],
                ["documents", "本人確認画像"],
              ].map(([key, label], i) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  id={`customer-tab-${key}`}
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  aria-controls="customer-tab-content"
                  className="secondary"
                  onClick={() => choose(key)}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const keys = ["basic", "history", "documents"];
                      const n =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 2
                            : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                      choose(keys[n]);
                      document
                        .getElementById(`customer-tab-${keys[n]}`)
                        ?.focus();
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              id="customer-tab-content"
              role="tabpanel"
              aria-labelledby={`customer-tab-${tab}`}
            >
              {tab === "basic" && (
                <dl className="customer-facts">
                  {facts.map(([label, value, wide]) => (
                    <div key={label} className={wide ? "customer-wide" : ""}>
                      <dt>{label}</dt>
                      <dd>{value || "未登録"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {tab === "history" &&
                (detail ? (
                  <>
                    <p className="muted small">
                      成立した商品明細の金額合計 · 全{detail.transaction_count}
                      件
                    </p>
                    {detail.transactions.map((t) => (
                      <article className="customer-transaction" key={t.id}>
                        <strong>
                          {datetime(t.visit_datetime)}　
                          {money(t.purchase_amount)}
                        </strong>
                        <p>
                          成約 {t.completed_items}点 / 不成約{" "}
                          {t.not_completed_items}点
                        </p>
                        {t.notes && <p className="customer-memo">{t.notes}</p>}
                      </article>
                    ))}
                    {!detail.transactions.length && (
                      <p>取引履歴はありません。</p>
                    )}
                    <div className="inline-actions">
                      {historyPage > 1 && previousHistoryHref && (
                        <Link href={previousHistoryHref} scroll={false}>
                          前へ
                        </Link>
                      )}
                      {historyPage * 10 < detail.transaction_count &&
                        nextHistoryHref && (
                          <Link href={nextHistoryHref} scroll={false}>
                            次へ
                          </Link>
                        )}
                    </div>
                  </>
                ) : (
                  <p>取引履歴を取得できません。</p>
                ))}
              {tab === "documents" &&
                (detail ? (
                  <>
                    <p className="muted small">
                      本人確認画像 {detail.document_count}件（20件ずつ表示）
                    </p>
                    {detail.documents.map((d) => (
                      <div className="customer-transaction" key={d.id}>
                        <p>
                          {documentTypes[
                            d.document_type as keyof typeof documentTypes
                          ] ?? d.document_type}{" "}
                          · {d.file_name}
                        </p>
                        {d.has_image ? (
                          <a
                            className="text-link"
                            href={`/api/customers/${customer.id}/documents/${d.id}/image`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            認証付き画像を開く
                          </a>
                        ) : (
                          <p>画像未登録</p>
                        )}
                      </div>
                    ))}
                    {!detail.documents.length && <p>書類はありません。</p>}
                    <div className="inline-actions">
                      {documentPage > 1 && previousDocumentHref && (
                        <Link href={previousDocumentHref} scroll={false}>
                          前へ
                        </Link>
                      )}
                      {documentPage * 20 < detail.document_count &&
                        nextDocumentHref && (
                          <Link href={nextDocumentHref} scroll={false}>
                            次へ
                          </Link>
                        )}
                    </div>
                  </>
                ) : (
                  <p>書類を取得できません。</p>
                ))}
            </div>
          </>
        )}
      </div>
      <footer className="inline-actions">
        {editForm && (
          <button
            ref={editButton}
            type="button"
            className="secondary"
            onClick={() => {
              setEditing(!editing);
              setRevealed(false);
              body.current?.scrollTo(0, 0);
            }}
          >
            {editing ? "キャンセル" : "編集"}
          </button>
        )}
        {relatedHref && (
          <Link className="text-link" href={relatedHref}>
            書類の管理
          </Link>
        )}
      </footer>
    </dialog>
  );
}
