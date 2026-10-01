import Link from "next/link";
import { businessSession } from "@/lib/business/access";
import { Empty, PageTitle } from "@/components/business-ui";
import { datetime, money } from "@/lib/business/format";

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="card metric-card">
      <h3>{label}</h3>
      <p className="metric-value">{value}</p>
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const { supabase, profile, store, stores } = await businessSession();
  const [summaryResult, recentResult] = await Promise.all([
    supabase.rpc("get_dashboard_summary", {}),
    supabase
      .from("purchase_transactions")
      .select(
        "id,store_id,customer_id,document_number,visit_datetime,transaction_status,purchase_item_count,purchase_total",
      )
      .order("visit_datetime", { ascending: false })
      .order("id")
      .limit(5),
  ]);
  if (summaryResult.error || recentResult.error || !summaryResult.data?.[0]) {
    throw new Error(
      "ダッシュボードを取得できません。接続状態と追加SQLの適用を確認してください。",
    );
  }
  const summary = summaryResult.data[0];
  const recent = recentResult.data ?? [];
  const customerIds = [
    ...new Set(recent.map((transaction) => transaction.customer_id)),
  ];
  const customersResult = customerIds.length
    ? await supabase.from("customers").select("id,name").in("id", customerIds)
    : { data: [], error: null };
  if (customersResult.error)
    throw new Error("最近の取引の顧客情報を取得できません。");
  const count = (value: number) => `${value.toLocaleString("ja-JP")}件`;
  const scope = profile.role === "admin" ? "全店舗" : store?.name;
  return (
    <>
      <PageTitle
        title="ダッシュボード"
        description={`${scope}の来店・買取状況を確認できます。`}
        href="/purchases/new"
        action="取引を登録"
      />
      <p className="muted">
        集計日：{summary.aggregation_date}（日本時間） ·
        買取金額は成約取引のみ。来店数は不成約を含みます。
      </p>
      <section className="metric-section" aria-labelledby="today-title">
        <h2 id="today-title">本日</h2>
        <div className="metric-grid">
          <Metric label="本日の来店数" value={count(summary.today_visits)} />
          <Metric label="本日の成約数" value={count(summary.today_completed)} />
          <Metric
            label="本日の不成約数"
            value={count(summary.today_not_completed)}
          />
          <Metric
            label="本日の買取金額"
            value={money(summary.today_purchase_total)}
            note={
              summary.today_unpriced
                ? `金額未入力の成約 ${count(summary.today_unpriced)}`
                : undefined
            }
          />
        </div>
      </section>
      <section className="metric-section" aria-labelledby="month-title">
        <h2 id="month-title">今月（{summary.aggregation_date.slice(0, 7)}）</h2>
        <div className="metric-grid month-metrics">
          <Metric label="今月の来店数" value={count(summary.month_visits)} />
          <Metric label="今月の成約数" value={count(summary.month_completed)} />
          <Metric
            label="今月の買取金額"
            value={money(summary.month_purchase_total)}
            note={
              summary.month_unpriced
                ? `金額未入力の成約 ${count(summary.month_unpriced)}`
                : undefined
            }
          />
        </div>
      </section>
      {!!summary.month_unpriced && (
        <p className="notice warning">
          金額未入力の成約が今月{count(summary.month_unpriced)}
          あります。表示金額には含まれていません。
          <Link className="text-link" href="/purchases?status=completed">
            買取実績で確認
          </Link>
        </p>
      )}
      <section className="card">
        <div className="page-heading">
          <h2>最近の取引5件</h2>
          <Link className="text-link" href="/purchases">
            すべての取引
          </Link>
        </div>
        {!recent.length ? (
          <Empty>まだ取引は登録されていません。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>来店日時</th>
                  <th>計算書番号</th>
                  <th>顧客</th>
                  {profile.role === "admin" && <th>店舗</th>}
                  <th>結果</th>
                  <th>買取点数</th>
                  <th>買取金額</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <Link
                        className="text-link"
                        href={`/purchases/${transaction.id}`}
                      >
                        {datetime(transaction.visit_datetime)}
                      </Link>
                    </td>
                    <td>{transaction.document_number ?? "未入力"}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/customers/${transaction.customer_id}`}
                      >
                        {customersResult.data?.find(
                          (customer) => customer.id === transaction.customer_id,
                        )?.name ?? "—"}
                      </Link>
                    </td>
                    {profile.role === "admin" && (
                      <td>
                        {stores.find(
                          (candidate) => candidate.id === transaction.store_id,
                        )?.name ?? "—"}
                      </td>
                    )}
                    <td>
                      <span
                        className={`badge ${transaction.transaction_status === "not_completed" ? "inactive" : ""}`}
                      >
                        {transaction.transaction_status === "completed"
                          ? "成約"
                          : "不成約"}
                      </span>
                    </td>
                    <td>{transaction.purchase_item_count ?? "未入力"}</td>
                    <td>{money(transaction.purchase_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="inline-actions">
        <Link className="button secondary" href="/customers">
          顧客管理
        </Link>
        <Link className="button secondary" href="/errors">
          読取エラーを確認
        </Link>
      </div>
    </>
  );
}
