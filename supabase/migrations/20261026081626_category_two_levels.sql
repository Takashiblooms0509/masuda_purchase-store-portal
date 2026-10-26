-- Two-level category master. No row rewriting and no permission/RPC changes.
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
commit;
-- Rollback (review/apply separately):
-- alter table public.product_categories drop constraint category_max_two_levels;
