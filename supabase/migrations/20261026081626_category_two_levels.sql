-- Two-level category master. No row rewriting or permission changes.
begin;
set local lock_timeout = '5s';
-- Prevent a concurrent writer inserting a deeper node between preflight and validation.
lock table public.product_categories in access exclusive mode;
do $$
begin
  if exists (
    select 1 from public.product_categories c
    left join public.product_categories p on p.id = c.parent_category_id
    where c.category_level not between 1 and 2
       or (c.parent_category_id is null and c.category_level <> 1)
       or (c.parent_category_id is not null and
           (p.id is null or p.parent_category_id is not null or c.category_level <> 2))
  ) then
    raise exception 'category_existing_depth_invalid' using errcode = '23514';
  end if;
end;
$$;
-- Existing hierarchy triggers derive levels and propagate parent moves to descendants.
-- The CHECK therefore also rejects moving a parent with children under another parent.
alter table public.product_categories
  add constraint category_max_two_levels check (category_level <= 2);
-- Preserve the existing RPC signature, SECURITY INVOKER, fixed search_path, owner and ACL.
-- Roots in the final graph are processed first as before. Within final children,
-- move existing children before demoting roots: otherwise a root's old children
-- can transiently become grandchildren despite a valid two-level final graph.
create or replace function public.save_category_batch(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r jsonb; v_plan jsonb; v_graph jsonb; v_work jsonb:='[]'::jsonb;
  v_ids jsonb:='{}'::jsonb; v_id uuid; v_parent uuid; v_key text; v_parent_key text;
  v_count integer; v_added integer:=0; v_updated integer:=0;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'category_admin_required' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'category_invalid_rows' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then
    raise exception 'category_batch_limit' using errcode='22023';
  end if;
  if current_setting('transaction_isolation')='repeatable read' then
    raise exception 'category_repeatable_read_unsupported' using errcode='25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20461001);
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>8 or
       not (r ?& array['id','new_key','parent_id','parent_new_key','category_name','display_order','is_active','updated_at']) or
       jsonb_typeof(r->'category_name')<>'string' or length(private.category_trim_name(r->>'category_name')) not between 1 and 100 or
       jsonb_typeof(r->'is_active')<>'boolean' or jsonb_typeof(r->'display_order')<>'number' or
       (r->>'display_order') !~ '^-?[0-9]+$' or (r->>'display_order')::numeric not between -2147483648 and 2147483647 then
      raise exception 'category_invalid_row' using errcode='22023';
    end if;
    foreach v_key in array array['id','new_key','parent_id','parent_new_key','updated_at'] loop
      if jsonb_typeof(r->v_key) not in ('string','null') then
        raise exception 'category_invalid_reference' using errcode='22023';
      end if;
    end loop;
    if r->>'id' is null then
      if r->>'new_key' is null or (r->>'new_key') !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$' or r->>'updated_at' is not null then
        raise exception 'category_invalid_new_key' using errcode='22023';
      end if;
      v_key:='new:'||(r->>'new_key');
    else
      v_id:=(r->>'id')::uuid;
      if r->>'new_key' is not null or r->>'updated_at' is null or not isfinite((r->>'updated_at')::timestamptz) then
        raise exception 'category_invalid_revision' using errcode='22023';
      end if;
      if not exists(select 1 from public.product_categories where id=v_id) then
        raise exception 'category_unknown_id' using errcode='22023';
      end if;
      if not exists(select 1 from public.product_categories where id=v_id and updated_at=(r->>'updated_at')::timestamptz) then
        raise exception 'category_conflict' using errcode='40001';
      end if;
      v_key:=v_id::text;
    end if;
    if exists(select 1 from jsonb_array_elements(v_work) w where w->>'key'=v_key) then
      raise exception 'category_duplicate_row' using errcode='22023';
    end if;
    if r->>'parent_id' is not null and r->>'parent_new_key' is not null then
      raise exception 'category_ambiguous_parent' using errcode='22023';
    end if;
    v_parent_key:=null;
    if r->>'parent_id' is not null then
      v_parent:=(r->>'parent_id')::uuid;
      if not exists(select 1 from public.product_categories where id=v_parent) then
        raise exception 'category_unknown_parent' using errcode='22023';
      end if;
      v_parent_key:=v_parent::text;
    elsif r->>'parent_new_key' is not null then
      if (r->>'parent_new_key') !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$' then
        raise exception 'category_invalid_parent_key' using errcode='22023';
      end if;
      v_parent_key:='new:'||(r->>'parent_new_key');
    end if;
    v_work:=v_work||jsonb_build_array(r||jsonb_build_object('key',v_key,'parent',v_parent_key));
  end loop;
  -- Full projected graph: untouched history plus the proposed replacements/new rows.
  select coalesce(jsonb_agg(g),'[]'::jsonb) into v_graph from (
    select jsonb_build_object('key',id::text,'parent',parent_category_id::text,'category_name',category_name,'is_active',is_active,'change',false) g
    from public.product_categories c where not exists(select 1 from jsonb_array_elements(v_work) w where w->>'key'=c.id::text)
    union all select w||jsonb_build_object('change',true) from jsonb_array_elements(v_work) w
  ) q;
  if exists(select 1 from jsonb_array_elements(v_graph) c where c->>'parent' is not null and not exists(select 1 from jsonb_array_elements(v_graph) p where p->>'key'=c->>'parent')) then
    raise exception 'category_unknown_parent_key' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(v_graph) c join jsonb_array_elements(v_graph) p on p->>'key'=c->>'parent' where (c->>'is_active')::boolean and not (p->>'is_active')::boolean) then
    raise exception 'category_active_child' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_array_elements(v_graph) c group by c->>'parent',private.category_trim_name(c->>'category_name') having count(*)>1) then
    raise exception 'category_duplicate_name' using errcode='23505';
  end if;
  with recursive tree as (
    select g,1 as depth from jsonb_array_elements(v_graph) g where g->>'parent' is null
    union all select c,t.depth+1 from tree t join jsonb_array_elements(v_graph) c on c->>'parent'=t.g->>'key'
  ) select coalesce(jsonb_agg(g order by depth,coalesce((select c.category_level from public.product_categories c where c.id=(g->>'id')::uuid),0) desc,g->>'key'),'[]'::jsonb),count(*) into v_plan,v_count from tree;
  if v_count<>jsonb_array_length(v_graph) then
    raise exception 'category_cycle' using errcode='23514';
  end if;
  -- Validate the final CSV graph before any writes; the CHECK also protects direct writes.
  if exists (
    select 1 from jsonb_array_elements(v_graph) c
    join jsonb_array_elements(v_graph) p on p->>'key'=c->>'parent'
    where p->>'parent' is not null
  ) then
    raise exception 'category_max_two_levels' using errcode='23514';
  end if;
  set constraints public.category_sibling_name_unique,public.category_parent_active deferred;
  for r in select value from jsonb_array_elements(v_plan) loop
    if not (r->>'change')::boolean then continue; end if;
    v_parent_key:=r->>'parent';
    v_parent:=case when v_parent_key like 'new:%' then (v_ids->>v_parent_key)::uuid else v_parent_key::uuid end;
    if r->>'id' is null then
      insert into public.product_categories(parent_category_id,category_name,display_order,is_active)
      values(v_parent,private.category_trim_name(r->>'category_name'),(r->>'display_order')::integer,(r->>'is_active')::boolean) returning id into v_id;
      v_ids:=v_ids||jsonb_build_object(r->>'key',v_id);
      v_added:=v_added+1;
    else
      update public.product_categories set parent_category_id=v_parent,category_name=private.category_trim_name(r->>'category_name'),display_order=(r->>'display_order')::integer,is_active=(r->>'is_active')::boolean where id=(r->>'id')::uuid;
      if not found then raise exception 'category_conflict' using errcode='40001'; end if;
      v_updated:=v_updated+1;
    end if;
  end loop;
  set constraints public.category_sibling_name_unique,public.category_parent_active immediate;
  return jsonb_build_object('added',v_added,'updated',v_updated);
end;
$$;
commit;
-- Rollback (review/apply separately):
-- alter table public.product_categories drop constraint category_max_two_levels;
-- Restore save_category_batch from 20261026040515_category_master_atomic_csv.sql
-- using CREATE OR REPLACE FUNCTION (preserves owner/ACL) in the same rollback transaction.
