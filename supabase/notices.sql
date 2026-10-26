-- trAIl 공지·업데이트 — Supabase 대시보드 > SQL Editor 에 붙여넣고 한 번 실행 (다시 실행해도 안전)
-- 글쓰기·수정은 대시보드 > Table Editor > notices 에서 한다:
--   date  날짜 (예: 2026-10-27)          kind  notice(공지) / update(업데이트)
--   title 제목                           body  내용 — 한 줄에 한 항목 (줄마다 글머리표로 보임)
--   link_href / link_label  (선택) 아래 링크 주소·문구, 예: #/privacy / 개인정보 처리 안내 보기
--   published  끄면(false) 사이트에서 숨김
-- 같은 날 글이 여러 개면 sort 가 큰 글이 위로 (비워 두면 쓴 순서)

create table if not exists public.notices (
  id          bigint generated always as identity primary key,
  date        date not null default current_date,
  kind        text not null default 'notice' check (kind in ('notice', 'update')),
  title       text not null,
  body        text not null default '',
  link_href   text,
  link_label  text,
  published   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- Data API 권한: 누구나(로그인 전 포함) 읽기만. 쓰기는 대시보드(관리자)에서만
revoke all on table public.notices from anon, authenticated;
grant select on table public.notices to anon, authenticated;

alter table public.notices enable row level security;
drop policy if exists "published notices: read" on public.notices;
create policy "published notices: read" on public.notices for select to anon, authenticated using (published);

-- 지금까지의 소식 (표가 비어 있을 때만 넣는다)
insert into public.notices (date, kind, title, body, link_href, link_label, sort)
select * from (values
  (date '2026-10-20', 'update', 'trAIl 첫 공개', $$경북대 인공지능전공 졸업요건 대시보드: 들은 과목을 넣으면 남은 요건을 계산해요.
복수·융합·부·연계전공을 함께 계산해요.
수강신청 연습(시뮬레이션)을 해 볼 수 있어요.$$, null, null, 0),
  (date '2026-10-22', 'update', '졸업 로드맵·성적 통계·학사일정 추가', $$남은 졸업요건을 채우는 학기별 수강 계획(졸업 로드맵)을 짜 줘요.
졸업 시뮬레이션: 조건을 바꿔 보고 마음에 들면 적용할 수 있어요.
성적 통계(4.3 만점), 학사일정 D-day, 오늘의 AI 뉴스와 퀴즈를 넣었어요.
상대평가 권장 과목(A 최대 50%)을 표시해요.
성적증명서 PDF로 들은 과목을 한 번에 가져올 수 있어요.$$, null, null, 0),
  (date '2026-10-23', 'notice', '개인정보 처리 안내가 바뀌었어요', $$개인정보 보호책임자와 연락처, 데이터를 보관하는 서버 위치를 안내에 추가했어요.
기존 회원은 다음 접속 때 한 번 다시 동의해 주세요.$$, '#/privacy', '개인정보 처리 안내 보기', 0),
  (date '2026-10-23', 'update', '카카오·Google 로그인과 회원가입', $$카카오·Google 계정으로 가입하고, 내 과목·성적이 계정에 저장돼요.
수강신청 연습을 폰 화면에 맞게 정리했어요.
학사모 다람쥐 캐릭터가 곳곳에서 안내해 줘요.
카카오톡으로 링크를 공유하면 미리보기 그림이 떠요.$$, null, null, 1),
  (date '2026-10-27', 'notice', 'trAIl 이용 안내', $$졸업요건 계산은 학교·학과 공식 기준을 바탕으로 하지만 참고용이에요. 최종 확인은 학과 사무실에서 해 주세요.
무료 서버를 쓰고 있어서, 한동안 아무도 접속하지 않으면 첫 화면이 열리기까지 30초~1분 걸릴 수 있어요.
틀린 계산이나 불편한 점은 개인정보 처리 안내에 적힌 연락처로 알려 주세요.$$, null, null, 0),
  (date '2026-10-27', 'update', '졸업 로드맵이 산길 지도로 바뀌었어요', $$학기마다 쌓은 누적 학점이 산의 높이가 되는 산길 지도를 그려요. 길 위의 학기를 누르면 그 학기 카드로 가요.
융합·복수전공 등 다전공은 아래에 두 번째 길로 따로 보여 줘요.
학기별 짐 꾸러미: 지난 학기까지 학기마다 과목 구성을 카드로 보여 줘요.
재수강한 과목은 재수강 전·후 학기에 모두 보이고, 누적 학점에는 한 번만 들어가요.
학생상담지도교수 상담 횟수를 홈에서 바로 입력하고 고칠 수 있어요.
어느 화면에서든 trAIl 로고를 누르면 홈으로 돌아와요.
폰에서는 오늘의 뉴스·퀴즈가 맨 아래로 내려가고, 홈 버튼 크기를 맞췄어요.$$, null, null, 1)
) as v(date, kind, title, body, link_href, link_label, sort)
where not exists (select 1 from public.notices);
