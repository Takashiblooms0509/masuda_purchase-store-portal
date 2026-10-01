import Link from "next/link";
import type { Store } from "@/types/database";
import type { ActionState } from "@/lib/forms";
export function StoreField({
  stores,
  storeId,
  locked = false,
  onChange,
}: {
  stores: Store[];
  storeId?: string;
  locked?: boolean;
  onChange?: (id: string) => void;
}) {
  return (
    <label>
      店舗
      <select
        aria-label="店舗"
        name="store_id"
        defaultValue={
          onChange
            ? undefined
            : (storeId ?? (stores.length === 1 ? stores[0].id : ""))
        }
        value={onChange ? storeId : undefined}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={locked || stores.length === 1}
        required
      >
        <option value="">店舗を選択</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
            {!store.is_active ? "（無効）" : ""}
          </option>
        ))}
      </select>
      {(locked || stores.length === 1) && (
        <input
          type="hidden"
          name="store_id"
          value={storeId ?? stores[0]?.id ?? ""}
        />
      )}
    </label>
  );
}
export function Feedback({ state }: { state: ActionState }) {
  return state.message ? (
    <p
      role="status"
      className={`notice ${state.success ? "success" : "error"}`}
    >
      {state.message}
    </p>
  ) : null;
}
export function PageTitle({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {href && (
        <Link className="button" href={href}>
          {action}
        </Link>
      )}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Pagination({
  page,
  count,
  href,
}: {
  page: number;
  count: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(count / 30));
  return (
    <div className="pagination">
      <span className="muted">
        全{count}件 · {page}/{pages}ページ
      </span>
      {page > 1 && <Link href={href(page - 1)}>前へ</Link>}
      {page < pages && <Link href={href(page + 1)}>次へ</Link>}
    </div>
  );
}
