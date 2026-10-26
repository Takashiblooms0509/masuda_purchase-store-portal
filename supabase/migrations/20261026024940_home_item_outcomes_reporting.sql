-- HOME item outcomes and reporting. Not yet applied to any Supabase database.
-- Existing rows start pending; never infer item outcomes from transaction headers.
begin;
alter table public.purchase_items add column purchase_status text not null default 'pending'
  constraint purchase_items_purchase_status_check check (purchase_status in ('pending','completed','not_completed'));
comment on column public.purchase_items.purchase_status is 'Per-item outcome. Legacy/unreviewed rows remain pending; never inferred from transaction_status.';
-- Same authenticated users, same existing parent/store RLS. Only the new editable column is granted.
grant insert (purchase_status), update (purchase_status) on public.purchase_items to authenticated;
create or replace function public.save_purchase_transaction(p_id uuid, p_transaction jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare transaction_id uuid; item jsonb; item_id uuid; kept_ids uuid[] := '{}'; existing_store uuid; line_order integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200 then raise exception 'Invalid items' using errcode='23514'; end if;
  if p_id is not null then
    select store_id into existing_store from public.purchase_transactions where id=p_id for update;
    if not found then raise exception 'Transaction not accessible' using errcode='42501'; end if;
    if existing_store <> (p_transaction->>'store_id')::uuid then raise exception 'Store cannot be changed' using errcode='23514'; end if;
    update public.purchase_transactions set
      customer_id=(p_transaction->>'customer_id')::uuid, document_number=p_transaction->>'document_number',
      visit_datetime=(p_transaction->>'visit_datetime')::timestamptz,
      purchase_staff_name=p_transaction->>'purchase_staff_name', payment_staff_name=p_transaction->>'payment_staff_name',
      transaction_status=p_transaction->>'transaction_status', visit_source=p_transaction->>'visit_source', visit_source_detail=p_transaction->>'visit_source_detail',
      purchase_item_count=(p_transaction->>'purchase_item_count')::integer, purchase_total=(p_transaction->>'purchase_total')::numeric,
      source_document_id=(p_transaction->>'source_document_id')::uuid, notes=p_transaction->>'notes'
    where id=p_id returning id into transaction_id;
  else
    insert into public.purchase_transactions(store_id,customer_id,document_number,visit_datetime,purchase_staff_name,payment_staff_name,transaction_status,visit_source,visit_source_detail,purchase_item_count,purchase_total,source_document_id,notes)
    values ((p_transaction->>'store_id')::uuid,(p_transaction->>'customer_id')::uuid,p_transaction->>'document_number',(p_transaction->>'visit_datetime')::timestamptz,p_transaction->>'purchase_staff_name',p_transaction->>'payment_staff_name',p_transaction->>'transaction_status',p_transaction->>'visit_source',p_transaction->>'visit_source_detail',(p_transaction->>'purchase_item_count')::integer,(p_transaction->>'purchase_total')::numeric,(p_transaction->>'source_document_id')::uuid,p_transaction->>'notes')
    returning id into transaction_id;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    item_id := (item->>'id')::uuid;
    if item_id is not null then
      if item_id = any(kept_ids) then raise exception 'Duplicate item id' using errcode='23514'; end if;
      update public.purchase_items set product_category_id=(item->>'product_category_id')::uuid,
        item_name=item->>'item_name', denomination_or_weight=item->>'denomination_or_weight', quantity=(item->>'quantity')::numeric,
        purchase_amount=(item->>'purchase_amount')::numeric, purchase_status=coalesce(item->>'purchase_status',purchase_status), category_reviewed=(item->>'category_reviewed')::boolean, notes=item->>'notes', display_order=line_order
      where id=item_id and purchase_transaction_id=transaction_id returning id into item_id;
      if not found then raise exception 'Item does not belong to transaction' using errcode='42501'; end if;
    else
      insert into public.purchase_items(purchase_transaction_id,product_category_id,item_name,denomination_or_weight,quantity,purchase_amount,purchase_status,category_reviewed,notes,display_order)
      values (transaction_id,(item->>'product_category_id')::uuid,item->>'item_name',item->>'denomination_or_weight',(item->>'quantity')::numeric,(item->>'purchase_amount')::numeric,coalesce(item->>'purchase_status','pending'),coalesce((item->>'category_reviewed')::boolean,false),item->>'notes',line_order) returning id into item_id;
    end if;
    kept_ids := array_append(kept_ids,item_id);
    line_order := line_order + 1;
  end loop;
  delete from public.purchase_items where purchase_transaction_id=transaction_id and not (id=any(kept_ids));
  return transaction_id;
end;
$$;
revoke all on function public.save_purchase_transaction(uuid,jsonb,jsonb) from public;
grant execute on function public.save_purchase_transaction(uuid,jsonb,jsonb) to authenticated;

create function public.get_home_report(
  p_from date, p_to date, p_store uuid default null, p_day date default null,
  p_category uuid default null, p_uncategorized boolean default false
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
     or p_from < date '1900-01-01' or p_to > date '9999-12-31' then
    raise exception 'Invalid reporting period' using errcode = '22023';
  end if;
  if p_day is not null and (p_day < p_from or p_day > p_to) then
    raise exception 'Invalid reporting day' using errcode = '22023';
  end if;
  if p_uncategorized is null or (p_uncategorized and p_category is not null) then
    raise exception 'Invalid category filter' using errcode = '22023';
  end if;
  with scoped as materialized (
    select t.id,t.store_id,t.document_number,t.visit_datetime,
      (t.visit_datetime at time zone 'Asia/Tokyo')::date as visit_date
    from public.purchase_transactions t
    where t.visit_datetime >= (p_from::timestamp at time zone 'Asia/Tokyo')
      and t.visit_datetime < ((p_to + 1)::timestamp at time zone 'Asia/Tokyo')
      and (p_store is null or t.store_id = p_store)
      and ((p_category is null and not p_uncategorized) or exists (
        select 1 from public.purchase_items i where i.purchase_transaction_id=t.id
        and ((p_uncategorized and i.product_category_id is null) or i.product_category_id=p_category)
      ))
  ), matching_items as materialized (
    select i.id,i.purchase_transaction_id,i.product_category_id,i.item_name,
      i.purchase_amount,i.purchase_status,i.display_order,t.visit_datetime,t.visit_date
    from scoped t join public.purchase_items i on i.purchase_transaction_id=t.id
    where (p_category is null and not p_uncategorized)
      or (p_uncategorized and i.product_category_id is null) or i.product_category_id=p_category
  ), item_totals as (
    select purchase_transaction_id,
      count(*) filter (where purchase_status='completed') as completed,
      count(*) filter (where purchase_status='not_completed') as not_completed,
      count(*) filter (where purchase_status='pending') as pending,
      coalesce(sum(purchase_amount) filter (where purchase_status='completed'),0) as amount,
      count(*) filter (where purchase_status='completed' and purchase_amount is null) as unpriced
    from matching_items group by purchase_transaction_id
  ), visits as materialized (
    select t.*,coalesce(i.completed,0) as completed,coalesce(i.not_completed,0) as not_completed,
      coalesce(i.pending,0) as pending,coalesce(i.amount,0) as amount,coalesce(i.unpriced,0) as unpriced
    from scoped t left join item_totals i on i.purchase_transaction_id=t.id
  ), daily as (
    select visit_date,count(*) as visits,sum(completed) as completed,sum(not_completed) as not_completed,
      sum(pending) as pending,sum(amount) as amount,sum(unpriced) as unpriced
    from visits group by visit_date
  ), calendar as (
    select p_from + n as day from generate_series(0,p_to-p_from) n
  ), recent as (
    select * from visits order by visit_datetime desc,id limit 5
  ), selected_items as (
    select * from matching_items where visit_date=p_day
    order by visit_datetime desc,purchase_transaction_id,display_order,id limit 100
  ), categories as (
    select i.product_category_id as id,coalesce(c.category_name,'未分類') as name,
      coalesce(sum(i.purchase_amount) filter (where i.purchase_status='completed'),0) as amount
    from matching_items i left join public.product_categories c on c.id=i.product_category_id
    group by i.product_category_id,c.category_name
  )
  select jsonb_build_object(
    'summary',(select jsonb_build_object('visits',count(*),'completed',coalesce(sum(completed),0),
      'not_completed',coalesce(sum(not_completed),0),'pending',coalesce(sum(pending),0),
      'amount',coalesce(sum(amount),0),'unpriced',coalesce(sum(unpriced),0)) from visits),
    'daily',(select jsonb_agg(jsonb_build_object('day',c.day,'visits',coalesce(d.visits,0),
      'completed',coalesce(d.completed,0),'not_completed',coalesce(d.not_completed,0),
      'pending',coalesce(d.pending,0),'amount',coalesce(d.amount,0),'unpriced',coalesce(d.unpriced,0)
    ) order by c.day) from calendar c left join daily d on d.visit_date=c.day),
    'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r.visit_datetime desc,r.id) from recent r),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.visit_datetime desc,i.purchase_transaction_id,i.display_order,i.id) from selected_items i),'[]'::jsonb),
    'item_count',(select count(*) from matching_items where visit_date=p_day),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.amount desc,c.id) from categories c),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_home_report(date,date,uuid,date,uuid,boolean) from public,anon;
grant execute on function public.get_home_report(date,date,uuid,date,uuid,boolean) to authenticated;
commit;
