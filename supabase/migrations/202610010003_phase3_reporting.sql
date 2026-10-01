begin;

-- 呼出者の店舗RLSで取引を集計する。日次/月次の集計値を別表へ保存しない。
-- timestamptzのUTC保存とDBセッションのtimezoneに依存せず、日本時間の暦日を使う。
create function public.get_dashboard_summary(p_as_of timestamptz default now())
returns table (
  aggregation_date date,
  today_visits bigint,
  today_completed bigint,
  today_not_completed bigint,
  today_purchase_total numeric,
  today_unpriced bigint,
  month_visits bigint,
  month_completed bigint,
  month_purchase_total numeric,
  month_unpriced bigint
)
language sql stable security invoker set search_path = '' as $$
  with local_time as (
    select coalesce(p_as_of, now()) at time zone 'Asia/Tokyo' as reference_time
  ), bounds as (
    select
      reference_time::date as local_date,
      date_trunc('day', reference_time) at time zone 'Asia/Tokyo' as day_start,
      (date_trunc('day', reference_time) + interval '1 day') at time zone 'Asia/Tokyo' as day_end,
      date_trunc('month', reference_time) at time zone 'Asia/Tokyo' as month_start,
      (date_trunc('month', reference_time) + interval '1 month') at time zone 'Asia/Tokyo' as month_end
    from local_time
  )
  select b.local_date,
    count(t.id) filter (where t.visit_datetime >= b.day_start and t.visit_datetime < b.day_end),
    count(t.id) filter (where t.visit_datetime >= b.day_start and t.visit_datetime < b.day_end and t.transaction_status = 'completed'),
    count(t.id) filter (where t.visit_datetime >= b.day_start and t.visit_datetime < b.day_end and t.transaction_status = 'not_completed'),
    coalesce(sum(t.purchase_total) filter (where t.visit_datetime >= b.day_start and t.visit_datetime < b.day_end and t.transaction_status = 'completed'), 0),
    count(t.id) filter (where t.visit_datetime >= b.day_start and t.visit_datetime < b.day_end and t.transaction_status = 'completed' and t.purchase_total is null),
    count(t.id),
    count(t.id) filter (where t.transaction_status = 'completed'),
    coalesce(sum(t.purchase_total) filter (where t.transaction_status = 'completed'), 0),
    count(t.id) filter (where t.transaction_status = 'completed' and t.purchase_total is null)
  from bounds b left join public.purchase_transactions t
    on t.visit_datetime >= b.month_start and t.visit_datetime < b.month_end
  group by b.local_date, b.day_start, b.day_end;
$$;

revoke all on function public.get_dashboard_summary(timestamptz) from public;
grant execute on function public.get_dashboard_summary(timestamptz) to authenticated;

commit;
