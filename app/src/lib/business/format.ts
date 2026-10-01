export const money = (value: number | null) =>
  value === null
    ? "未入力"
    : new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 2,
      }).format(value);
export const datetime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function toLocalInput(value: string | null): string {
  return value
    ? new Date(new Date(value).getTime() + 9 * 3600000)
        .toISOString()
        .slice(0, 16)
    : "";
}
export function toVisitIso(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    return "";
  return `${value}:00+09:00`;
}
export const importTypes = {
  purchase_document: "買取計算書",
  customer_identification: "本人確認書類",
  membership_card: "メンバーズカード",
  other: "その他",
};
export const documentTypes = {
  drivers_license: "運転免許証",
  my_number_card: "マイナンバーカード",
  passport: "パスポート",
  other: "その他",
};
export const processingLabels = {
  pending: "処理待ち",
  processing: "処理中",
  review_required: "要確認",
  completed: "完了",
  failed: "失敗",
};
