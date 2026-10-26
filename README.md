# trAIl — 졸업까지 따라가는 길

경북대 인공지능전공 신입생을 위한 졸업요건 대시보드 · AI 수강 로드맵 (2026 AI:CRAFT 해커톤).

## 실행

```bash
pip install -e ".[dev]"
cd frontend && npm install && cd ..
```

**개발** — 터미널 두 개

```bash
uvicorn backend.app:app --reload        # API: http://127.0.0.1:8000
cd frontend && npm run dev              # 화면: http://localhost:5173 (/api 는 8000으로 프록시)
```

**배포 형태로 한 번에** — 빌드한 화면을 FastAPI가 같이 제공

```bash
cd frontend && npm run build && cd ..
uvicorn backend.app:app                 # http://127.0.0.1:8000
```

## 성적표·시간표 가져오기

- **텍스트 붙여넣기 / 글자가 있는 PDF**: 규칙 기반(`engine/importer.py`)으로 인식 — API 키 없이 동작
  (과목 코드 → 이름 일치 → 이름 포함 → 비슷한 이름 순으로 매칭, 학기 제목 줄 인식, 시간표 중복 제거)
- **사진(시간표 캡처)·스캔 PDF**: Claude(`engine/ai_extract.py`, claude-opus-5)가 과목명·성적을 원문 그대로 추출 →
  같은 규칙 매칭을 거쳐야 교육과정 과목으로 인정. 서버에 API 키가 있을 때만 켜진다:

  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...      # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
  ```

  Claude Pro 구독과 API 사용료는 별개 — 키는 console.anthropic.com 에서 발급.
- 어느 경우든 미리보기에서 확인·수정한 뒤 추가된다. 자료는 저장하지 않는다(AI 인식 시 Anthropic API로 전송).

## 다전공 (복수·융합·부·연계전공)

화면의 '내 조건 → 다전공'에서 최대 3개까지 고른다. 학번별 전교 학과·융합전공 교육과정(`data/programs/<학번>.json`)으로 계산한다.

| 종류 | 필요 학점 | 필수 과목 | 근거 |
|---|---|---|---|
| 복수전공 | 그 학과의 '다전공 시 이수학점' (입학 학번 기준표) | 그 학과 전공필수 | 이수지침 제23조, 전공학점 기준표 |
| 융합전공 | 36학점 이상 (융합전공별 기준이 더 많으면 그 값 — 주관학과 확인) | 전공필수 표시 과목 | 이수지침 제23조, 학사안내 '융합전공' |
| 연계전공 | 기준표 값 (없으면 학생이 입력) | 전공필수 | 이수지침 제23조 |
| 부전공 | 24학점 (2023학번부터, 2022학번까지는 21) | 부전공필수 표시 과목 | 학사안내 '부전공' |

- 융합전공은 학교 공식 목록(`data/rules/convergence.json`, 23개)에 있는 것만 정식으로 고를 수 있다. 이름에 '융합'이 있어도
  학과이거나(ICT융합학과), 과목은 융합전공 구분인데 선발 공고에 없는 과정(폐지·마이크로디그리 등)은 '기존 이수자용'으로 따로 표시.
  학번과 무관하게 신청할 수 있어서 입학 뒤 신설된 융합전공(예: 2026 피지컬AI)도 예전 학번 목록에 나온다. **학기마다 선발 공고와 대조해 갱신**
- 융합전공 학점이 모자라면 주전공 요건을 다 채워도 졸업 불가(포기하면 가능). 복수·부전공은 미완성 시 일반선택으로 인정
- 다전공을 하면 인공지능전공은 **61학점**(부전공 1개만이면 73학점) 기준 — 편입생·교직과정 이수자도 61학점
- **한 과목은 한 전공에만 인정**: 필수 과목은 그 전공으로, 겹치는 나머지는 학점이 더 부족한 쪽으로 자동 배정.
  과목 목록에서 '어느 전공에 인정할지' 직접 바꿀 수 있다 (교양 과목은 직접 지정할 때만 다전공으로 옮김)
- 기준표에서 이수학점을 못 찾은 학과는 '필요 학점'을 학생이 입력 (`python scripts/check_rules.py`로 목록 확인)
- 허용 학과는 학사안내 기준: 의·치·수의·간호·약학·모바일공학·치위생·산업기계는 목록에서 제외,
  예술대학·글로벌인재학부·농산업학과는 부전공만, 사범대학은 교직과정 이수자만 복수전공
- 학과가 따로 정한 전공필수 대체·면제는 반영되지 않는다 → 최종 확인은 그 학과 사무실

## 수강신청 연습 (시뮬레이션)

대시보드 오른쪽 위 [수강신청 연습] 또는 `/#/sim`. 경북대 수강신청 화면(sugang.knu.ac.kr)의 배치·흐름을 본뜬 **연습용**이다.

- 화면 맨 위 고정 경고 띠, '연습' 워터마크, '수강신청 연습' 제목으로 실제 사이트가 아님을 항상 표시
- **학번·ID·비밀번호 칸은 일부러 만들지 않았다** (실제 로그인 화면으로 오인·악용되지 않게). 학교 로고도 쓰지 않음
- 강좌번호 11자리 입력 → 자동입력방지문자 → [확인] → [신청], 수강꾸러미 → 일괄신청, 접속 대기열, 20분 화면 유지, 꾸러미 500회 클릭 제한
- 개설 강좌는 실제 데이터(`data/timetable/<연도>-<학기>.json`, `scripts/fetch_timetable.py`). 다른 학생들의 신청은
  수집 시점의 신청·꾸러미 인원으로 흉내 낸 근사(`frontend/src/sim/engine.js`) — 실제 서버 동작이 아님
- 회차별 시작 시각(신입생 10:00/11:00, 재학생 소속 학과 전공 14:00, 타 학과 전공 15:00, 교양 16:00 — 2026-2 안내 기준).
  늦은 회차를 고르면 앞 회차에 열린 인기 과목은 이미 마감된 상태. 표에 없는 경우(신입생의 2학년 이상 과목 등)는 15:00으로 추정
- 빈자리: 마감된 분반은 30~90초마다 무작위 시점에 2.5초 동안 1자리가 열림 (여석 매매 방지 규칙을 본뜬 근사)
- 수강정정: 메모 과목(+인공지능전공 과목)으로 신청이 끝난 상태에서 시작, 빈자리가 더 자주 열림. 꽉 찬 강좌를 지우면 확인창
- 수강 제한 분반: 강좌 비고의 '본교생 수강 불가', '○○ 재학생들만 신청 가능', '○○ 학생 수강불가', '[수강 대상] …',
  '○○융합전공 대상강좌'를 인공지능전공 학생 기준으로 판정 (`restrictionOf`). 그 밖의 비고는 보여 주기만 함
- 내 희망 강좌 메모: 대시보드에서 그 학기 '수강 예정'으로 넣은 과목의 분반·경쟁률. 메모·최고 기록은 브라우저에만 저장
- 신청가능학점: 졸업 133학점 → 20학점(+3 조건). 결과는 시간표로 보여주고 '수강 예정'으로 대시보드에 넣을 수 있음
- 오류 문구는 공개 자료에 없어 연습용 문구를 씀

## 모바일 점검

```bash
python scripts/mobile_check.py out/     # 390x844 터치로 대시보드·수강신청 연습을 눌러 보고 가로 넘침·오류 검사 (실패 시 exit 1)
```

## 구조

```
backend/app.py        FastAPI — /api/meta, /api/programs, /api/catalog, /api/standard-plan, /api/evaluate, /api/import/{text,file}
engine/               졸업요건 계산 엔진 (catalog: 과목 분류, rules: 규칙 로더, graduation: 계산,
                      importer: 텍스트 과목 인식, ai_extract: 사진·PDF AI 추출)
frontend/             React + Vite 대시보드
data/curriculum/      학번별 전공 교육과정 (knuin 공개 API)
data/liberal_arts/    연도별 교양(첨성인) 교육과정
data/timetable/       학기별 개설 강좌 (수강신청 연습용)
data/programs/        학번별 다전공 대상 학과·융합·연계전공 교육과정 + 다전공 이수학점
data/rules/           졸업요건 규칙 (학번별, 근거 출처 포함), relative_grading/ 학기별 상대평가 권장 과목
data/sources/         학교 공식 기준 원문 텍스트
scripts/              데이터 수집·검사 스크립트
tests/                pytest
```

## 데이터 갱신

```bash
python scripts/fetch_curriculum.py      # 학번별 전공 교육과정
python scripts/fetch_liberal_arts.py    # 교양 교육과정
python scripts/fetch_programs.py        # 다전공용 전교 학과·융합전공 교육과정 (knuin 전체 조회)
python scripts/fetch_timetable.py 2027 1  # 수강신청 연습용 개설 강좌 (학기마다)
python scripts/check_rules.py           # 규칙 ↔ 데이터 정합성 검사
pytest
```

2027학번 교육과정·졸업요건은 아직 확정 전이다(`graduation.json`의 `provisional`). 2027년 2월 전후로 다시 수집할 것.

### 상대평가 권장 과목 (A 최대 50%) — 학기마다

학사과가 학기마다 '3학년 이상 개설 전공과목 성적 평가방법 변경 지정 내역' 엑셀을 공지한다. 새 공지가 나오면:

```bash
python scripts/fetch_timetable.py 2027 1                  # 그 학기 개설 강좌 (분반·개설학과 대조용, 먼저)
python scripts/import_relative_grading.py <받은 엑셀>      # 학기·작성 기준일은 엑셀 제목에서 읽음
pytest
```

`data/rules/relative_grading/<학기>.json`이 학기별로 쌓이고, 원본은 `data/sources/knu_<학기>_relative_grading.xlsx`로 보관된다.
화면은 과목을 들을 학기의 목록을 쓰고, 그 학기 목록이 아직 없으면 같은 학기(1·2학기)의 가장 최근 목록으로 보여 준다 (목록에는 그 학기에 열리는 과목만 있어서).

## 로그인 (카카오·Google, Supabase)

`frontend/.env.local`에 Supabase 주소·공개 키가 있으면 **로그인해야 쓸 수 있고**, 데이터는 계정별로 저장된다.
비워 두면 지금처럼 로그인 없이 이 브라우저에만 저장하는 개발 모드다(`scripts/mobile_check.py`도 이 모드로 돈다).

1. supabase.com에서 프로젝트 만들기(무료) → **SQL Editor**에 `supabase/schema.sql` 붙여넣고 실행
2. **Project Settings > API**의 Project URL·anon public 키 → `frontend/.env.example`을 `.env.local`로 복사해 채우기
3. **Authentication > URL Configuration**: Site URL과 Redirect URLs에 `http://localhost:5173`, 배포 주소 추가
4. **Authentication > Providers**
   - Google: Google Cloud Console에서 OAuth 클라이언트(웹) 만들고, 승인된 리디렉션 URI에
     `https://<프로젝트>.supabase.co/auth/v1/callback` → Client ID·Secret 입력
   - Kakao (2026-10 개편된 콘솔 기준, developers.kakao.com → 앱 관리 페이지):
     - [앱] > [플랫폼 키] > [REST API 키]: **카카오 로그인 리다이렉트 URI**에 위 callback 주소,
       같은 화면의 REST API 키 = Client ID, **클라이언트 시크릿** = Client Secret
     - [카카오 로그인] > [사용 설정] 상태 ON
     - [카카오 로그인] > [동의항목]: 닉네임 필수, 프로필 사진 선택, **카카오계정(이메일) 선택 동의**
       - Supabase는 카카오에 `account_email profile_image profile_nickname`을 항상 요청한다(화면에서 뺄 수 없음).
         세 항목 중 하나라도 설정하지 않으면 **KOE205 (설정하지 않은 동의항목)** 오류가 난다
       - 이메일 동의항목은 비즈 앱에서만 켤 수 있다 → **개인 개발자 비즈 앱**으로 전환(본인 인증)
       - 이메일 제공을 거절한 사용자도 가입되게 Supabase Kakao 설정에서 **Allow users without an email**을 켠다
     - 사이트 도메인(JavaScript SDK 도메인)은 필요 없다 (카카오 JS SDK를 쓰지 않음)

구조: 로그인·저장은 화면이 Supabase에 직접 한다(`frontend/src/auth.js`, `AuthGate.jsx`). 표 `user_state`에
사용자당 한 줄(JSON)로 저장하고, 행 단위 보안(RLS)으로 본인 줄만 읽고 쓸 수 있다. FastAPI는 계산만 하고 저장하지 않는다.
처음 로그인하면 그 브라우저에 남아 있던 예전 데이터를 계정으로 옮긴다. 계정 메뉴에서 로그아웃·회원 탈퇴.

## 공지 · 업데이트 (관리자)

화면 `#/notices`(로그인 없이 열림)와 홈 위 최신 소식 줄은 Supabase 표 `notices`에서 읽는다.

- 처음 한 번: Supabase **SQL Editor**에 `supabase/notices.sql` 붙여넣고 실행 (표·읽기 권한·지금까지의 소식)
- 글쓰기·수정: 대시보드 **Table Editor → notices → Insert row** (수정은 칸을 눌러 고친다). 저장하면 바로 반영, 배포 필요 없음
  - `date` 날짜, `kind` `notice`(공지) / `update`(업데이트), `title` 제목
  - `body` 내용 — **한 줄에 한 항목** (줄마다 글머리표로 보인다)
  - `link_href`·`link_label` (선택) 아래 링크, 예: `#/privacy` / `개인정보 처리 안내 보기`
  - `published` 끄면 숨김, `sort` 같은 날 글 순서 (큰 값이 위)
- 사이트는 표를 읽을 수 없으면(로컬 모드·연결 실패·표 비어 있음) `frontend/src/Notices.jsx`의 기본 목록을 보여 준다
- 쓰기 권한은 대시보드에만 있다 (공개 키로는 읽기만). 새 소식이 올라오면 홈 소식 줄에 NEW 표시

## 개인정보

로그인 모드: 입력한 과목·성적은 Supabase(`user_state`)에 계정별로 저장되고 본인만 볼 수 있다.
개발 모드: 브라우저(localStorage)에만 저장된다. 어느 경우든 FastAPI 서버는 요청마다 계산만 하고 저장하지 않는다.
학교 포털 아이디·비밀번호는 받지 않는다.

**동의**: 로그인 화면에서 개인정보 수집·이용 동의(필수 체크)를 받아야 로그인 버튼이 켜지고, 동의 기록(버전·시각)은
계정 데이터의 `consent`에 남는다. 안내 전문은 `#/privacy`(로그인 없이 열림, `frontend/src/Privacy.jsx`).
문구를 바꾸면 `PRIVACY_VERSION`을 올린다 → 기존 사용자도 다음 접속 때 다시 동의 화면이 나온다.
배포 전 `Privacy.jsx`의 `OFFICER`(개인정보 보호책임자 이름·연락처)를 채울 것.
**회원 탈퇴**: 계정 메뉴 → `delete_my_account()`(schema.sql)가 계정과 데이터를 함께 지운다.
