begin;

alter table public.document_imports
  add column upload_path text,
  add column content_type text check (content_type in ('image/jpeg','image/png')),
  add column expected_file_size bigint check (expected_file_size between 1 and 10485760),
  add column file_size bigint check (file_size between 1 and 10485760),
  add column processing_started_at timestamptz,
  add column processing_token uuid,
  add column ai_result jsonb,
  add column reviewed_result jsonb,
  add column ai_schema_version text,
  add column ai_model text;
alter table public.customer_documents
  add column upload_path text,
  add column content_type text check (content_type in ('image/jpeg','image/png')),
  add column expected_file_size bigint check (expected_file_size between 1 and 10485760),
  add column file_size bigint check (file_size between 1 and 10485760);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portal-source-documents','portal-source-documents',false,10485760,array['image/jpeg','image/png']);

-- Secret Keyから呼び出すRPCも、検証済みAuth利用者の現在の店舗権限をDBで再確認する。
create function private.actor_can_access_store(p_actor uuid,p_store uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.profiles p left join public.stores s on s.id=p.store_id
    where p.id=p_actor and p.is_active and (p.role='admin' or (p.role='staff' and s.is_active and p.store_id=p_store)));
$$;
revoke all on function private.actor_can_access_store(uuid,uuid) from public;

create function private.can_read_source_object(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.document_imports d where d.file_url=p_name and private.can_access_store(d.store_id))
    or exists(select 1 from public.customer_documents d join public.customers c on c.id=d.customer_id
      where d.file_url=p_name and private.can_access_store(c.store_id));
$$;
revoke all on function private.can_read_source_object(text) from public;
grant execute on function private.can_read_source_object(text) to authenticated;
create policy portal_source_read on storage.objects for select to authenticated
using(bucket_id='portal-source-documents' and private.can_read_source_object(name));
-- 既存の別bucket向けの広いpermissiveポリシーがあっても、このbucketを開放しない。
create policy portal_source_scope_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'portal-source-documents' or private.can_read_source_object(name))
with check(bucket_id<>'portal-source-documents');
create policy portal_source_anon_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'portal-source-documents') with check(bucket_id<>'portal-source-documents');
create policy portal_source_no_client_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'portal-source-documents');

create function public.prepare_document_upload(p_actor uuid,p_kind text,p_id uuid,p_mime text,p_size bigint)
returns text language plpgsql security definer set search_path='' as $$
declare target_store uuid; path text; expected bigint; mime text; uploaded text;
begin
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

-- 実画像の形式/画素数はサーバーで検証し、このRPCでStorageメタデータと店舗を再検証する。
create function public.complete_document_upload(p_actor uuid,p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_store uuid; path text; expected bigint; mime text; meta jsonb;
begin
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

create function public.claim_import_processing(p_actor uuid,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.document_imports; token uuid;
begin
  select * into d from public.document_imports where id=p_id for update;
  if not found or not private.actor_can_access_store(p_actor,d.store_id) then raise exception 'Document not accessible' using errcode='42501'; end if;
  if d.document_type<>'purchase_document' or d.file_url is null or d.file_size is null
    or exists(select 1 from public.purchase_transactions where source_document_id=p_id) then
    raise exception 'Document cannot be processed' using errcode='23514'; end if;
  if d.processing_status not in ('pending','failed') and not (d.processing_status='processing' and coalesce(d.processing_started_at,d.created_at)<now()-interval '2 minutes') then
    raise exception 'Document already being processed or reviewed' using errcode='55P03'; end if;
  token:=gen_random_uuid();
  update public.document_imports set processing_status='processing',processing_token=token,processing_started_at=now(),error_message=null,
    retry_count=retry_count+case when d.processing_status='pending' then 0 else 1 end where id=p_id;
  return token;
end;
$$;

create function public.finish_import_processing(p_actor uuid,p_id uuid,p_token uuid,p_result jsonb,p_review jsonb,p_model text,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.document_imports;
begin
  select * into d from public.document_imports where id=p_id for update;
  if not found or not private.actor_can_access_store(p_actor,d.store_id) then raise exception 'Document not accessible' using errcode='42501'; end if;
  if d.processing_status<>'processing' or d.processing_token is distinct from p_token then return false; end if;
  if p_error_code is not null then
    update public.document_imports set processing_status='failed',processing_token=null,processed_at=now(),error_message=
      case p_error_code
        when 'configuration' then '画像読取の接続設定を確認してください。'
        when 'rate_limit' then '読取サービスの利用上限に達しました。時間をおいて再処理してください。'
        when 'timeout' then '読取に時間がかかりすぎました。時間をおいて再処理してください。'
        when 'invalid_image' then '画像の形式・サイズを確認してください。'
        when 'invalid_result' then '読取結果を取得できませんでした。鮮明な原本で再処理してください。'
        else '読取サービスに接続できませんでした。時間をおいて再処理してください。' end where id=p_id;
  else
    if jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_review) is distinct from 'object'
      or octet_length(p_result::text)>1048576 or octet_length(p_review::text)>1048576 or p_model is null then
      raise exception 'Invalid reading result' using errcode='23514'; end if;
    update public.document_imports set processing_status='review_required',processing_token=null,processed_at=now(),error_message=null,
      ai_result=p_result,reviewed_result=p_review,ai_schema_version='purchase-v1',ai_model=p_model where id=p_id;
  end if;
  return true;
end;
$$;

-- 人の修正は確認用JSONに保存するだけ。顧客/取引/商品明細を確定しない。
create function public.save_import_review(p_id uuid,p_review jsonb,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare d public.document_imports; item jsonb; source_index integer; seen integer[]:='{}';
begin
  select * into d from public.document_imports where id=p_id for update;
  if not found or not private.can_access_store(d.store_id) then raise exception 'Document not accessible' using errcode='42501'; end if;
  if d.processing_status<>'review_required' or d.ai_result is null or d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Review changed; reload document' using errcode='40001'; end if;
  if jsonb_typeof(p_review) is distinct from 'object' or jsonb_typeof(p_review->'items') is distinct from 'array'
    or jsonb_array_length(p_review->'items')>200 or octet_length(p_review::text)>1048576 then raise exception 'Invalid review' using errcode='23514'; end if;
  for item in select value from jsonb_array_elements(p_review->'items') loop
    source_index:=(item->>'source_line_index')::integer;
    if source_index is null then
      if item->'raw_item_name' is distinct from 'null'::jsonb then raise exception 'Raw item cannot be changed' using errcode='23514'; end if;
    else
      if source_index<0 or source_index>=jsonb_array_length(d.ai_result->'items') or source_index=any(seen)
        or item->'raw_item_name' is distinct from d.ai_result#>array['items',source_index::text,'raw_item_name'] then
        raise exception 'Raw item cannot be changed' using errcode='23514'; end if;
      seen:=array_append(seen,source_index);
    end if;
  end loop;
  update public.document_imports set reviewed_result=p_review where id=p_id;
end;
$$;

-- 読取中/読取済みの原本種別変更は、人の確認結果と紐付けを壊すため禁止。
create function private.keep_reading_document_type()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.document_type<>old.document_type and (old.upload_path is not null or old.ai_result is not null or old.processing_status<>'pending') then
    raise exception 'Uploaded document type cannot be changed' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.keep_reading_document_type() from public;
create trigger import_reading_type before update on public.document_imports for each row execute function private.keep_reading_document_type();

revoke all on function public.prepare_document_upload(uuid,text,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.complete_document_upload(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.claim_import_processing(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_import_processing(uuid,uuid,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.prepare_document_upload(uuid,text,uuid,text,bigint) to service_role;
grant execute on function public.complete_document_upload(uuid,text,uuid) to service_role;
grant execute on function public.claim_import_processing(uuid,uuid) to service_role;
grant execute on function public.finish_import_processing(uuid,uuid,uuid,jsonb,jsonb,text,text) to service_role;
revoke all on function public.save_import_review(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_import_review(uuid,jsonb,timestamptz) to authenticated;

commit;
