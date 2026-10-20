-- trAIl 사용자별 데이터 — Supabase 대시보드 > SQL Editor 에 붙여넣고 한 번 실행
-- 한 사용자당 한 줄: 화면 상태 전체(학번·과목·성적·다전공·수강신청 연습 기록)를 JSON으로 저장

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Data API 권한: 'Automatically expose new tables'를 꺼 두었으므로 직접 준다. 로그인 안 한 사용자(anon)는 접근 불가
revoke all on table public.user_state from anon;
grant select, insert, update, delete on table public.user_state to authenticated;

-- 행 단위 보안: 로그인한 본인 줄만 읽고 쓸 수 있다 (공개 키로 접속해도 남의 성적은 안 보임)
alter table public.user_state enable row level security;

drop policy if exists "own row: select" on public.user_state;
drop policy if exists "own row: insert" on public.user_state;
drop policy if exists "own row: update" on public.user_state;
drop policy if exists "own row: delete" on public.user_state;

create policy "own row: select" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.user_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row: delete" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);

-- 회원 탈퇴: 로그인한 본인 계정을 지운다 → on delete cascade로 user_state 줄도 함께 삭제
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
