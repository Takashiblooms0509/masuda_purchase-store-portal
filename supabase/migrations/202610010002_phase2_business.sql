begin;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  name_kana text, birth_date date, occupation text, postal_code text,
  address text, phone text, dm_allowed boolean, membership_card_number text,
  identification_type text, identification_number text,
  first_visit_date date, last_visit_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, store_id)
);
create index customers_store_idx on public.customers(store_id);
create index customers_membership_idx on public.customers(store_id, membership_card_number);
create index customers_phone_idx on public.customers(store_id, phone);
create index customers_name_birth_idx on public.customers(store_id, name, birth_date);

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  document_type text not null check (document_type in ('drivers_license','my_number_card','passport','other')),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_url text, drive_file_id text,
  uploaded_at timestamptz, created_at timestamptz not null default now()
);
create index customer_documents_customer_idx on public.customer_documents(customer_id);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_category_id uuid references public.product_categories(id),
  category_name text not null check (length(btrim(category_name)) between 1 and 100),
  category_level integer not null default 1 check (category_level >= 1),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index product_categories_parent_idx on public.product_categories(parent_category_id);

create table public.document_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  document_type text not null check (document_type in ('purchase_document','customer_identification','membership_card','other')),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_url text, drive_file_id text,
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','review_required','completed','failed')),
  error_message text, retry_count integer not null default 0 check (retry_count >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, store_id)
);
create index document_imports_store_status_idx on public.document_imports(store_id, processing_status);

create table public.purchase_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  customer_id uuid not null,
  document_number text, visit_datetime timestamptz not null,
  purchase_staff_name text, payment_staff_name text,
  transaction_status text not null check (transaction_status in ('completed','not_completed')),
  visit_source text, visit_source_detail text,
  purchase_item_count integer check (purchase_item_count >= 0),
  purchase_total numeric(14,2) check (purchase_total >= 0 and purchase_total < 1000000000000),
  source_document_id uuid unique, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (customer_id, store_id) references public.customers(id, store_id),
  foreign key (source_document_id, store_id) references public.document_imports(id, store_id)
);
create index purchase_transactions_store_visit_idx on public.purchase_transactions(store_id, visit_datetime desc);
create index purchase_transactions_customer_idx on public.purchase_transactions(customer_id);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_transaction_id uuid not null references public.purchase_transactions(id),
  product_category_id uuid references public.product_categories(id),
  raw_item_name text, item_name text not null check (length(btrim(item_name)) between 1 and 500),
  denomination_or_weight text,
  display_order integer not null default 0,
  quantity numeric(12,3) check (quantity >= 0 and quantity < 1000000000), purchase_amount numeric(14,2) check (purchase_amount >= 0 and purchase_amount < 1000000000000),
  category_confidence numeric(5,4) check (category_confidence between 0 and 1),
  category_reviewed boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index purchase_items_transaction_idx on public.purchase_items(purchase_transaction_id);
create index purchase_items_category_idx on public.purchase_items(product_category_id);

-- 根データの店舗変更は、子データの店舗境界が変わるため禁止する。
create function private.keep_store_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.store_id <> old.store_id then raise exception 'Store cannot be changed' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.keep_store_id() from public;

-- levelはユーザー入力に依存せず計算する。親変更は循環を検証し子孫levelも更新する。
create function private.category_hierarchy()
returns trigger language plpgsql set search_path = '' as $$
declare parent_level integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20461001);
  if new.parent_category_id is null then new.category_level := 1;
  else
    if new.parent_category_id = new.id or exists (
      with recursive ancestors as (
        select id, parent_category_id from public.product_categories where id = new.parent_category_id
        union
        select c.id, c.parent_category_id from public.product_categories c join ancestors a on c.id = a.parent_category_id
      ) select 1 from ancestors where id = new.id
    ) then raise exception 'Category cycle is not allowed' using errcode='23514'; end if;
    select category_level into parent_level from public.product_categories where id = new.parent_category_id;
    if parent_level is null then raise exception 'Parent category does not exist' using errcode='23503'; end if;
    new.category_level := parent_level + 1;
  end if;
  return new;
end;
$$;
create function private.category_descendant_levels()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.category_level <> new.category_level then
    update public.product_categories set category_level = new.category_level + 1 where parent_category_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.category_hierarchy() from public;
revoke all on function private.category_descendant_levels() from public;
create trigger category_hierarchy before insert or update on public.product_categories for each row execute function private.category_hierarchy();
create trigger category_descendant_levels after update on public.product_categories for each row execute function private.category_descendant_levels();

-- 登録/更新した取引を一次データとして、顧客の初回/最終来店日を再計算する。
create function private.refresh_customer_visits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 顧客行ロックで同じ顧客への同時登録を直列化する。
  perform 1 from public.customers where id in (new.customer_id, case when tg_op='UPDATE' then old.customer_id else new.customer_id end) order by id for update;
  update public.customers c set
    first_visit_date = (select min((visit_datetime at time zone 'Asia/Tokyo')::date) from public.purchase_transactions t where t.customer_id=c.id),
    last_visit_date = (select max((visit_datetime at time zone 'Asia/Tokyo')::date) from public.purchase_transactions t where t.customer_id=c.id)
  where c.id = new.customer_id or (tg_op='UPDATE' and c.id=old.customer_id);
  return new;
end;
$$;
revoke all on function private.refresh_customer_visits() from public;
create trigger transaction_customer_visits after insert or update of customer_id,visit_datetime on public.purchase_transactions
for each row execute function private.refresh_customer_visits();

create function private.validate_purchase_source()
returns trigger language plpgsql set search_path = '' as $$
declare source_type text;
begin
  if new.source_document_id is not null then
    -- 同時の原本種別変更と競合しないよう、紐付け完了まで行を共有ロックする。
    select document_type into source_type from public.document_imports
      where id=new.source_document_id and store_id=new.store_id for share;
    if not found or source_type <> 'purchase_document' then
      raise exception 'Source must be a purchase document from the same store' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_purchase_source() from public;
create trigger transaction_source before insert or update on public.purchase_transactions for each row execute function private.validate_purchase_source();

-- 書類種別を変えて既存の計算書紐付けを壊すことを禁止。
create function private.keep_linked_import_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.document_type <> old.document_type and exists (select 1 from public.purchase_transactions where source_document_id=old.id) then
    raise exception 'Linked document type cannot be changed' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_linked_import_type() from public;
create trigger import_linked_type before update on public.document_imports for each row execute function private.keep_linked_import_type();

-- SECURITY INVOKER：呼出者のRLSをそのまま適用。権限昇格しない。
create function public.find_customer_candidates(p_store_id uuid, p_customer jsonb)
returns setof public.customers language sql stable security invoker set search_path = '' as $$
  select c.* from public.customers c where c.store_id=p_store_id and (
    (nullif(btrim(p_customer->>'membership_card_number'),'') is not null and btrim(c.membership_card_number)=btrim(p_customer->>'membership_card_number'))
    or (nullif(regexp_replace(translate(p_customer->>'phone','０１２３４５６７８９','0123456789'),'[^0-9]','','g'),'') is not null
      and regexp_replace(translate(c.phone,'０１２３４５６７８９','0123456789'),'[^0-9]','','g')=regexp_replace(translate(p_customer->>'phone','０１２３４５６７８９','0123456789'),'[^0-9]','','g'))
    or (nullif(regexp_replace(p_customer->>'name','[[:space:]　]','','g'),'') is not null
      and regexp_replace(c.name,'[[:space:]　]','','g')=regexp_replace(p_customer->>'name','[[:space:]　]','','g'))
    or (nullif(p_customer->>'birth_date','') is not null and c.birth_date=(p_customer->>'birth_date')::date)
  ) order by c.updated_at desc, c.id limit 20;
$$;
revoke all on function public.find_customer_candidates(uuid,jsonb) from public;
grant execute on function public.find_customer_candidates(uuid,jsonb) to authenticated;

-- 取引ヘッダーと明細を同一DBトランザクションで保存。明細idは編集時に保持する。
create function public.save_purchase_transaction(p_id uuid, p_transaction jsonb, p_items jsonb)
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
        purchase_amount=(item->>'purchase_amount')::numeric, category_reviewed=(item->>'category_reviewed')::boolean, notes=item->>'notes', display_order=line_order
      where id=item_id and purchase_transaction_id=transaction_id returning id into item_id;
      if not found then raise exception 'Item does not belong to transaction' using errcode='42501'; end if;
    else
      insert into public.purchase_items(purchase_transaction_id,product_category_id,item_name,denomination_or_weight,quantity,purchase_amount,category_reviewed,notes,display_order)
      values (transaction_id,(item->>'product_category_id')::uuid,item->>'item_name',item->>'denomination_or_weight',(item->>'quantity')::numeric,(item->>'purchase_amount')::numeric,coalesce((item->>'category_reviewed')::boolean,false),item->>'notes',line_order) returning id into item_id;
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

-- RLS：親テーブルを経由する子データも所属店舗に限定。
do $$
declare table_name text;
begin
  foreach table_name in array array['customers','document_imports','purchase_transactions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy store_read on public.%I for select to authenticated using (private.can_access_store(store_id))',table_name);
    execute format('create policy store_insert on public.%I for insert to authenticated with check (private.can_access_store(store_id))',table_name);
    execute format('create policy store_update on public.%I for update to authenticated using (private.can_access_store(store_id)) with check (private.can_access_store(store_id))',table_name);
    execute format('create trigger immutable_store before update on public.%I for each row execute function private.keep_store_id()',table_name);
    execute format('create trigger updated_at before update on public.%I for each row execute function private.set_updated_at()',table_name);
  end loop;
end;
$$;
alter table public.customer_documents enable row level security;
create policy customer_document_access on public.customer_documents for all to authenticated
using (exists (select 1 from public.customers c where c.id=customer_id and private.can_access_store(c.store_id)))
with check (exists (select 1 from public.customers c where c.id=customer_id and private.can_access_store(c.store_id)));
alter table public.purchase_items enable row level security;
create policy purchase_item_access on public.purchase_items for all to authenticated
using (exists (select 1 from public.purchase_transactions t where t.id=purchase_transaction_id and private.can_access_store(t.store_id)))
with check (exists (select 1 from public.purchase_transactions t where t.id=purchase_transaction_id and private.can_access_store(t.store_id)));
create trigger purchase_items_updated before update on public.purchase_items for each row execute function private.set_updated_at();
alter table public.product_categories enable row level security;
create policy category_read on public.product_categories for select to authenticated
using ((select private.is_admin()) or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and private.can_access_store(p.store_id)));
create policy category_admin_insert on public.product_categories for insert to authenticated with check ((select private.is_admin()));
create policy category_admin_update on public.product_categories for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create trigger product_categories_updated before update on public.product_categories for each row execute function private.set_updated_at();

revoke all on public.customers,public.customer_documents,public.product_categories,public.document_imports,public.purchase_transactions,public.purchase_items from anon,authenticated;
grant select on public.customers,public.customer_documents,public.product_categories,public.document_imports,public.purchase_transactions,public.purchase_items to authenticated;
grant insert (store_id,name,name_kana,birth_date,occupation,postal_code,address,phone,dm_allowed,membership_card_number,identification_type,identification_number) on public.customers to authenticated;
grant update (name,name_kana,birth_date,occupation,postal_code,address,phone,dm_allowed,membership_card_number,identification_type,identification_number) on public.customers to authenticated;
grant insert (customer_id,document_type,file_name) on public.customer_documents to authenticated;
grant update (document_type,file_name) on public.customer_documents to authenticated;
grant insert (parent_category_id,category_name,display_order,is_active) on public.product_categories to authenticated;
-- 子孫levelはトリガーで更新するためupdate権限に含める。beforeトリガーで常に再計算する。
grant update (parent_category_id,category_name,category_level,display_order,is_active) on public.product_categories to authenticated;
grant insert (store_id,document_type,file_name) on public.document_imports to authenticated;
grant update (document_type,file_name) on public.document_imports to authenticated;
grant insert (store_id,customer_id,document_number,visit_datetime,purchase_staff_name,payment_staff_name,transaction_status,visit_source,visit_source_detail,purchase_item_count,purchase_total,source_document_id,notes) on public.purchase_transactions to authenticated;
grant update (customer_id,document_number,visit_datetime,purchase_staff_name,payment_staff_name,transaction_status,visit_source,visit_source_detail,purchase_item_count,purchase_total,source_document_id,notes) on public.purchase_transactions to authenticated;
grant insert (purchase_transaction_id,product_category_id,item_name,denomination_or_weight,quantity,purchase_amount,category_reviewed,notes,display_order) on public.purchase_items to authenticated;
grant update (product_category_id,item_name,denomination_or_weight,quantity,purchase_amount,category_reviewed,notes,display_order) on public.purchase_items to authenticated;
grant delete on public.purchase_items to authenticated;

commit;
