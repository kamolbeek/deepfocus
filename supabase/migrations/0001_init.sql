-- DeepFokus: foydalanuvchi profili, vazifalar va fokus sessiyalari.
-- Har bir qatorni faqat egasi ko'radi va o'zgartiradi (RLS).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 300),
  estimate int not null default 1 check (estimate between 1 and 99),
  done int not null default 0 check (done >= 0),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  ended_at timestamptz not null,
  minutes int not null check (minutes between 1 and 600),
  task_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index sessions_user_ended_idx on public.sessions (user_id, ended_at desc);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.sessions enable row level security;

create policy "profiles: o'zini ko'radi" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: o'zini yaratadi" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: o'zini yangilaydi" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "tasks: o'zinikini ko'radi" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks: o'ziga qo'shadi" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks: o'zinikini yangilaydi" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks: o'zinikini o'chiradi" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "sessions: o'zinikini ko'radi" on public.sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions: o'ziga qo'shadi" on public.sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions: o'zinikini o'chiradi" on public.sessions for delete to authenticated using ((select auth.uid()) = user_id);

-- Ro'yxatdan o'tganda profil avtomatik yaratiladi
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
