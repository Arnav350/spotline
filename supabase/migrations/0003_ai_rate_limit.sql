-- Table
create table if not exists ai_generations (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) not null,
  created_at timestamptz default now() not null
);

alter table ai_generations enable row level security;

-- Policies
drop policy if exists "Users can view own" on ai_generations;
create policy "Users can view own" on ai_generations
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own" on ai_generations;
create policy "Users can insert own" on ai_generations
  for insert with check (auth.uid() = user_id);

-- Index
create index if not exists ai_generations_user_created_idx on ai_generations (user_id, created_at);

-- Atomic rate limit RPC: acquires per-user advisory lock, checks count, inserts if allowed.
-- Returns -1 if limit exceeded, otherwise returns remaining count after this generation.
create or replace function try_log_ai_generation(p_limit int)
returns int
language plpgsql
as $$
declare
  v_used int;
  v_lock bigint;
begin
  v_lock := ('x' || substr(md5(auth.uid()::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select count(*) into v_used
  from ai_generations
  where user_id = auth.uid()
    and created_at >= now() - interval '7 days';

  if v_used >= p_limit then
    return -1;
  end if;

  insert into ai_generations (user_id) values (auth.uid());
  return p_limit - v_used - 1;
end;
$$;
