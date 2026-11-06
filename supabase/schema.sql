-- Radar Opus cloud sync: one table of patient and consultation records per signed-in user.
-- Run once in the Supabase SQL editor (safe to run again).

create table if not exists public.case_records (
  owner      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('patient', 'consultation')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner, kind, id)
);

create index if not exists case_records_owner_updated on public.case_records (owner, updated_at);

-- The server stamps every write, so pulls can ask for "everything after my last updated_at".
create or replace function public.case_records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists case_records_touch on public.case_records;
create trigger case_records_touch before insert or update on public.case_records
  for each row execute function public.case_records_touch();

-- Each user sees and writes only their own rows.
alter table public.case_records enable row level security;

drop policy if exists "own rows: select" on public.case_records;
drop policy if exists "own rows: insert" on public.case_records;
drop policy if exists "own rows: update" on public.case_records;
drop policy if exists "own rows: delete" on public.case_records;
create policy "own rows: select" on public.case_records for select to authenticated using (owner = (select auth.uid()));
create policy "own rows: insert" on public.case_records for insert to authenticated with check (owner = (select auth.uid()));
create policy "own rows: update" on public.case_records for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "own rows: delete" on public.case_records for delete to authenticated using (owner = (select auth.uid()));

grant select, insert, update, delete on public.case_records to authenticated;
