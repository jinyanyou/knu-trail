import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api.js'
import { deleteAccount, displayName, dropSignupConsent, loadUserState, saveUserState, signOut, takeSignupConsent } from './auth.js'
import { useHash } from './hash.js'
import { consentRecord, ConsentScreen, hasConsent, PRIVACY_VERSION } from './Privacy.jsx'
import Dashboard from './components/Dashboard.jsx'
import BrandMark from './components/BrandMark.jsx'
import Mascot from './components/Mascot.jsx'
import LoginShell from './components/LoginShell.jsx'
import Setup from './components/Setup.jsx'
import CourseSheet from './components/CourseSheet.jsx'
import Daily from './components/Daily.jsx'
import Roadmap from './components/Roadmap.jsx'
import { NoticeBar } from './Notices.jsx'
import Grades from './components/Grades.jsx'
import Schedule from './components/Schedule.jsx'
import SimBanner from './components/SimBanner.jsx'

// 수강신청 연습은 시간표 데이터가 커서 들어갈 때만 불러온다
const SimApp = lazy(() => import('./sim/SimApp.jsx'))

const STORAGE_KEY = 'trail:v1'
const DEFAULT_STATE = { entryYear: 2027, taken: [], profile: { programs: [] }, sim: {} }

function normalize(saved) {
  // 시작 설정 기능 전부터 쓰던 사용자(과목이 이미 있음)는 설정을 끝낸 것으로 본다
  const merged = { ...DEFAULT_STATE, setupDone: saved?.setupDone ?? (saved?.taken?.length > 0), ...saved }
  // 예전 '이수 형태' 선택값은 다전공 목록으로 대체됨
  const { major_track, ...profile } = merged.profile ?? {}
  return { ...merged, profile: { programs: [], ...profile } }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// 수강신청 연습 기록(최고 기록·메모) — 로그인 없이 쓸 때는 이 브라우저에만
const localSimStore = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`trail:sim-${key}`)) ?? fallback } catch { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem(`trail:sim-${key}`, JSON.stringify(value)) } catch { /* 저장 불가 환경 */ }
  },
}

// 로그인했으면 내 계정 데이터를, 아니면 이 브라우저 데이터를 불러온 뒤 화면을 띄운다
export default function App({ user }) {
  const [initial, setInitial] = useState(() => (user ? null : normalize(readLocal())))
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    loadUserState(user.id)
      .then(async (saved) => {
        let state = saved
        if (!state) {
          // 처음 로그인: 로그인 기능 전에 이 브라우저에 입력해 둔 데이터가 있으면 동의 후 계정으로 옮긴다
          const local = readLocal()
          const sim = { best: localSimStore.get('best', null), memo: localSimStore.get('memo', []) }
          state = { ...(local ?? {}), sim }
          // 회원가입 탭에서 동의하고 들어왔으면 그 동의로 가입을 마친다
          const signup = takeSignupConsent(PRIVACY_VERSION)
          if (signup) {
            state = { ...state, consent: signup }
            await saveUserState(user.id, state)
            clearLocal()
          }
        } else {
          dropSignupConsent() // 이미 가입한 계정 — 맡겨 둔 동의는 쓸 일이 없다
        }
        if (alive) setInitial(normalize(state))
      })
      .catch((e) => alive && setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [user])

  if (loadError) {
    return (
      <div className="app">
        <div className="banner banner-error" role="alert">내 데이터를 불러오지 못했습니다: {loadError}</div>
        <button type="button" className="btn" onClick={() => window.location.reload()}>다시 시도</button>
        <button type="button" className="btn" onClick={signOut}>로그아웃</button>
      </div>
    )
  }
  if (!initial) return <LoginShell pose="search"><p className="muted login-wait">내 데이터 불러오는 중…</p></LoginShell>
  // 동의는 계정에 한 번 기록된다 — 처음 로그인했거나 안내 내용(PRIVACY_VERSION)이 바뀌었을 때만 묻는다
  if (user && !hasConsent(initial)) {
    const agree = () => {
      const next = { ...initial, consent: consentRecord() }
      saveUserState(user.id, next)
        .then(() => {
          clearLocal()
          setInitial(next)
        })
        .catch((e) => setLoadError(e.message))
    }
    // 처음 로그인에서 거부하면 방금 만들어진 계정을 남기지 않는다. 기존 사용자(안내 변경)는 로그아웃만
    const decline = initial.consent
      ? signOut
      : () => deleteAccount().catch((e) => setLoadError(e.message))
    return <ConsentScreen mode={initial.consent ? 'updated' : 'signup'} onAgree={agree} onDecline={decline} />
  }
  return <Navi user={user} initial={initial} />
}

// 로그인한 서비스(Google·카카오)의 프로필 사진. 없거나 못 불러오면 이름 첫 글자
function Avatar({ user, size = 36 }) {
  const m = user?.user_metadata ?? {}
  const src = m.avatar_url || m.picture
  const [broken, setBroken] = useState(false)
  const initial = displayName(user).trim().charAt(0).toUpperCase() || '?'
  return src && !broken ? (
    <img className="avatar" src={src} alt="" width={size} height={size} referrerPolicy="no-referrer"
      onError={() => setBroken(true)} />
  ) : (
    <span className="avatar avatar-initial" style={{ width: size, height: size }} aria-hidden="true">{initial}</span>
  )
}

function AccountMenu({ user, saveStatus }) {
  const leave = () => {
    if (!window.confirm('회원 탈퇴하면 계정과 저장된 과목·성적·설정이 모두 삭제됩니다. 되돌릴 수 없습니다.')) return
    deleteAccount().catch((e) => window.alert(`탈퇴하지 못했습니다: ${e.message}`))
  }
  // 메뉴가 열려 있을 때 바깥을 누르거나 Esc → 닫기
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => {
      const el = ref.current
      if (!el?.open) return
      if (e.type === 'keydown' ? e.key === 'Escape' : !el.contains(e.target)) el.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  return (
    <details className="account" ref={ref}>
      <summary>
        <Avatar user={user} />
        <span className="account-name">
          <span className="account-name-text">{displayName(user)}</span>
          <small className={`save-status save-${saveStatus}`}>
            {saveStatus === 'saved' && <Mascot pose="rest" size={20} className="save-mascot" />}
            {{ saved: '저장됨', saving: '저장 중…', error: '저장 실패' }[saveStatus]}
          </small>
        </span>
      </summary>
      <div className="account-menu panel">
        <div className="account-who">
          <Avatar user={user} size={44} />
          <div>
            <p className="account-display">{displayName(user)}</p>
            <p className="account-email">{user.email}</p>
          </div>
        </div>
        <a className="btn" href="#/profile">프로필 설정</a>
        <button type="button" className="btn" onClick={signOut}>로그아웃</button>
        <button type="button" className="btn btn-danger" onClick={leave}>회원 탈퇴</button>
      </div>
    </details>
  )
}

// 계정으로 옮긴 뒤 이 브라우저에 남은 예전(로그인 기능 전) 데이터를 지운다
function clearLocal() {
  try {
    for (const k of [STORAGE_KEY, 'trail:sim-best', 'trail:sim-memo']) localStorage.removeItem(k)
  } catch { /* 저장 불가 환경 */ }
}

function Navi({ user, initial }) {
  const [state, setState] = useState(initial)
  const [saveStatus, setSaveStatus] = useState('saved')
  const hash = useHash()
  const [meta, setMeta] = useState(null)
  const [programs, setPrograms] = useState([])
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [sheet, setSheet] = useState(null) // 홈에서 연 요건 id
  // 졸업 시뮬레이션: 켜면 바꾸는 내용이 draft에만 들어가고 저장되지 않는다. '적용하기'로 계정에 반영
  const [draft, setDraft] = useState(null)
  const [baseReport, setBaseReport] = useState(null)
  const view = draft ?? state
  const { entryYear, taken, profile } = view
  const edit = (fn) => (draft ? setDraft(fn) : setState(fn))

  useEffect(() => {
    api.getMeta().then(setMeta).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let alive = true
    setPrograms([])
    api.getPrograms(entryYear).then((r) => alive && setPrograms(r.programs)).catch((e) => setError(e.message))
    return () => {
      alive = false
    }
  }, [entryYear])

  // 학과를 아직 안 골랐거나, 학번을 바꿔 그 해에 없는 학과는 계산에서 뺀다
  const chosenPrograms = useMemo(() => {
    const valid = new Set(programs.map((p) => p.code))
    return (profile.programs ?? []).filter((c) => c.code && valid.has(c.code))
  }, [profile.programs, programs])
  const programCodes = useMemo(() => chosenPrograms.map((c) => c.code), [chosenPrograms])
  const evalProfile = useMemo(() => ({ ...profile, programs: chosenPrograms }), [profile, chosenPrograms])

  // 바뀔 때마다 저장 — 로그인했으면 내 계정(잠깐 모았다가 한 번에), 아니면 이 브라우저
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!user) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        /* 저장 불가(시크릿 모드 등) — 새로고침하면 초기화될 뿐 */
      }
      return
    }
    setSaveStatus('saving')
    let alive = true
    const timer = setTimeout(() => {
      saveUserState(user.id, state)
        .then(() => alive && setSaveStatus('saved'))
        .catch(() => alive && setSaveStatus('error'))
    }, 800)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [state, user])

  // 아직 계정에 저장되지 않은 변경이 있으면 창을 닫기 전에 알린다
  useEffect(() => {
    if (saveStatus === 'saved') return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveStatus])

  // 수강신청 연습 기록 저장소 — 로그인했으면 계정 데이터(state.sim). 값이 바뀌어도 같은 객체를 유지한다
  const simRef = useRef(state.sim)
  simRef.current = state.sim
  const simStore = useMemo(() => (user ? {
    get: (key, fallback) => simRef.current?.[key] ?? fallback,
    set: (key, value) => setState((s) => ({ ...s, sim: { ...s.sim, [key]: value } })),
  } : localSimStore), [user])

  const payload = useMemo(
    () => taken.map(({ id, ...course }) => course),
    [taken],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      api
        .evaluate(entryYear, payload, evalProfile, ctrl.signal)
        .then((r) => {
          setReport(r)
          setError(null)
        })
        .catch((e) => e.name !== 'AbortError' && setError(e.message))
    }, 150)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [entryYear, payload, evalProfile])

  const update = (patch) => edit((s) => ({ ...s, ...patch }))
  const startSim = () => {
    setBaseReport(report)
    setDraft(state)
  }
  const endSim = (apply) => {
    if (apply) setState((s) => ({ ...s, entryYear: draft.entryYear, taken: draft.taken, profile: draft.profile }))
    setDraft(null)
    setBaseReport(null)
  }
  // 성적증명서에서 찾은 융합·연계전공을 다전공 목록에 넣는다 (최대 3개)
  const addPrograms = (hints) => edit((s) => {
    const list = s.profile.programs ?? []
    const have = new Set(list.map((c) => c.code))
    const added = hints.filter((h) => !have.has(h.code)).map((h) => ({ kind: h.kind, code: h.code }))
    return { ...s, profile: { ...s.profile, programs: [...list, ...added].slice(0, 3) } }
  })

  // 대시보드의 '+ 예정' — 권장 학년·학기에 수강 예정으로 넣는다 (다전공 과목은 그 전공에 인정되게)
  const planCourse = (course, pool) => {
    const m = /(\d)학년\s*(\d학기)?/.exec(course.recommended ?? '')
    const grade = course.grade ?? (m ? Number(m[1]) : 1)
    const semester = (course.semester ?? m?.[2] ?? '1학기').startsWith('2') ? '2학기' : '1학기'
    const id = Math.random().toString(36).slice(2, 10)
    edit((s) => ({
      ...s,
      taken: [...s.taken, {
        id, code: course.code, name: course.name, credits: course.credits,
        year: s.entryYear + grade - 1, semester, grade: null, ...(pool ? { counts_for: pool } : {}),
      }],
    }))
  }

  // 수강신청 연습 결과 → 그 학기 '수강 예정' 과목으로
  const exportPlanned = (registered, data) => {
    edit((s) => {
      const have = new Set(s.taken.map((t) => `${t.code}|${t.year}|${t.semester}`))
      const added = registered
        .map((c) => ({ id: Math.random().toString(36).slice(2, 10), code: c.code, name: c.name, credits: c.credits,
                       year: data.year, semester: data.semester, grade: null }))
        .filter((t) => !have.has(`${t.code}|${t.year}|${t.semester}`))
      return { ...s, taken: [...s.taken, ...added] }
    })
  }

  // 처음 로그인한 사용자는 학번·다전공·들은 과목부터 단계별로 설정. 이후엔 #/profile 에서 고친다
  const firstSetup = user && !state.setupDone
  if (firstSetup || hash.startsWith('#/profile')) {
    const done = () => {
      if (firstSetup) update({ setupDone: true })
      window.location.hash = ''
    }
    return (
      <Setup meta={meta} state={view} programs={programs} programCodes={programCodes} report={report}
        editing={!firstSetup} initialStep={hash === '#/profile/courses' ? 2 : 0} onChange={update} onAddProgram={addPrograms} onDone={done} />
    )
  }

  if (hash === '#/roadmap') {
    return (
      <Roadmap entryYear={entryYear} payload={payload} profile={evalProfile} taken={taken} report={report} simulating={!!draft}
        onAdd={(items) => edit((s) => ({ ...s, taken: [...s.taken, ...items] }))} onBack={() => { window.location.hash = '' }} />
    )
  }
  if (hash === '#/grades') {
    return report ? <Grades report={report} onBack={() => { window.location.hash = '' }} /> : <p className="app">계산 중…</p>
  }

  if (hash === '#/sim') {
    return (
      <Suspense fallback={<p className="app">수강신청 연습 불러오는 중…</p>}>
        <SimApp taken={taken} entryYear={entryYear} programNames={chosenPrograms.map((c) => programs.find((p) => p.code === c.code)?.name).filter(Boolean)}
          onExportPlanned={exportPlanned} store={simStore} onExit={() => { window.location.hash = '' }} />
      </Suspense>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1 className="brand"><a className="brand-link" href="#" aria-label="trAIl 홈"><BrandMark /><span>tr<span className="brand-ai">AI</span>l</span></a></h1>
          <p className="subtitle">졸업까지 따라가는 길 · 경북대 인공지능전공 졸업요건 대시보드</p>
        </div>
        <a className="btn sim-link" href="#/sim">수강신청 연습 <small>(시뮬레이션)</small></a>
        {user && <AccountMenu user={user} saveStatus={saveStatus} />}
      </header>

      <NoticeBar />
      {error && <div className="banner banner-error" role="alert">서버와 통신하지 못했습니다: {error}</div>}

      {draft && <SimBanner base={baseReport} now={report} onApply={() => endSim(true)} onCancel={() => endSim(false)} />}

      {/* 넓은 화면: 왼쪽 졸업 현황 + 오른쪽 좁은 칸. 좁은 화면은 요약 → 학사일정 → 현황 → 뉴스·퀴즈(맨 아래) */}
      <div className="home-grid">
      <aside className="home-side" aria-label="내 정보와 오늘의 소식">
      {/* 학번·다전공·들은 과목은 프로필 설정에서 고친다 — 홈에는 요약만 */}
      <div className="profile-summary panel">
        <div className="summary-chips">
          <span className="chip">{entryYear}학번</span>
          <span className="chip">인공지능전공</span>
          {chosenPrograms.map((c) => programs.find((p) => p.code === c.code)?.name).filter(Boolean).map((n) => <span key={n} className="chip">{n}</span>)}
        </div>
        <div className="summary-actions">
          <a className="btn btn-primary" href="#/roadmap">졸업 로드맵</a>
          {!draft && <button type="button" className="btn" onClick={startSim}>🧪 졸업 시뮬레이션</button>}
          <a className="btn" href="#/grades">성적 통계</a>
          <a className="btn" href="#/profile">프로필 설정</a>
        </div>
      </div>

      <Schedule />

      <Daily records={state.daily?.quiz} onChange={(quiz) => setState((s) => ({ ...s, daily: { ...s.daily, quiz } }))} />
      </aside>

      <main className="dashboard home-main" aria-label="졸업요건 현황">
        {report ? <Dashboard report={report} onPlan={planCourse} onOpen={setSheet} profile={profile}
          onProfile={(patch) => edit((s) => ({ ...s, profile: { ...s.profile, ...patch } }))} /> : <div className="panel empty">계산 중…</div>}
      </main>
      </div>
      {sheet && report?.requirements.some((r) => r.id === sheet) && (
        <CourseSheet req={report.requirements.find((r) => r.id === sheet)} report={report} taken={taken}
          onChange={(t) => update({ taken: t })} onClose={() => setSheet(null)} />
      )}

      <footer className="footer">
        교육과정·졸업요건 데이터: 경북대 knuin 교육과정조회, 학교·학과 공식 기준. 최종 확인은 학과 사무실에서 하세요.
        {' '}{user ? '입력한 성적은 내 계정에 저장되며 본인만 볼 수 있습니다.' : '입력한 성적은 이 브라우저에만 저장됩니다.'}
        {' '}<a href="#/notices">공지 · 업데이트</a> · <a href="#/privacy">개인정보 처리 안내</a>
      </footer>
    </div>
  )
}
