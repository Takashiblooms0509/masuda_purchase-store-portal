-- Reviewed customer surface only. Base table SELECT / transaction / report / Storage RLS stay scoped.
begin;
alter table public.customers add column gender text check (gender in ('female','male','other','unspecified'));
alter table public.customers add column memo text check (length(memo)<=1000);
grant insert(gender,memo), update(gender,memo) on public.customers to authenticated;

create function private.customer_reader_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join public.stores s on s.id=p.store_id
 where p.id=(select auth.uid()) and p.is_active and (p.role='admin' or (p.role='staff' and s.is_active)));
$$;
revoke all on function private.customer_reader_allowed() from public,anon;
grant execute on function private.customer_reader_allowed() to authenticated;

create function private.customer_detail(p_customer uuid,p_page integer default 1,p_document_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.customer_reader_allowed() then raise exception 'Access denied' using errcode='42501'; end if;
 if p_customer is null or p_page is null or p_page<1 or p_page>10000 or p_document_page is null or p_document_page<1 or p_document_page>10000 then raise exception 'Invalid request' using errcode='22023'; end if;
 select jsonb_build_object('customer',jsonb_build_object(
 'id',c.id,'store_id',c.store_id,'name',c.name,'name_kana',c.name_kana,'birth_date',c.birth_date,
 'gender',c.gender,'occupation',c.occupation,'postal_code',c.postal_code,'address',c.address,'phone',c.phone,
 'dm_allowed',c.dm_allowed,'membership_card_number',c.membership_card_number,
 'identification_type',c.identification_type,'identification_number',c.identification_number,'memo',c.memo,
 'first_visit_date',c.first_visit_date,'last_visit_date',c.last_visit_date,'created_at',c.created_at,'updated_at',c.updated_at),
 'store_name',s.name,
 'documents',coalesce((select jsonb_agg(d order by d.created_at desc,d.id) from
 (select d.id,d.document_type,d.file_name,d.created_at,(d.file_url is not null and d.content_type is not null) as has_image
 from public.customer_documents d where d.customer_id=c.id order by d.created_at desc,d.id limit 20 offset ((p_document_page-1)*20)) d),'[]'::jsonb),
 'document_count',(select count(*) from public.customer_documents d where d.customer_id=c.id),
 'transactions',coalesce((select jsonb_agg(t order by t.visit_datetime desc,t.id) from
 (select t.id,t.visit_datetime,t.transaction_status,t.notes,
 (select coalesce(sum(i.purchase_amount) filter(where i.purchase_status='completed'),0) from public.purchase_items i where i.purchase_transaction_id=t.id) as purchase_amount,
 (select count(*) from public.purchase_items i where i.purchase_transaction_id=t.id and i.purchase_status='completed') as completed_items,
 (select count(*) from public.purchase_items i where i.purchase_transaction_id=t.id and i.purchase_status='not_completed') as not_completed_items
 from public.purchase_transactions t where t.customer_id=c.id order by t.visit_datetime desc,t.id limit 10 offset ((p_page-1)*10)) t),'[]'::jsonb),
 'transaction_count',(select count(*) from public.purchase_transactions t where t.customer_id=c.id)) into result
 from public.customers c join public.stores s on s.id=c.store_id where c.id=p_customer;
 return result;
end;
$$;
revoke all on function private.customer_detail(uuid,integer,integer) from public,anon;
grant execute on function private.customer_detail(uuid,integer,integer) to authenticated;
create function public.get_customer_detail(p_customer uuid,p_page integer default 1,p_document_page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$select private.customer_detail(p_customer,p_page,p_document_page);$$;
revoke all on function public.get_customer_detail(uuid,integer,integer) from public,anon;
grant execute on function public.get_customer_detail(uuid,integer,integer) to authenticated;

-- Resolve a document only through its customer ownership link. Service credential only;
-- application derives p_actor from authenticated session and rechecks eligibility here.
create function public.customer_media_source(p_actor uuid,p_customer uuid,p_document uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles p left join public.stores s on s.id=p.store_id
 where p.id=p_actor and p.is_active and (p.role='admin' or (p.role='staff' and s.is_active)))
 then raise exception 'Access denied' using errcode='42501'; end if;
 select jsonb_build_object('path',d.file_url,'content_type',d.content_type) into result
 from public.customer_documents d join public.customers c on c.id=d.customer_id
 where c.id=p_customer and d.id=p_document and d.file_url is not null and d.content_type in ('image/jpeg','image/png');
 return result;
end;
$$;
revoke all on function public.customer_media_source(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_media_source(uuid,uuid,uuid) to service_role;

-- Existing customer edits already admin-only. Also forbid staff document metadata writes.
drop policy customer_document_access on public.customer_documents;
create policy customer_document_read on public.customer_documents for select to authenticated
 using (exists(select 1 from public.customers c where c.id=customer_id and private.can_access_store(c.store_id)));
create policy customer_document_admin_insert on public.customer_documents for insert to authenticated with check ((select private.is_admin()));
create policy customer_document_admin_update on public.customer_documents for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Serialize customer writes with import confirmation to recheck duplicate candidates.
-- No row changes; preserve existing write permissions. Repeatable-read imports are rejected below.
create function private.customer_write_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(73620491); return null; end;
$$;
revoke all on function private.customer_write_guard() from public,anon,authenticated;
create trigger customer_write_guard before insert or update or delete on public.customers for each statement execute function private.customer_write_guard();

-- Request receipt contains a digest/count only, never the imported personal data.
create table private.customer_import_receipts (
 actor_id uuid not null references public.profiles(id), request_id uuid not null,
 payload_digest text not null, row_count integer not null check(row_count between 1 and 20),
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table private.customer_import_receipts enable row level security;
revoke all on private.customer_import_receipts from public,anon,authenticated;
grant select,insert on private.customer_import_receipts to authenticated;
create policy own_receipts_read on private.customer_import_receipts for select to authenticated using(actor_id=(select auth.uid()) and (select private.customer_reader_allowed()));
create policy own_receipts_insert on private.customer_import_receipts for insert to authenticated with check(actor_id=(select auth.uid()) and (select private.customer_reader_allowed()));

create function public.insert_customer_csv(p_request uuid,p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare r jsonb; target uuid; candidates uuid[]; approved uuid[]; receipt private.customer_import_receipts; n integer;
begin
 if not private.customer_reader_allowed() then raise exception 'Access denied' using errcode='42501'; end if;
 if p_request is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or octet_length(p_rows::text)>65536
 then raise exception 'Invalid batch' using errcode='22023'; end if;
 n:=jsonb_array_length(p_rows);
 if n<1 or n>20 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 if current_setting('transaction_isolation') not in ('read committed','serializable') then raise exception 'Unsupported isolation' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(73620491);
 select * into receipt from private.customer_import_receipts where actor_id=auth.uid() and request_id=p_request;
 if found then
   if receipt.payload_digest<>encode(sha256(convert_to(p_rows::text,'UTF8')),'hex') then raise exception 'Request changed' using errcode='22023'; end if;
   return receipt.row_count;
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(r)<>'object' or not (r ?& array['store_id','name','name_kana','phone','membership_card_number','approved_duplicate_ids'])
    or exists(select 1 from jsonb_object_keys(r) k where k not in ('store_id','name','name_kana','phone','membership_card_number','approved_duplicate_ids'))
    or jsonb_typeof(r->'approved_duplicate_ids')<>'array' then raise exception 'Invalid row' using errcode='22023'; end if;
   if exists(select 1 from jsonb_each(r) e where e.key<>'approved_duplicate_ids' and jsonb_typeof(e.value)<>'string')
    or length(btrim(r->>'name')) not between 1 and 100 or length(r->>'name_kana')>100
    or length(r->>'phone')>50 or length(r->>'membership_card_number')>100
    or jsonb_array_length(r->'approved_duplicate_ids')>20
    then raise exception 'Invalid fields' using errcode='22023'; end if;
   target:=(r->>'store_id')::uuid;
   if not private.can_access_store(target) or not exists(select 1 from public.stores where id=target and is_active)
    then raise exception 'Store denied' using errcode='42501'; end if;
   select coalesce(array_agg(x.id order by x.id),'{}'::uuid[]) into candidates from public.find_customer_candidates(target,r) x;
   select coalesce(array_agg(v::uuid order by v::uuid),'{}'::uuid[]) into approved from jsonb_array_elements_text(r->'approved_duplicate_ids') v;
   if candidates<>approved then raise exception 'Candidates changed' using errcode='40001'; end if;
   insert into public.customers(store_id,name,name_kana,phone,membership_card_number)
   values(target,btrim(r->>'name'),nullif(btrim(r->>'name_kana'),''),nullif(btrim(r->>'phone'),''),nullif(btrim(r->>'membership_card_number'),''));
 end loop;
 insert into private.customer_import_receipts(actor_id,request_id,payload_digest,row_count) values(auth.uid(),p_request,encode(sha256(convert_to(p_rows::text,'UTF8')),'hex'),n);
 return n;
end;
$$;
revoke all on function public.insert_customer_csv(uuid,jsonb) from public,anon;
grant execute on function public.insert_customer_csv(uuid,jsonb) to authenticated;

create or replace function public.prepare_document_upload(p_actor uuid,p_kind text,p_id uuid,p_mime text,p_size bigint)
returns text language plpgsql security definer set search_path='' as $$
declare target_store uuid; path text; expected bigint; mime text; uploaded text;
begin
  if p_kind='customer_document' and not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active) then raise exception 'Customer documents require admin' using errcode='42501'; end if;
  if p_mime not in ('image/jpeg','image/png') or p_mime is null or p_size is null or p_size not between 1 and 10485760 then
    raise exception 'Invalid upload' using errcode='23514'; end if;
  if p_kind='import' then
    select store_id,upload_path,expected_file_size,content_type,file_url into target_store,path,expected,mime,uploaded
      from public.document_imports where id=p_id for update;
  elsif p_kind='customer_document' then
    select c.store_id,d.upload_path,d.expected_file_size,d.content_type,d.file_url into target_store,path,expected,mime,uploaded
      from public.customer_documents d join public.customers c on c.id=d.customer_id where d.id=p_id for update of d;
  else raise exception 'Invalid document kind' using errcode='23514'; end if;
  if target_store is null or not private.actor_can_access_store(p_actor,target_store) then
    raise exception 'Document not accessible' using errcode='42501'; end if;
  if uploaded is not null then raise exception 'Original cannot be overwritten' using errcode='23514'; end if;
  if path is not null then
    if expected is distinct from p_size or mime is distinct from p_mime then raise exception 'Upload already reserved' using errcode='23514'; end if;
    return path;
  end if;
  path:=target_store::text||'/'||p_kind||'/'||p_id::text||'/source.'||case when p_mime='image/jpeg' then 'jpg' else 'png' end;
  if p_kind='import' then
    update public.document_imports set upload_path=path,content_type=p_mime,expected_file_size=p_size where id=p_id;
  else
    update public.customer_documents set upload_path=path,content_type=p_mime,expected_file_size=p_size where id=p_id;
  end if;
  return path;
end;
$$;

create or replace function public.complete_document_upload(p_actor uuid,p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_store uuid; path text; expected bigint; mime text; meta jsonb;
begin
  if p_kind='customer_document' and not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active) then raise exception 'Customer documents require admin' using errcode='42501'; end if;
  if p_kind='import' then
    select store_id,upload_path,expected_file_size,content_type into target_store,path,expected,mime
      from public.document_imports where id=p_id for update;
  elsif p_kind='customer_document' then
    select c.store_id,d.upload_path,d.expected_file_size,d.content_type into target_store,path,expected,mime
      from public.customer_documents d join public.customers c on c.id=d.customer_id where d.id=p_id for update of d;
  else raise exception 'Invalid document kind' using errcode='23514'; end if;
  if target_store is null or not private.actor_can_access_store(p_actor,target_store) then raise exception 'Document not accessible' using errcode='42501'; end if;
  if path is null then raise exception 'No upload reservation' using errcode='23514'; end if;
  select metadata into meta from storage.objects where bucket_id='portal-source-documents' and name=path;
  if meta is null or (meta->>'size')::bigint is distinct from expected or meta->>'mimetype' is distinct from mime then
    raise exception 'Uploaded object mismatch' using errcode='23514'; end if;
  if p_kind='import' then
    update public.document_imports set file_url=path,file_size=expected where id=p_id;
  else
    update public.customer_documents set file_url=path,file_size=expected,uploaded_at=coalesce(uploaded_at,now()) where id=p_id;
  end if;
end;
$$;

create or replace function private.customer_directory(
  p_name text default '', p_phone text default '', p_card text default '',
  p_store uuid default null, p_from date default null, p_to date default null,
  p_selected uuid default null, p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.profiles p left join public.stores s on s.id=p.store_id
    where p.id=(select auth.uid()) and p.is_active
      and (p.role='admin' or (p.role='staff' and s.is_active))
  ) then
    raise exception 'Customer directory access denied' using errcode='42501';
  end if;
  if p_name is null or p_phone is null or p_card is null
    or length(p_name)>100 or length(p_phone)>50 or length(p_card)>100
    or p_page is null or p_page<1 or p_page>10000
    or (p_from is not null and (not isfinite(p_from) or p_from < date '0001-01-01' or p_from > date '9999-12-31'))
    or (p_to is not null and (not isfinite(p_to) or p_to < date '0001-01-01' or p_to > date '9999-12-31'))
    or (p_from is not null and p_to is not null and p_from>p_to)
  then raise exception 'Invalid customer search' using errcode='22023'; end if;

  with directory as not materialized (
    select c.id,c.store_id,c.name,c.name_kana,c.phone,
      c.membership_card_number,c.created_at,c.gender,
      case when c.birth_date is not null and c.birth_date <= (now() at time zone 'Asia/Tokyo')::date then extract(year from age((now() at time zone 'Asia/Tokyo')::date,c.birth_date))::integer else null end as age
    from public.customers c
  ), filtered as (
    select d.* from directory d
    where (p_store is null or d.store_id=p_store)
      and (p_name='' or position(lower(p_name) in lower(d.name))>0
        or position(lower(p_name) in lower(coalesce(d.name_kana,'')))>0)
      and (p_phone='' or position(lower(p_phone) in lower(coalesce(d.phone,'')))>0)
      and (p_card='' or position(lower(p_card) in lower(coalesce(d.membership_card_number,'')))>0)
      and (p_from is null or d.created_at >= (p_from::timestamp at time zone 'Asia/Tokyo'))
      and (p_to is null or d.created_at < ((p_to+1)::timestamp at time zone 'Asia/Tokyo'))
  ), page_rows as (
    select * from filtered order by created_at desc,id limit 30 offset ((p_page-1)*30)
  )
  select jsonb_build_object(
    'customers',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from page_rows r),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'selected',(select to_jsonb(d) from directory d where d.id=p_selected),
    'stores',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.code,s.id) from public.stores s),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
-- Take the same lock before existing customer row locks to keep lock ordering consistent.
create or replace function private.refresh_customer_visits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(73620491);
  -- 顧客行ロックで同じ顧客への同時登録を直列化する。
  perform 1 from public.customers where id in (new.customer_id, case when tg_op='UPDATE' then old.customer_id else new.customer_id end) order by id for update;
  update public.customers c set
    first_visit_date = (select min((visit_datetime at time zone 'Asia/Tokyo')::date) from public.purchase_transactions t where t.customer_id=c.id),
    last_visit_date = (select max((visit_datetime at time zone 'Asia/Tokyo')::date) from public.purchase_transactions t where t.customer_id=c.id)
  where c.id = new.customer_id or (tg_op='UPDATE' and c.id=old.customer_id);
  return new;
end;
$$;
commit;
