-- Draft for review; no production application. Legacy CSV function and ACL stay unchanged.
begin;
set local lock_timeout='5s';
-- No data rewrite: legacy types and numbers may remain unchanged on unrelated edits.
create function private.customer_identification_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.identification_type is not distinct from old.identification_type
    and new.identification_number is not distinct from old.identification_number then return new; end if;
 if tg_op='UPDATE' and old.identification_type in ('マイナンバーカード','my_number_card')
    and nullif(btrim(old.identification_number),'') is not null
    and new.identification_number is not distinct from old.identification_number
 then raise exception 'Legacy identification requires separate review' using errcode='22023'; end if;
 if new.identification_type is not null and new.identification_type not in ('運転免許証','マイナンバーカード','パスポート','その他')
 then raise exception 'Invalid identification type' using errcode='22023'; end if;
 if new.identification_type='マイナンバーカード' and nullif(btrim(new.identification_number),'') is not null
 then raise exception 'Identification number must be blank' using errcode='22023'; end if;
 return new;
end;
$$;
revoke all on function private.customer_identification_guard() from public,anon,authenticated;
create trigger customer_identification_guard before insert or update on public.customers
 for each row execute function private.customer_identification_guard();
create or replace function private.customer_detail(p_customer uuid,p_page integer default 1,p_document_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.customer_reader_allowed() then raise exception 'Access denied' using errcode='42501'; end if;
 if p_customer is null or p_page is null or p_page<1 or p_page>10000 or p_document_page is null or p_document_page<1 or p_document_page>10000 then raise exception 'Invalid request' using errcode='22023'; end if;
 select jsonb_build_object('customer',jsonb_build_object(
 'id',c.id,'store_id',c.store_id,'name',c.name,'name_kana',c.name_kana,'birth_date',c.birth_date,
 'gender',c.gender,'occupation',c.occupation,'postal_code',c.postal_code,'address',c.address,'phone',c.phone,
 'dm_allowed',c.dm_allowed,'membership_card_number',c.membership_card_number,
 'identification_type',c.identification_type,'identification_number',case when c.identification_type in ('マイナンバーカード','my_number_card') then null else c.identification_number end,'memo',c.memo,
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
create function public.insert_customer_csv_v2(p_request uuid,p_rows jsonb) returns integer
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
   if jsonb_typeof(r)<>'object' or not (r ?& array['store_id','name','name_kana','birth_date','gender','occupation','phone','membership_card_number','postal_code','address','dm_allowed','identification_type','identification_number','approved_duplicate_ids'])
    or exists(select 1 from jsonb_object_keys(r) k where k not in ('store_id','name','name_kana','birth_date','gender','occupation','phone','membership_card_number','postal_code','address','dm_allowed','identification_type','identification_number','approved_duplicate_ids'))
    or jsonb_typeof(r->'approved_duplicate_ids')<>'array' then raise exception 'Invalid row' using errcode='22023'; end if;
   if exists(select 1 from jsonb_each(r) e where e.key<>'approved_duplicate_ids' and jsonb_typeof(e.value)<>'string')
    or length(btrim(r->>'name')) not between 1 and 100 or length(r->>'name_kana')>100
    or length(r->>'phone')>50 or length(r->>'membership_card_number')>100
    or jsonb_array_length(r->'approved_duplicate_ids')>20
    then raise exception 'Invalid fields' using errcode='22023'; end if;
   if length(r->>'occupation')>100 or length(r->>'postal_code')>20 or length(r->>'address')>500
    or length(r->>'identification_number')>100
    or r->>'gender' not in ('','male','female','other','unspecified')
    or r->>'dm_allowed' not in ('','true','false')
    or r->>'identification_type' not in ('','運転免許証','マイナンバーカード','パスポート','その他')
    or ((r->>'identification_type')='マイナンバーカード' and nullif(btrim(r->>'identification_number'),'') is not null)
    then raise exception 'Invalid fields' using errcode='22023'; end if;
   if r->>'birth_date'<>'' then
    begin
     if r->>'birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite((r->>'birth_date')::date)
      or to_char((r->>'birth_date')::date,'YYYY-MM-DD')<>r->>'birth_date'
      then raise exception 'Invalid date'; end if;
    exception when others then raise exception 'Invalid date' using errcode='22023'; end;
   end if;
   if exists(select 1 from jsonb_each_text(r) e where e.key<>'approved_duplicate_ids'
     and (e.value ~ '^[[:space:]]*[=+@-]' or e.value ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'))
     then raise exception 'Invalid text' using errcode='22023'; end if;
   target:=(r->>'store_id')::uuid;
   if not private.can_access_store(target) or not exists(select 1 from public.stores where id=target and is_active)
    then raise exception 'Store denied' using errcode='42501'; end if;
   select coalesce(array_agg(x.id order by x.id),'{}'::uuid[]) into candidates from public.find_customer_candidates(target,r) x;
   select coalesce(array_agg(v::uuid order by v::uuid),'{}'::uuid[]) into approved from jsonb_array_elements_text(r->'approved_duplicate_ids') v;
   if candidates<>approved then raise exception 'Candidates changed' using errcode='40001'; end if;
   insert into public.customers(store_id,name,name_kana,birth_date,gender,occupation,phone,membership_card_number,postal_code,address,dm_allowed,identification_type,identification_number)
   values(target,btrim(r->>'name'),nullif(btrim(r->>'name_kana'),''),nullif(btrim(r->>'birth_date'),'')::date,nullif(btrim(r->>'gender'),''),nullif(btrim(r->>'occupation'),''),nullif(btrim(r->>'phone'),''),nullif(btrim(r->>'membership_card_number'),''),nullif(btrim(r->>'postal_code'),''),nullif(btrim(r->>'address'),''),nullif(btrim(r->>'dm_allowed'),'')::boolean,nullif(btrim(r->>'identification_type'),''),nullif(btrim(r->>'identification_number'),''));
 end loop;
 insert into private.customer_import_receipts(actor_id,request_id,payload_digest,row_count) values(auth.uid(),p_request,encode(sha256(convert_to(p_rows::text,'UTF8')),'hex'),n);
 return n;
end;
$$;
revoke all on function public.insert_customer_csv_v2(uuid,jsonb) from public,anon;
grant execute on function public.insert_customer_csv_v2(uuid,jsonb) to authenticated;

commit;
