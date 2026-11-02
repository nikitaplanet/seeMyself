-- =============================================================================
-- 會員命盤：public.charts
--
-- 每位登入的使用者可儲存多筆命盤：
--   kind = 'self'   我的命盤（自己的，可多筆，例如不確定出生時間時存幾個版本）
--   kind = 'friend' 好友命盤（使用者自行輸入朋友的出生資料；朋友不需要帳號，這不是社交關係）
--
-- `input` 存的是送到 POST /api/chart 的完整 BirthInput（src/lib/api/chartSchema.ts），開啟命盤時
-- 原樣重送即可重算出完全相同的結果（含 nodeMode、sensitivityMinutes、disambiguation）。
-- birth_date / birth_time / time_unknown / timezone / place_label 與 hd_type / profile / authority
-- 是列表顯示用的反正規化欄位，由前端在儲存時一併寫入。
--
-- 存取控制：只有 authenticated 角色可讀寫，且 RLS 限制為 auth.uid() = user_id；anon 沒有任何權限。
--
-- 可重複執行（idempotent-ish）：表與索引用 IF NOT EXISTS，函式 CREATE OR REPLACE，
-- trigger 與 policy 先 DROP IF EXISTS 再建立。若表已存在，欄位變更不會自動套用。
--
-- 執行方式：Supabase Dashboard → SQL Editor 貼上整份執行，或 `supabase db push`。
-- =============================================================================

create table if not exists public.charts (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text        not null check (kind in ('self', 'friend')),
  name          text        not null check (char_length(btrim(name)) between 1 and 60),
  note          text                 check (note is null or char_length(note) <= 500),

  -- 完整、已通過驗證的出生資料（BirthInput JSON）
  input         jsonb       not null check (
                              jsonb_typeof(input) = 'object'
                              and input ? 'date' and input ? 'time' and input ? 'timezone'
                              and pg_column_size(input) <= 4096
                            ),

  -- 反正規化的出生資料（列表顯示 / 排序用）
  birth_date    date        not null,
  birth_time    time,                                   -- 出生時間不確定時為 NULL
  time_unknown  boolean     not null default false,
  timezone      text        not null check (char_length(timezone) between 1 and 64),
  place_label   text                 check (place_label is null or char_length(place_label) <= 200),

  -- 命盤摘要（列表顯示用；enum key，例如 'generator' / '4/6' / 'sacral'）
  hd_type       text                 check (hd_type is null or char_length(hd_type) <= 32),
  profile       text                 check (profile is null or profile ~ '^[1-6]/[1-6]$'),
  authority     text                 check (authority is null or char_length(authority) <= 32),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint charts_time_unknown_consistent check (time_unknown or birth_time is not null)
);

comment on table public.charts is '使用者儲存的人類圖命盤（我的 / 好友）。僅本人可存取（RLS）。';
comment on column public.charts.input is '送到 POST /api/chart 的 BirthInput，重新開啟時原樣重送。';

-- 列表查詢：WHERE user_id = ? AND kind = ? ORDER BY created_at DESC
create index if not exists charts_user_kind_created_idx
  on public.charts (user_id, kind, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at 自動更新
-- -----------------------------------------------------------------------------
create or replace function public.charts_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists charts_set_updated_at on public.charts;
create trigger charts_set_updated_at
  before update on public.charts
  for each row execute function public.charts_set_updated_at();

-- -----------------------------------------------------------------------------
-- 權限：anon 完全沒有權限；authenticated 可 CRUD，但受下方 RLS 限制
-- -----------------------------------------------------------------------------
revoke all on table public.charts from anon;
revoke all on table public.charts from public;
grant select, insert, update, delete on table public.charts to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security：只能存取自己的列。使用 (select auth.uid()) 讓 Postgres 每個查詢只算一次。
-- -----------------------------------------------------------------------------
alter table public.charts enable row level security;

drop policy if exists "charts_select_own" on public.charts;
create policy "charts_select_own" on public.charts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "charts_insert_own" on public.charts;
create policy "charts_insert_own" on public.charts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "charts_update_own" on public.charts;
create policy "charts_update_own" on public.charts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "charts_delete_own" on public.charts;
create policy "charts_delete_own" on public.charts
  for delete to authenticated
  using ((select auth.uid()) = user_id);
