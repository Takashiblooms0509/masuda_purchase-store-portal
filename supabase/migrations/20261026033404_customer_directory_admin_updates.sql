-- Limited cross-store customer directory and admin-only customer updates.
-- No data backfill; base customer SELECT and related-resource boundaries stay intact.
-- Preserve all existing customer SELECT, transaction, document and storage policies.
begin;

alter policy store_update on public.customers
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- A narrowly privileged read is needed because the base SELECT RLS must remain
-- store-scoped (the base table also contains identification numbers).
-- Identity/eligibility is derived from auth.uid() + profiles/stores, never args.
create function private.customer_directory(
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
      c.membership_card_number,c.created_at
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
revoke all on function private.customer_directory(text,text,text,uuid,date,date,uuid,integer) from public,anon,authenticated;
grant execute on function private.customer_directory(text,text,text,uuid,date,date,uuid,integer) to authenticated;

-- Exposed entry point is INVOKER; only the internal allowlisted reader is DEFINER.
create function public.get_customer_directory(
  p_name text default '', p_phone text default '', p_card text default '',
  p_store uuid default null, p_from date default null, p_to date default null,
  p_selected uuid default null, p_page integer default 1
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.customer_directory(p_name,p_phone,p_card,p_store,p_from,p_to,p_selected,p_page);
$$;
revoke all on function public.get_customer_directory(text,text,text,uuid,date,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_customer_directory(text,text,text,uuid,date,date,uuid,integer) to authenticated;
commit;

-- Rollback new read surface: drop public.get_customer_directory then
-- private.customer_directory (same signatures). Base SELECT policies are unchanged.
-- Do not automatically restore staff UPDATE permission: that would undo the
-- admin-only requirement and needs a separate decision. No data rewrite occurs.
