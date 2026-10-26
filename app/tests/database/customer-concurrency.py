"""Local PostgreSQL 17 concurrency tests. Synthetic data, no network, no published ports."""
import subprocess, pathlib, concurrent.futures, time, json
ROOT=pathlib.Path(__file__).resolve().parents[3]
NAME='customer-workflow-concurrency'
IMAGE='postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe'
def docker(*args,**kwargs):return subprocess.run(['docker',*args],text=True,capture_output=True,timeout=30,**kwargs)
def sql(statement,check=True):
 p=docker('exec','-i',NAME,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At',input=statement)
 if check and p.returncode:raise AssertionError(p.stderr)
 return p
uid=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
actor=f"set role authenticated;select set_config('request.jwt.claim.sub','{uid(1)}',false);"
def batch(name,request):
 row={'store_id':uid(10),'name':name,'name_kana':'','phone':'','membership_card_number':'','approved_duplicate_ids':[]}
 return "select insert_customer_csv('%s','%s'::jsonb);"%(uid(request),json.dumps([row]))
def batch_full(name,request):
 row={'store_id':uid(10),'name':name,'name_kana':'','phone':'','membership_card_number':'','approved_duplicate_ids':[], 'birth_date':'','gender':'unspecified','occupation':'DEMO','postal_code':'000-0000','address':'FAKE','dm_allowed':'false','identification_type':'マイナンバーカード','identification_number':''}
 return "select insert_customer_csv_v2('%s','%s'::jsonb);"%(uid(request),json.dumps([row]))
def race(first,second,expect_error=None):
 with concurrent.futures.ThreadPoolExecutor() as pool:
  future=pool.submit(sql,'begin;'+actor+first+'select pg_sleep(1);commit;',False)
  for _ in range(60):
   if sql("select count(*) from pg_locks where locktype='advisory' and objid=73620491 and granted;").stdout.strip()=='1':break
   time.sleep(.02)
  else:raise AssertionError('first writer did not acquire lock')
  other=sql(actor+second,False);initial=future.result()
 assert initial.returncode==0,initial.stderr
 if expect_error:assert other.returncode!=0 and expect_error in other.stderr,other.stderr
 else:assert other.returncode==0,other.stderr
try:
 result=docker('run','--detach','--rm','--name',NAME,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE)
 if result.returncode:raise RuntimeError(result.stderr)
 for _ in range(60):
  if 'PostgreSQL init process complete' in docker('logs',NAME).stdout and docker('exec',NAME,'pg_isready','-U','postgres').returncode==0:break
  time.sleep(.1)
 sql("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;grant usage on schema storage to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;")
 for f in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(f.read_text())
 sql(f"insert into stores(id,code,name)values('{uid(10)}','A','FAKE');insert into auth.users values('{uid(1)}','fake@example.test');update profiles set role='admin',is_active=true where id='{uid(1)}';")
 race(batch('SAME-REQUEST',90),batch('SAME-REQUEST',90))
 assert sql("select count(*) from customers where name='SAME-REQUEST';").stdout.strip()=='1'
 print('PASS concurrent retry same request creates one customer')
 race(batch('SAME-PERSON',91),batch('SAME-PERSON',92),'Candidates changed')
 assert sql("select count(*) from customers where name='SAME-PERSON';").stdout.strip()=='1'
 print('PASS concurrent distinct requests recheck new duplicate candidate')
 race(f"insert into customers(store_id,name)values('{uid(10)}','DIRECT');",batch('DIRECT',93),'Candidates changed')
 print('PASS concurrent ordinary insert protected by same write guard')
 sql(f"insert into customers(id,store_id,name)values('{uid(20)}','{uid(10)}','BEFORE');")
 race(f"update customers set name='AFTER' where id='{uid(20)}';",batch('AFTER',94),'Candidates changed')
 print('PASS concurrent ordinary update rechecked')
 race(f"update customers set memo='ADMIN' where id='{uid(20)}';",f"insert into purchase_transactions(customer_id,store_id,visit_datetime,transaction_status)values('{uid(20)}','{uid(10)}',now(),'completed');")
 print('PASS visit refresh and customer update use consistent lock order')
 r=sql('begin isolation level repeatable read;'+actor+batch('RR',95)+'commit;',False)
 assert 'Unsupported isolation' in r.stderr,r.stderr
 print('PASS repeatable-read import rejected; no live data tested')
 race(batch_full('V2-RETRY',100),batch_full('V2-RETRY',100))
 assert sql("select count(*) from customers where name='V2-RETRY';").stdout.strip()=='1'
 print('PASS v2 concurrent identical retry remains insert-once')
 race(batch_full('V2-PERSON',101),batch_full('V2-PERSON',102),'Candidates changed')
 race(batch('MIXED',103),batch_full('MIXED',104),'Candidates changed')
 print('PASS v2 and legacy share duplicate serialization, no silent overwrite')
finally:docker('stop',NAME)
