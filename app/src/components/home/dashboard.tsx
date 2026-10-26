"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  conversionRate,
  homeFiltersSchema,
  homeHref,
  type HomeFilters,
  type HomeReport,
} from "@/lib/home/report";
import { datetime, money } from "@/lib/business/format";
import styles from "./home.module.css";

type Props = {
  filters: HomeFilters;
  report: HomeReport;
  stores: { id: string; name: string }[];
  categories: { id: string; category_name: string; is_active: boolean }[];
};
const colors = [
  "#567ef3",
  "#8270e5",
  "#ad8be7",
  "#6469b6",
  "#a8b5d7",
  "#c5bbdf",
];
const statusLabel = {
  completed: "成約",
  not_completed: "不成約",
  pending: "未確定",
};

export function HomeDashboard({ filters, report, stores, categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"amount" | "visits">("amount");
  const [error, setError] = useState("");
  const navigate = (next: HomeFilters) => {
    setError("");
    startTransition(() =>
      router.replace(homeHref(next, next.day), { scroll: false }),
    );
  };
  const categoryName =
    filters.category === "all"
      ? "全カテゴリ"
      : filters.category === "uncategorized"
        ? "未分類"
        : (categories.find((c) => c.id === filters.category)?.category_name ??
          "指定カテゴリ");
  const selectedDay = report.daily.find((d) => d.day === filters.day);
  const maximum = Math.max(1, ...report.daily.map((d) => d[mode]));
  const total = report.categories.reduce((n, c) => n + c.amount, 0);
  const pie = report.categories
    .filter((c) => c.amount > 0)
    .map((category, i, list) => {
      const start =
        (list.slice(0, i).reduce((n, c) => n + c.amount, 0) / total) *
          Math.PI *
          2 -
        Math.PI / 2;
      const end = start + (category.amount / total) * Math.PI * 2;
      const x = (a: number) => 90 + 76 * Math.cos(a),
        y = (a: number) => 90 + 76 * Math.sin(a);
      const d =
        category.amount === total
          ? "M90 14 A76 76 0 1 1 89.999 14 Z"
          : `M90 90 L${x(start)} ${y(start)} A76 76 0 ${end - start > Math.PI ? 1 : 0} 1 ${x(end)} ${y(end)} Z`;
      return { ...category, d, color: colors[i % colors.length] };
    });
  const selectCategory = (id: string | null) => {
    const next = id ?? "uncategorized";
    navigate({
      ...filters,
      category: filters.category === next ? "all" : next,
    });
  };
  return (
    <div className={styles.home} aria-busy={pending}>
      <div className={styles.heading}>
        <h1>HOME</h1>
        <Link href="/purchases/new" className="text-link">
          来店・取引を登録
        </Link>
      </div>
      <form
        key={`${filters.from}/${filters.to}/${filters.store}/${filters.category}`}
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const parsed = homeFiltersSchema.safeParse({
            from: form.get("from"),
            to: form.get("to"),
            store: form.get("store"),
            category: filters.category,
            day: "",
          });
          if (!parsed.success) {
            setError(
              "日付を開始日から終了日の順で、366日以内に指定してください。",
            );
            return;
          }
          navigate(parsed.data);
        }}
      >
        <label>
          日付 FROM
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            min="1900-01-01"
            max="9999-12-31"
            required
          />
        </label>
        <label>
          日付 TO
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            min="1900-01-01"
            max="9999-12-31"
            required
          />
        </label>
        <label>
          店舗
          <select
            name="store"
            defaultValue={filters.store}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="all">all · 閲覧可能な全店舗</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending}>
          条件を適用
        </button>
        <Link
          href="/"
          prefetch={false}
          onClick={(e) => {
            setError("");
            e.currentTarget.closest("form")?.reset();
          }}
        >
          当月に戻す
        </Link>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.conditions} aria-live="polite">
        <span>
          {filters.from} → {filters.to} /{" "}
          {stores.find((s) => s.id === filters.store)?.name ??
            "閲覧可能な全店舗"}{" "}
          / {categoryName}
        </span>
        {filters.category !== "all" && (
          <button
            disabled={pending}
            onClick={() => navigate({ ...filters, category: "all" })}
          >
            カテゴリ解除 ×
          </button>
        )}
        {filters.day && (
          <button
            disabled={pending}
            onClick={() => navigate({ ...filters, day: "" })}
          >
            {filters.day} 詳細解除 ×
          </button>
        )}
        {pending && (
          <span role="status">更新中…（表示中の集計は変更前の条件です）</span>
        )}
      </div>
      <section className={styles.metrics} aria-label="集計結果">
        {[
          ["買取総額", money(report.summary.amount)],
          ["来店数", `${report.summary.visits.toLocaleString()} 件`],
          ["成約商品数", `${report.summary.completed.toLocaleString()} 点`],
          [
            "不成約商品数",
            `${report.summary.not_completed.toLocaleString()} 点`,
          ],
          [
            "成約率",
            conversionRate(
              report.summary.completed,
              report.summary.not_completed,
            ),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <h2>{label}</h2>
            <p>{value}</p>
          </div>
        ))}
      </section>
      <p className={styles.note}>
        未確定 {report.summary.pending.toLocaleString()}{" "}
        点は成約率・金額の集計対象外。成約金額未入力{" "}
        {report.summary.unpriced.toLocaleString()}{" "}
        点は金額合計から除外しています。
      </p>
      <div className={styles.grid}>
        <section>
          <div className={styles.heading}>
            <h2>日次の推移</h2>
            <div className={styles.toggle}>
              <button
                aria-pressed={mode === "amount"}
                onClick={() => setMode("amount")}
              >
                買取金額
              </button>
              <button
                aria-pressed={mode === "visits"}
                onClick={() => setMode("visits")}
              >
                来店数
              </button>
            </div>
          </div>
          {report.summary.visits ? (
            <>
              <div className={styles.axis}>
                {mode === "amount" ? money(maximum) : `${maximum} 件`}
              </div>
              <div className={styles.chartScroll}>
                <div
                  className={styles.bars}
                  style={{
                    minWidth:
                      report.daily.length > 45
                        ? report.daily.length * 14
                        : undefined,
                  }}
                >
                  {report.daily.map((d) => (
                    <button
                      key={d.day}
                      aria-label={`${d.day} ${mode === "amount" ? money(d.amount) : `${d.visits}件`}`}
                      title={`${d.day} / ${mode === "amount" ? money(d.amount) : `${d.visits}件`}`}
                      aria-pressed={filters.day === d.day}
                      disabled={pending}
                      onClick={() =>
                        navigate({
                          ...filters,
                          day: filters.day === d.day ? "" : d.day,
                        })
                      }
                    >
                      <span
                        style={{ height: `${(d[mode] / maximum) * 100}%` }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.dates}>
                <span>0 / {filters.from}</span>
                <span>{filters.to}</span>
              </div>
            </>
          ) : (
            <p className={styles.empty}>この条件に該当する来店はありません</p>
          )}
          <p className={styles.note}>
            棒を選ぶと当日の来店・商品を表示します。横に長い期間はスクロールできます。
          </p>
        </section>
        <aside className={styles.detail} aria-live="polite">
          {selectedDay ? (
            <>
              <div className={styles.heading}>
                <h2>{selectedDay.day}</h2>
                <button
                  disabled={pending}
                  aria-label="日付選択を解除"
                  onClick={() => navigate({ ...filters, day: "" })}
                >
                  ×
                </button>
              </div>
              <div className={styles.dayCounts}>
                <span>
                  来店<strong>{selectedDay.visits} 件</strong>
                </span>
                <span>
                  成約<strong>{selectedDay.completed} 点</strong>
                </span>
                <span>
                  不成約<strong>{selectedDay.not_completed} 点</strong>
                </span>
              </div>
              <p className={styles.note}>
                未確定 {selectedDay.pending} 点 / 金額未入力{" "}
                {selectedDay.unpriced} 点
              </p>
              <h3>取引商品 · {money(selectedDay.amount)}</h3>
              <div className={styles.items}>
                {report.items.length ? (
                  report.items.map((i) => (
                    <div key={i.id}>
                      <Link href={`/purchases/${i.purchase_transaction_id}`}>
                        {i.item_name}
                      </Link>
                      <span>
                        {statusLabel[i.purchase_status]} /{" "}
                        {i.purchase_status === "completed"
                          ? money(i.purchase_amount)
                          : "—"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>該当する商品明細はありません</p>
                )}
              </div>
              {report.item_count > report.items.length && (
                <p className={styles.note}>
                  全{report.item_count}明細のうち直近100明細を表示。
                  <Link
                    className="text-link"
                    href={`/purchases?${new URLSearchParams({ date: filters.day, store: filters.store === "all" ? "" : filters.store })}`}
                  >
                    当日の取引一覧で続きを確認（カテゴリ指定なし）
                  </Link>
                </p>
              )}
            </>
          ) : (
            <>
              <p className={styles.note}>DAY INSIGHT</p>
              <h2>日付を選択</h2>
              <p className={styles.empty}>
                棒グラフから当日の商品を確認できます。
              </p>
            </>
          )}
        </aside>
      </div>
      <div className={styles.lower}>
        <section>
          <h2>カテゴリ別の買取金額</h2>
          <label className={styles.note}>
            カテゴリを選択
            <select
              aria-label="カテゴリ"
              value={filters.category}
              disabled={pending}
              onChange={(e) =>
                navigate({ ...filters, category: e.target.value })
              }
            >
              <option value="all">全カテゴリ</option>
              <option value="uncategorized">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category_name}
                  {c.is_active ? "" : "（無効）"}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.pieLayout}>
            <svg
              viewBox="0 0 180 180"
              aria-label="カテゴリ別買取金額比率"
              className={styles.pie}
            >
              {total ? (
                pie.map((c) => (
                  <path
                    key={c.id ?? "uncategorized"}
                    d={c.d}
                    fill={c.color}
                    role="button"
                    tabIndex={pending ? -1 : 0}
                    aria-label={`${c.name} ${((c.amount / total) * 100).toFixed(1)}%`}
                    onClick={() => {
                      if (!pending) selectCategory(c.id);
                    }}
                    onKeyDown={(e) => {
                      if (!pending && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        selectCategory(c.id);
                      }
                    }}
                  >
                    <title>
                      {c.name} {money(c.amount)}
                    </title>
                  </path>
                ))
              ) : (
                <>
                  <circle cx="90" cy="90" r="76" fill="#eef0f5" />
                  <text x="90" y="95" textAnchor="middle" fontSize="12">
                    金額データなし
                  </text>
                </>
              )}
            </svg>
            <div className={styles.legend}>
              {report.categories.map((c) => (
                <button
                  key={c.id ?? "uncategorized"}
                  disabled={pending}
                  aria-pressed={filters.category === (c.id ?? "uncategorized")}
                  onClick={() => selectCategory(c.id)}
                >
                  <span>{c.name}</span>
                  <span>
                    {total ? `${((c.amount / total) * 100).toFixed(1)}%` : "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className={styles.note}>成立商品明細の合計 {money(total)}</p>
        </section>
        <section>
          <div className={styles.heading}>
            <h2>直近取引</h2>
            <span className={styles.note}>
              {report.summary.visits}来店中 {report.recent.length}件
            </span>
          </div>
          <div className={styles.tableScroll}>
            {report.recent.length ? (
              <table>
                <thead>
                  <tr>
                    <th>来店日時</th>
                    <th>店舗</th>
                    <th>成約 / 不成約 / 未確定</th>
                    <th>買取金額</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link className="text-link" href={`/purchases/${t.id}`}>
                          {datetime(t.visit_datetime)}
                        </Link>
                      </td>
                      <td>
                        {stores.find((s) => s.id === t.store_id)?.name ?? "—"}
                      </td>
                      <td>
                        {t.completed} / {t.not_completed} / {t.pending} 点
                      </td>
                      <td>
                        {money(t.amount)}
                        {t.unpriced > 0 && (
                          <small> ＋ 金額未入力 {t.unpriced}点</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.empty}>該当する取引はありません</p>
            )}
          </div>
        </section>
      </div>
      <p className={styles.note}>
        日本時間。来店は重複なく数え、成約・不成約は明細1行を1点として数えます。成約率＝成約商品数÷（成約商品数＋不成約商品数）。カテゴリ指定時はそのカテゴリの商品だけを対象にします（子カテゴリは含みません）。明細なしの来店は全カテゴリ時のみ含みます。未登録の来店は集計できません。
      </p>
      <footer className={styles.footer}>GREEN ASSET PORTAL / HOME</footer>
    </div>
  );
}
