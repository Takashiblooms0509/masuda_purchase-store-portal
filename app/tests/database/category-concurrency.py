"""Local-only real PostgreSQL concurrency regression. No network ports or production credentials.
Usage: python app/tests/database/category-concurrency.py
Requires Docker and the pinned official postgres image (pull separately if absent).
"""
import subprocess, pathlib, concurrent.futures, time, json
ROOT = pathlib.Path(__file__).resolve().parents[3]
IMAGE = 'postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe'
name = 'category-csv-concurrency'
def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], text=True, capture_output=True, timeout=30, **kwargs)
def sql(text, check=True):
    p = docker('exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', input=text)
    if check and p.returncode: raise AssertionError(p.stderr)
    return p
uid = '00000000-0000-4000-8000-000000000001'
a = '00000000-0000-4000-8000-000000000010'
b = '00000000-0000-4000-8000-000000000011'
actor = f"set role authenticated;select set_config('request.jwt.claim.sub','{uid}',false);"
def race(first, second, expected):
    # Wait until transaction A holds the actual advisory lock, rather than relying on launch timing.
    sql('truncate public.product_categories cascade;'+f"insert into public.product_categories(id,category_name)values('{a}','A'),('{b}','B');")
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(sql, 'begin;'+actor+first+"select pg_sleep(1);commit;", False)
        for _ in range(50):
            if sql("select count(*) from pg_locks where locktype='advisory' and objid=20461001 and granted;").stdout.strip() == '1': break
            time.sleep(.02)
        else: raise AssertionError('transaction A did not acquire category lock')
        other = sql(actor+second, False)
        first_result = future.result()
    assert first_result.returncode == 0, first_result.stderr
    assert other.returncode != 0 and expected in other.stderr, other.stderr
    bad = sql("select count(*) from public.product_categories c join public.product_categories p on p.id=c.parent_category_id where (c.is_active and not p.is_active) or c.category_level<>p.category_level+1;").stdout.strip()
    assert bad == '0', bad
    print('PASS', expected)
try:
    p=docker('run','--detach','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE)
    if p.returncode: raise RuntimeError(p.stderr)
    for _ in range(60):
        if docker('exec',name,'pg_isready','-U','postgres').returncode==0: break
        time.sleep(.1)
    sql("create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;")
    for f in ['202610010001_phase1_auth_stores.sql','202610010002_phase2_business.sql','20261026040515_category_master_atomic_csv.sql','20261026081626_category_two_levels.sql']:
        sql((ROOT/'supabase/migrations'/f).read_text())
    sql(f"insert into auth.users values('{uid}','test@example.test');update public.profiles set role='admin',is_active=true where id='{uid}';")
    race(f"update public.product_categories set is_active=false where id='{a}';", f"insert into public.product_categories(parent_category_id,category_name)values('{a}','child');", 'category_active_child')
    race("insert into public.product_categories(category_name)values('same');", "insert into public.product_categories(category_name)values('same');", 'category_sibling_name_unique')
    race(f"update public.product_categories set parent_category_id='{b}' where id='{a}';", f"update public.product_categories set parent_category_id='{a}' where id='{b}';", 'Category cycle')
    race(f"update public.product_categories set parent_category_id='{b}' where id='{a}';", f"insert into public.product_categories(parent_category_id,category_name)values('{a}','grandchild');", 'category_max_two_levels')
    sql('truncate public.product_categories cascade;'+f"insert into public.product_categories(id,category_name)values('{a}','A');")
    revision=sql(f"select updated_at::text from public.product_categories where id='{a}';").stdout.strip()
    row={'id':a,'new_key':None,'parent_id':None,'parent_new_key':None,'category_name':'A','display_order':1,'is_active':True,'updated_at':revision}
    payload=json.dumps([row]).replace("'","''")
    statement=f"select public.save_category_batch('{payload}'::jsonb);"
    # Both writers use the same original revision; only one can commit.
    with concurrent.futures.ThreadPoolExecutor() as pool:
        results=list(pool.map(lambda _:sql(actor+statement,False),range(2)))
    assert sum(r.returncode==0 for r in results)==1
    assert any('category_conflict' in r.stderr for r in results)
    print('PASS concurrent CSV timestamp conflict')
    r=sql('begin isolation level repeatable read;'+actor+"insert into public.product_categories(category_name)values('RR');commit;",False)
    assert 'category_repeatable_read_unsupported' in r.stderr
    print('PASS repeatable-read write rejected; all tests use synthetic data')
finally:
    docker('stop',name)
