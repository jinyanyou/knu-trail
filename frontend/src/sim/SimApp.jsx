// 수강신청 연습 (시뮬레이션)
// 경북대 수강신청 화면(sugang.knu.ac.kr)의 화면 구성·흐름을 본뜬 연습용 화면. 실제 사이트가 아니며 아무것도
// 학교로 전송하지 않는다. 로그인 칸(학번·ID·비밀번호)은 일부러 만들지 않았다 — 실제 로그인 화면으로 오인되지 않게.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api.js'
import { RgBadge, useRelativeGrading } from '../components/RelativeGrading.jsx'
import { check, competition, fillTime, fmtSec, normalizeId, openTimeOf, restrictionOf, ROUNDS, seatsLeft, slotRow } from './engine.js'
import './sim.css'

const MAX_BASKET_CLICKS = 500
const SESSION_LIMIT_SEC = 20 * 60
const DAYS = ['월', '화', '수', '목', '금']

const DEPT = '1O0109' // 소속: 인공지능전공
const STUDENT_INFO = { deptName: '전자공학부 인공지능전공', college: 'IT대학', aliases: ['인공지능전공', '전자공학부'] }
const CHANGE_START = 9 * 3600     // 수강정정: 연습용으로 09:00 시작
const CHANGE_AGE = 3 * 86400      // 정정 기간에는 신청이 열린 지 며칠 지난 상태
const CHANGE_BUSY = 3             // 정정 기간에는 취소가 잦아 빈자리가 더 자주 열림
const BEST_KEY = 'best'
const MEMO_KEY = 'memo'
// 접속 대기 중 새로고침: 실제처럼 대기가 처음부터 다시 (맨 뒤 순번). 이 탭에서만 기억한다
const SESSION_KEY = 'trail:sim-session'
const readSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}
const writeSession = (v) => {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 저장이 막혀 있으면 새로고침 때 처음 화면으로 돌아갈 뿐
  }
}

// 기록·메모는 이 브라우저에만 (실패해도 연습은 그대로 진행)
const randomCaptcha = () =>
  Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('')

function SimBanner({ onExit }) {
  return (
    <div className="sim-banner" role="note">
      <span>
        <strong>연습용 시뮬레이션</strong>
        <span className="sim-banner-short"> 실제 수강신청 아님</span>
        <span className="sim-banner-long"> — 실제 경북대학교 수강신청(sugang.knu.ac.kr)이 아닙니다.
          여기서 신청한 내용은 학교에 전송되지 않으며, 정원·경쟁은 수집된 공개 데이터로 흉내 낸 것입니다.</span>
      </span>
      <button type="button" className="sim-exit" onClick={onExit}>← trAIl로</button>
    </div>
  )
}

function Captcha({ text, onRefresh }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.font = 'italic 600 22px serif'
    g.fillStyle = '#555'
    ;[...text].forEach((ch, i) => {
      g.save()
      g.translate(14 + i * 22, 28)
      g.rotate((Math.random() - 0.5) * 0.5)
      g.fillText(ch, 0, 0)
      g.restore()
    })
    g.strokeStyle = '#333'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(8, 12 + Math.random() * 20)
    g.lineTo(110, 12 + Math.random() * 20)
    g.stroke()
  }, [text])
  return (
    <span className="sim-captcha">
      <canvas ref={ref} width="116" height="40" aria-label="자동입력방지문자 이미지 (연습)" />
      <button type="button" className="sim-refresh" onClick={onRefresh} aria-label="새 문자">↻</button>
    </span>
  )
}

function Modal({ msg, onClose }) {
  const btn = useRef(null)
  useEffect(() => btn.current?.focus(), [])
  return (
    <div className="sim-modal-back" role="dialog" aria-modal="true" aria-label="알림">
      <div className={`sim-modal ${msg.ok ? 'ok' : 'err'}`}>
        <p className="sim-modal-tag">연습 알림</p>
        <p>{msg.text}</p>
        {msg.confirm ? (
          <div className="sim-modal-actions">
            <button ref={btn} type="button" className="sim-btn-line" onClick={onClose}>취소</button>
            <button type="button" className="sim-btn-red" onClick={() => { msg.confirm(); onClose() }}>{msg.confirmLabel ?? '확인'}</button>
          </div>
        ) : (
          <button ref={btn} type="button" className="sim-btn-red" onClick={onClose}>확인</button>
        )}
      </div>
    </div>
  )
}

// ── 1. 연습 설정 (실제 사이트의 로그인 자리) ─────────────────────
function Setup({ terms, defaults, onStart }) {
  const [term, setTerm] = useState(terms[0] ?? '')
  const [mode, setMode] = useState('register')
  const [countdown, setCountdown] = useState(10)
  const [bonus, setBonus] = useState(false)
  const [queue, setQueue] = useState(true)
  const [captcha, setCaptcha] = useState(true)
  const [freshman, setFreshman] = useState(false)
  const rounds = ROUNDS.filter((r) => r.freshman === undefined || r.freshman === freshman)
  const [round, setRound] = useState(14 * 3600)
  const maxCredits = Math.min(defaults.maxCredits + (bonus ? 3 : 0), 24)
  const roundAt = rounds.some((r) => r.at === round) ? round : rounds[0].at

  return (
    <div className="sim-login-wrap">
      <div className="sim-login-band"><span className="sim-logo-text">수강신청 <b>연습</b></span></div>
      <div className="sim-login-sheet">
        <div className="sim-login-card">
          <div className="sim-login-head">
            <span className="sim-dash" />
            <p>연습<br />시작</p>
          </div>
          <form className="sim-login-body" onSubmit={(e) => { e.preventDefault(); onStart({ term, mode, countdown, maxCredits, queue, captcha, freshman, round: roundAt }) }}>
            <label>학기
              <select value={term} onChange={(e) => setTerm(e.target.value)}>
                {terms.map((t) => <option key={t} value={t}>{t.replace('-', '학년도 ')}학기</option>)}
              </select>
            </label>
            <label>연습할 화면
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="register">수강신청 (선착순)</option>
                <option value="basket">수강꾸러미 담기 → 일괄신청 → 수강신청</option>
                <option value="change">수강정정 (이미 신청한 시간표 바꾸기)</option>
              </select>
            </label>
            <label className="sim-check"><input type="checkbox" checked={freshman} onChange={(e) => setFreshman(e.target.checked)} />신입생으로 연습</label>
            <label>연습할 회차 (신청 시작 시각)
              <select value={roundAt} onChange={(e) => setRound(Number(e.target.value))}>
                {rounds.map((r) => <option key={r.at} value={r.at}>{r.label}</option>)}
              </select>
            </label>
            <label>회차 시작까지
              <select value={countdown} onChange={(e) => setCountdown(Number(e.target.value))}>
                <option value={0}>바로 시작</option>
                <option value={10}>10초 (정각 맞추기 연습)</option>
                <option value={30}>30초</option>
              </select>
            </label>
            <label className="sim-check"><input type="checkbox" checked={bonus} onChange={(e) => setBonus(e.target.checked)} />직전학기 평점 3.7 이상 등 (+3학점)</label>
            <label className="sim-check"><input type="checkbox" checked={queue} onChange={(e) => setQueue(e.target.checked)} />접속 대기열 재현</label>
            <label className="sim-check"><input type="checkbox" checked={captcha} onChange={(e) => setCaptcha(e.target.checked)} />자동입력방지문자 입력</label>
            <p className="sim-small">신청가능학점 {maxCredits}학점 (졸업 {defaults.gradCredits}학점 기준)</p>
            <button type="submit" className="sim-btn-login" disabled={!term}>연습 시작</button>
            <p className="sim-small">학번·비밀번호는 묻지 않습니다. 실제 수강신청은 학교 사이트에서 하세요.</p>
          </form>
        </div>
        <div className="sim-login-info">
          <h2>수강신청 연습 안내</h2>
          <ul>
            <li>실제 수강신청 화면처럼 <b>강좌번호 11자리</b>(예: CAIB0207001)를 입력하고 [확인] → [신청] 순서로 연습합니다.</li>
            <li>오른쪽 아래 <b>강좌 찾기</b>는 연습용 도우미입니다. 실제 사이트에는 없으니 강좌번호를 미리 적어 두세요.</li>
            <li>정원은 실제 개설 강좌 데이터이고, 다른 학생들의 신청은 수집 시점의 신청·꾸러미 인원을 바탕으로 흉내 냅니다.
              인기 강좌는 시작 몇 초 만에 마감됩니다.</li>
            <li>수강꾸러미는 선착순이 아니며, 정원 안에 든 과목은 수강신청 기간에 자동으로 일괄신청됩니다.</li>
            <li><b>회차</b>: 과목마다 신청이 열리는 시각이 다릅니다 (재학생 기준 소속 학과 전공 14:00 → 타 학과 전공 15:00 → 교양 16:00).
              늦은 회차를 고르면 앞 회차에 열린 인기 과목은 이미 마감된 상태입니다.</li>
            <li><b>빈자리</b>: 마감된 강좌에 취소가 생기면 무작위 시간이 지난 뒤 잠깐 열립니다. [신청]을 계속 눌러 잡아 보세요
              (꾸러미 과목은 500회 이상 누르면 꾸러미에서 삭제).</li>
            <li><b>수강정정</b>: 메모한 과목으로 신청이 끝난 상태에서 시작합니다. 꽉 찬 강좌를 지우면 그 자리는 바로 다른 학생에게
              넘어갈 수 있으니, 바꿀 분반을 먼저 잡고 나서 지우는 연습을 해 보세요.</li>
            <li><b>수강 제한 분반</b>: 강좌 비고의 '본교생 수강 불가', '○○학과 재학생만', '[수강 대상]' 같은 제한을 인공지능전공 학생 기준으로 적용합니다.</li>
            <li>대시보드에서 이 학기 <b>수강 예정</b>으로 넣은 과목은 '내 희망 강좌 메모'에 분반과 함께 나옵니다.</li>
            <li>실제 일정·시각은 해마다 바뀝니다. 학사공지의 수강신청 안내를 꼭 확인하세요.</li>
          </ul>
        </div>
      </div>
      {/* 모바일 수강신청 화면의 오른쪽 아래 TOP 버튼 (좁은 화면에서만 보임) */}
      <button type="button" className="sim-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <span aria-hidden="true">↑</span>TOP
      </button>
    </div>
  )
}

// ── 2. 접속 대기 ─────────────────────────────────────────────
function Queue({ onDone, reloaded }) {
  // 새로고침해서 다시 들어오면 맨 뒤 순번으로
  const [n, setN] = useState(() => (reloaded ? 1500 : 300) + Math.floor(Math.random() * 1500))
  useEffect(() => {
    if (n <= 0) {
      onDone()
      return undefined
    }
    const t = setTimeout(() => setN((x) => Math.max(0, x - (40 + Math.floor(Math.random() * 160)))), 400)
    return () => clearTimeout(t)
  }, [n, onDone])
  return (
    <div className="sim-queue" role="status">
      <p className="sim-queue-title">접속 대기 중입니다 (연습)</p>
      {reloaded && <p className="sim-small sim-queue-reset">새로고침해서 대기 순번이 맨 뒤로 다시 배정됐어요.</p>}
      <p>나의 대기순번 <b>{n.toLocaleString()}</b>번</p>
      <div className="sim-queue-bar"><span style={{ width: `${Math.max(5, 100 - n / 18)}%` }} /></div>
      <p className="sim-small">실제 사이트에서는 새로고침하면 맨 뒤 순번으로 다시 배정됩니다.</p>
      <button type="button" className="sim-btn-line" onClick={() => setN((x) => x + 1500)}>새로고침 (해 보기)</button>
    </div>
  )
}

// ── 3. 신청 화면 ─────────────────────────────────────────────
function CourseTable({ rows, action, actionLabel, extraCols = [], retakeOf, empty }) {
  return (
    <div className="sim-table-wrap">
      <table className="sim-table">
        <thead>
          <tr>
            <th>No.</th><th>{actionLabel}</th><th>교과목코드</th><th>교과목명</th><th>분반</th><th>교과구분</th>
            <th>학점</th><th>재이수년도</th><th>재이수학기</th><th>강의시간</th>
            {extraCols.map((c) => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10 + extraCols.length} className="sim-empty">{empty}</td></tr>
          ) : rows.map((c, i) => {
            const retake = retakeOf(c.code)
            return (
              <tr key={c.id}>
                <td>{i + 1}</td>
                <td><button type="button" className="sim-btn-xs" onClick={() => action(c)}>{actionLabel}</button></td>
                <td>{c.code}</td>
                <td className="sim-left">{c.name}</td>
                <td>{c.section}</td>
                <td>{c.type}</td>
                <td>{c.credits}</td>
                <td>{retake?.year ?? ''}</td>
                <td>{retake?.semester ?? ''}</td>
                <td className="sim-time">{c.time || '-'}</td>
                {extraCols.map((col) => <td key={col.key}>{col.render(c)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Timetable({ courses }) {
  const rows = 24 // 09:00 ~ 21:00, 30분 단위
  const cells = {}
  for (const c of courses) {
    for (const [d, s] of c.slots ?? []) {
      const r = slotRow(s)
      if (r != null && DAYS.includes(d)) (cells[`${d}${r}`] ??= []).push(c)
    }
  }
  return (
    <table className="sim-grid" aria-label="신청 결과 시간표">
      <thead><tr><th />{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            <th>{r % 2 === 0 ? `${9 + r / 2}:00` : ''}</th>
            {DAYS.map((d) => {
              const list = cells[`${d}${r}`] ?? []
              const above = cells[`${d}${r - 1}`] ?? []
              // 같은 수업이 이어지는 칸에는 이름을 다시 쓰지 않는다
              const label = list.filter((c) => !above.includes(c)).map((c) => c.name).join(' / ')
              return <td key={d} className={`${list.length > 1 ? 'clash' : list.length ? 'on' : ''} ${list.length && above.some((c) => list.includes(c)) ? 'cont' : ''}`}>{label}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Finder({ courses, onPick, entryDept, rg, term }) {
  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const list = useMemo(() => {
    const key = q.replace(/\s/g, '').toLowerCase()
    return courses
      .filter((c) => !onlyMine || c.dept_code === entryDept)
      .filter((c) => !key || `${c.name}${c.id}${c.professor}`.replace(/\s/g, '').toLowerCase().includes(key))
      .slice(0, 60)
  }, [courses, q, onlyMine, entryDept])
  return (
    <details className="sim-finder">
      <summary>강좌 찾기 <span>(연습 도우미 — 실제 사이트에는 없음)</span></summary>
      <div className="sim-finder-body">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="교과목명·강좌번호·교수" aria-label="강좌 찾기" />
        <label className="sim-check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />인공지능전공 개설 강좌만</label>
        <ul>
          {list.map((c) => {
            const r = competition(c)
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)}>
                  <b>{c.id.replace('-', '')}</b> {c.name} <span>{c.professor} · {c.credits}학점 · {c.time || '시간 미정'}</span>
                  {r != null && <em className={r >= 1 ? 'hot' : ''}>경쟁 {r.toFixed(1)}:1</em>}
                  <RgBadge rg={rg} code={c.code} term={term} section={c} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}

function Memo({ memo, byCode, onPick, onRemove }) {
  if (memo.length === 0) return null
  return (
    <div className="sim-memo">
      <p className="sim-memo-title">내 희망 강좌 메모 <span>(연습 도우미)</span></p>
      <ul>
        {memo.map((code) => (
          <li key={code}>
            <b>{byCode[code]?.[0]?.name ?? code}</b>
            <button type="button" className="sim-memo-x" onClick={() => onRemove(code)} aria-label={`${code} 메모에서 빼기`}>✕</button>
            <span className="sim-memo-secs">
              {(byCode[code] ?? []).map((c) => (
                <button key={c.id} type="button" onClick={() => onPick(c)} title={`${c.professor} · ${c.time}`}>
                  {c.id.replace('-', '')}
                  {competition(c) != null && <em className={competition(c) >= 1 ? 'hot' : ''}> {competition(c).toFixed(1)}:1</em>}
                </button>
              ))}
              {!byCode[code] && <span className="sim-small">이번 학기 개설 없음</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// 수강정정 시작 상태: 메모한 과목(없으면 인공지능전공 개설 과목)을 시간·학점이 맞는 분반으로 신청했다고 가정
function initialTimetable(courses, byCode, memo, student, maxCredits) {
  const pool = [
    ...memo.flatMap((code) => byCode[code] ?? []),
    ...courses.filter((c) => c.dept_code === DEPT && c.capacity),
  ]
  const picked = []
  for (const c of pool) {
    if (picked.some((p) => p.code === c.code) || restrictionOf(c, student)) continue
    if (check(c, { registered: picked, maxCredits, elapsedSec: 0, open: true }).ok) picked.push({ ...c, at: null })
    if (picked.reduce((s, p) => s + p.credits, 0) >= maxCredits - 3) break
  }
  return picked
}

function Main({ data, config, taken, programNames, entryYear, store, onFinish }) {
  const courses = data.courses
  const rg = useRelativeGrading(entryYear)
  const byId = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses])
  const byCode = useMemo(() => {
    const m = {}
    for (const c of courses) (m[c.code] ??= []).push(c)
    return m
  }, [courses])
  const student = useMemo(() => ({ freshman: config.freshman, dept: DEPT, ...STUDENT_INFO, programs: programNames }),
    [config.freshman, programNames])
  const changing = config.mode === 'change'
  const busy = changing ? CHANGE_BUSY : 1
  // 메모: 대시보드에서 이 학기 '수강 예정'으로 넣은 과목 + 연습 중 추가한 과목
  const [memo, setMemo] = useState(() => {
    const [y, sem] = data.term.split('-')
    const planned = taken.filter((t) => !t.grade && t.year === Number(y) && t.semester === `${sem}학기`).map((t) => t.code)
    return [...new Set([...planned, ...store.get(MEMO_KEY, [])])]
  })
  useEffect(() => store.set(MEMO_KEY, memo), [memo, store])
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState(config.mode === 'basket' ? 'basket' : changing ? 'change' : 'register')
  const [openAt, setOpenAt] = useState(() => Date.now() + config.countdown * 1000)
  const [basket, setBasket] = useState([])
  const [registered, setRegistered] = useState(() =>
    (changing ? initialTimetable(courses, byCode, memo, student, config.maxCredits) : []))
  const [clicks, setClicks] = useState({})
  const [lookup, setLookup] = useState([])
  const [tab, setTab] = useState('search')
  const [idText, setIdText] = useState('')
  const [captcha, setCaptcha] = useState(randomCaptcha)
  const [captchaInput, setCaptchaInput] = useState('')
  const [msg, setMsg] = useState(null)
  const [log, setLog] = useState([])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [])

  // 연습용 시각: 고른 회차의 시작 시각(예: 14:00:00)을 기준으로 흐른다 — 실제 서버 시간 아님
  const startSec = changing ? CHANGE_START : config.round
  const clockSec = startSec + (now - openAt) / 1000
  const roundElapsed = clockSec - startSec
  const elapsedOf = (c) => (changing ? CHANGE_AGE + roundElapsed : clockSec - openTimeOf(c, student))
  const sessionLeft = SESSION_LIMIT_SEC - Math.floor((now - start) / 1000)
  const clock = fmtSec(clockSec)
  const credits = registered.reduce((s, c) => s + (c.credits || 0), 0)
  const retakeOf = useCallback((code) => taken.find((t) => t.code === code && t.grade), [taken])

  const say = (ok, text) => setMsg({ ok, text })

  const confirm = (e) => {
    e?.preventDefault()
    const id = normalizeId(idText)
    if (!id) return say(false, '강좌번호 11자리를 입력하세요. (예: CAIB0207001)')
    if (config.captcha && captchaInput.toUpperCase() !== captcha) {
      setCaptcha(randomCaptcha())
      setCaptchaInput('')
      return say(false, '자동입력방지문자가 일치하지 않습니다.')
    }
    const c = byId[id]
    if (!c) return say(false, `${id} — 해당 학기에 개설되지 않은 강좌번호입니다.`)
    setLookup([c])
    setTab('search')
    setCaptcha(randomCaptcha())
    setCaptchaInput('')
    return null
  }

  const apply = (c) => {
    if (phase === 'basket') {
      if (basket.some((b) => b.id === c.id)) return say(false, '이미 수강꾸러미에 담은 강좌입니다.')
      if (basket.some((b) => b.code === c.code)) return say(false, '같은 교과목의 다른 분반을 이미 담았습니다.')
      setBasket((b) => [...b, c])
      return say(true, `${c.name}(${c.id}) — 수강꾸러미에 담았습니다. 꾸러미는 선착순이 아닙니다.`)
    }
    if (basket.some((b) => b.id === c.id)) {
      const n = (clicks[c.id] ?? 0) + 1
      setClicks((x) => ({ ...x, [c.id]: n }))
      if (n >= MAX_BASKET_CLICKS) {
        setBasket((b) => b.filter((x) => x.id !== c.id))
        return say(false, '[신청]을 500회 이상 클릭해 수강꾸러미목록에서 삭제되었습니다.')
      }
    }
    if (changing && roundElapsed < 0) return say(false, '아직 수강정정 시작 전입니다.')
    const res = check(c, { registered, maxCredits: config.maxCredits, elapsedSec: elapsedOf(c), open: true,
                           opensAt: fmtSec(openTimeOf(c, student)).slice(0, 5), student, busy })
    setLog((l) => [...l, { id: c.id, name: c.name, ok: res.ok, at: roundElapsed, code: res.code, message: res.message }])
    if (!res.ok) return say(false, res.message)
    setRegistered((r) => [...r, { ...c, at: roundElapsed, viaRelease: elapsedOf(c) > fillTime(c) }])
    return say(true, `${c.name}(${c.id}) 신청되었습니다. (${clock}, 회차 시작 후 ${roundElapsed.toFixed(1)}초)`)
  }

  const doDrop = (c) => {
    setRegistered((r) => r.filter((x) => x.id !== c.id))
    // 실제 규칙: 일괄신청된 과목을 삭제하면 꾸러미 목록으로 돌아간다
    if (c.fromBasket) setBasket((b) => (b.some((x) => x.id === c.id) ? b : [...b, c]))
    say(true, `${c.name}(${c.id}) 삭제되었습니다.`)
  }
  // 꽉 찬 강좌를 지우면 그 자리는 다른 학생에게 넘어간다 — 한 번 더 확인
  const drop = (c) => {
    const full = c.capacity && seatsLeft(c, elapsedOf(c), busy) === 0
    if (!full) return doDrop(c)
    return setMsg({
      ok: false, confirmLabel: '삭제',
      text: `${c.name}(${c.id})은 정원이 꽉 찬 강좌입니다. 삭제하면 이 자리는 바로 다른 학생에게 넘어가 다시 신청하기 어렵습니다. 삭제할까요?`,
      confirm: () => doDrop(c),
    })
  }

  // 꾸러미 마감 → 일괄신청: 수집 시점 꾸러미 인원이 정원 이하이면 자동 신청 (연습용 근사)
  const runBatch = () => {
    const ok = []
    const left = []
    let sum = 0
    for (const c of basket) {
      const fits = !c.capacity || (c.basket ?? 0) <= c.capacity
      const conflict = check(c, { registered: ok, maxCredits: config.maxCredits, elapsedSec: 1, open: true })
      if (fits && conflict.ok && sum + c.credits <= config.maxCredits) {
        ok.push({ ...c, fromBasket: true, at: null })
        sum += c.credits
      } else left.push(c)
    }
    setRegistered(ok)
    setBasket(left)
    setPhase('register')
    setTab('basket')
    setOpenAt(Date.now() + config.countdown * 1000)
    say(true, `일괄신청 결과: ${ok.length}과목 자동 신청, ${left.length}과목은 정원 초과 등으로 직접 신청해야 합니다. (연습용 근사)`)
  }

  const timeUp = sessionLeft <= 0
  useEffect(() => {
    if (timeUp) setMsg({ ok: false, text: '화면 유지 시간 20분이 지났습니다. 실제 사이트에서는 다시 로그인해야 합니다. (연습 종료)' })
  }, [timeUp])

  const liveCols = [
    { key: 'cap', label: '제한인원', render: (c) => c.capacity ?? '-' },
    {
      key: 'cnt', label: '수강인원', render: (c) => {
        if (!c.capacity) return '-'
        const mine = registered.some((r) => r.id === c.id) ? 1 : 0
        const n = phase === 'basket' ? c.basket ?? 0 : c.capacity - seatsLeft(c, elapsedOf(c), busy) + mine
        return <span className={n >= c.capacity ? 'sim-full' : ''}>{Math.min(n, c.capacity + mine)}</span>
      },
    },
  ]

  return (
    <div className="sim-main">
      <div className="sim-topbar">
        <span className="sim-logo-text">수강신청 <b>연습</b></span>
        <span className="sim-topbar-right">
          <span className="sim-clock" title="연습용 시각 (실제 서버 시간 아님)">{clock}</span>
          <span>남은 시간 {Math.floor(Math.max(sessionLeft, 0) / 60)}:{String(Math.max(sessionLeft, 0) % 60).padStart(2, '0')}</span>
          <span>연습생</span>
          <button type="button" onClick={() => onFinish(registered, log)}>연습 종료</button>
        </span>
      </div>

      <div className="sim-sheet">
        <div className="sim-watermark" aria-hidden="true">연습 SIMULATION</div>
        <div className="sim-profile">
          <span><b>학번</b> 연습용</span><span><b>성명</b> 연습생</span><span><b>소속</b> 전자공학부 인공지능전공</span>
          <span><b>신청가능학점</b> {config.maxCredits}</span>
          {phase === 'basket'
            ? <span><b>수강꾸러미 신청학점</b> {basket.reduce((s, c) => s + c.credits, 0)}</span>
            : <span><b>신청학점</b> {credits}</span>}
          <span className={`sim-phase ${roundElapsed >= 0 ? 'open' : ''}`}>
            {phase === 'basket' ? '수강꾸러미 기간'
              : changing ? (roundElapsed >= 0 ? '수강정정 기간' : `수강정정 시작까지 ${Math.ceil(-roundElapsed)}초`)
              : roundElapsed >= 0 ? `${fmtSec(config.round).slice(0, 5)} 회차 진행 중`
                : `${fmtSec(config.round).slice(0, 5)} 회차 시작까지 ${Math.ceil(-roundElapsed)}초`}
          </span>
        </div>

        {/* 넓은 화면: 한 줄 / 좁은 화면: 강좌번호 → 문자 그림·입력 나란히 → 확인·조회 나란히 */}
        <form className="sim-inputbar" onSubmit={confirm}>
          <label className="sim-field sim-field-id">
            <span className="sim-lbl"><span className="sim-req">*</span>강좌번호</span>
            <input value={idText} onChange={(e) => setIdText(e.target.value)} placeholder="11자리 입력" maxLength={14}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </label>
          {config.captcha && (
            <div className="sim-field sim-field-captcha">
              <span className="sim-lbl sim-captcha-label"><span className="sim-req">*</span>자동입력방지<br />문자</span>
              <Captcha text={captcha} onRefresh={() => setCaptcha(randomCaptcha())} />
              <input value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="이미지 4자리 입력" maxLength={4}
                aria-label="자동입력방지문자 입력" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
            </div>
          )}
          <div className="sim-actions">
            <button type="submit" className="sim-btn-line">확인</button>
            <button type="button" className="sim-btn-red" onClick={confirm}>조회</button>
          </div>
        </form>

        <div className="sim-tabs">
          <button type="button" className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>과목 검색 {tab === 'search' && '⌄'}</button>
          <button type="button" className={tab === 'basket' ? 'on' : ''} onClick={() => setTab('basket')}>꾸러미신청목록 {tab === 'basket' && '⌄'}</button>
          {phase === 'basket' && <button type="button" className="sim-btn-red sim-batch" onClick={runBatch}>꾸러미 마감 → 일괄신청 결과 보기 (연습)</button>}
        </div>

        <h3 className="sim-h">{tab === 'search' ? '교과목목록' : '꾸러미신청목록'} <small>[<b>{tab === 'search' ? lookup.length : basket.length}</b>건]</small></h3>
        <div className="sim-notice">
          <span className="star">★</span>
          <ul>
            <li>수강신청의 [신청]을 500회 이상 클릭 시 수강꾸러미목록에서 해당 과목이 삭제됩니다.</li>
            <li>교과구분변경은 이수 후 통합정보시스템에서 변경 가능 합니다.</li>
          </ul>
        </div>
        <CourseTable
          rows={tab === 'search' ? lookup : basket}
          action={apply}
          actionLabel="신청"
         
          retakeOf={retakeOf}
          extraCols={[...liveCols, { key: 'open', label: '신청 시작', render: (c) => fmtSec(openTimeOf(c, student)).slice(0, 5) },
            ...(tab === 'basket' ? [{ key: 'clk', label: '신청클릭수', render: (c) => clicks[c.id] ?? 0 }] : [])]}
          empty={tab === 'search' ? '강좌번호를 입력하고 [확인]을 누르세요.' : '수강꾸러미에 담은 과목이 없습니다.'}
        />

        {lookup.length === 1 && tab === 'search' && lookup[0].remark && (
          <p className="sim-remark">비고: {lookup[0].remark}
            {restrictionOf(lookup[0], student) && <b> — {restrictionOf(lookup[0], student)}</b>}</p>
        )}

        {phase !== 'basket' && (
          <>
            <h3 className="sim-h">수강신청목록 <small>[<b>{registered.length}</b>건]</small></h3>
            <CourseTable rows={registered} action={drop} actionLabel="삭제" retakeOf={retakeOf}
              empty="신청한 과목이 없습니다." />
          </>
        )}

        <Memo memo={memo} byCode={byCode} onPick={(c) => setIdText(c.id.replace('-', ''))}
          onRemove={(code) => setMemo((m) => m.filter((x) => x !== code))} />
        <Finder courses={courses} entryDept={DEPT} rg={rg} term={data.term}
          onPick={(c) => { setIdText(c.id.replace('-', '')); setMemo((m) => (m.includes(c.code) ? m : [...m, c.code])); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      </div>
      {msg && <Modal msg={msg} onClose={() => setMsg(null)} />}
    </div>
  )
}

// ── 4. 결과 ─────────────────────────────────────────────────
function Result({ registered, log, round, store, onAgain, onExport, onExit }) {
  const fails = log.filter((l) => !l.ok)
  const fastest = registered.filter((r) => r.at != null && r.at >= 0).sort((a, b) => a.at - b.at)
  const first = fastest[0]?.at
  // 최고 기록 (회차 시작 후 첫 신청 성공까지) — 내 계정(로그인 안 했으면 이 브라우저)에 저장
  const [best] = useState(() => {
    const prev = store.get(BEST_KEY, null)
    return { prev, isNew: first != null && (prev == null || first < prev) }
  })
  useEffect(() => {
    if (best.isNew) store.set(BEST_KEY, first)
  }, [best.isNew, first, store])
  const caught = registered.filter((r) => r.viaRelease).length
  return (
    <div className="sim-result">
      <h2>연습 결과</h2>
      <p className="sim-small">실제 수강신청 결과가 아닙니다.</p>
      <div className="sim-stats">
        <div><b>{registered.length}</b>과목 신청</div>
        <div><b>{registered.reduce((s, c) => s + c.credits, 0)}</b>학점</div>
        <div><b>{fails.filter((f) => f.code === 'full').length}</b>번 정원 초과</div>
        <div><b>{first != null ? `${first.toFixed(1)}초` : '-'}</b>첫 신청까지 ({fmtSec(round).slice(0, 5)} 기준)</div>
        <div><b>{caught}</b>과목 빈자리로 잡음</div>
        <div className={best.isNew ? 'sim-new' : ''}>
          <b>{best.isNew ? `${first.toFixed(1)}초` : best.prev != null ? `${best.prev.toFixed(1)}초` : '-'}</b>
          {best.isNew ? '새 최고 기록!' : '내 최고 기록'}
        </div>
      </div>
      <Timetable courses={registered} />
      {fastest.length > 0 && (
        <ul className="sim-timeline">
          {fastest.map((r) => <li key={r.id}><b>+{r.at.toFixed(1)}초</b> {r.name} ({r.id}){r.viaRelease ? ' — 빈자리' : ''}</li>)}
        </ul>
      )}
      {fails.length > 0 && (
        <details className="sim-fails"><summary>실패 기록 {fails.length}건</summary>
          <ul>{fails.map((f, i) => <li key={i}>{f.at.toFixed(1)}초 · {f.name}({f.id}) — {f.message}</li>)}</ul>
        </details>
      )}
      <div className="sim-result-actions">
        <button type="button" className="sim-btn-red" onClick={onAgain}>다시 연습</button>
        <button type="button" className="sim-btn-line" onClick={onExport} disabled={!registered.length}>신청 과목을 내 대시보드에 '수강 예정'으로 추가</button>
        <button type="button" className="sim-btn-line" onClick={onExit}>대시보드로 돌아가기</button>
      </div>
    </div>
  )
}

export default function SimApp({ taken, programNames = [], entryYear, store, onExportPlanned, onExit }) {
  const [terms, setTerms] = useState(null)
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [stage, setStage] = useState('setup')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [reloaded, setReloaded] = useState(false) // 대기 중에 새로고침해서 다시 들어왔는지

  const start = async (cfg, again = false) => {
    setError(null)
    try {
      if (!data || data.term !== cfg.term) setData({ term: cfg.term, ...(await api.getSimTimetable(cfg.term)) })
      setConfig(cfg)
      setReloaded(again)
      setStage(cfg.queue ? 'queue' : 'main')
      writeSession(cfg.queue ? { stage: 'queue', cfg } : null)
    } catch (e) {
      setError(e.message)
      writeSession(null)
    }
  }

  useEffect(() => {
    api.getSimTerms().then((r) => setTerms(r.terms)).catch((e) => setError(e.message))
    const saved = readSession()
    if (saved?.stage === 'queue' && saved.cfg) start(saved.cfg, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 연습을 나가면 대기 기억도 지운다 (다음에 열 때 처음 화면부터)
  const exit = () => {
    writeSession(null)
    onExit()
  }

  const queueDone = useCallback(() => {
    writeSession(null)
    setStage('main')
  }, [])

  // 졸업 133학점 → 학기당 20학점 (2026-2학기 수강신청 안내 기준)
  const defaults = { gradCredits: 133, maxCredits: 20 }

  return (
    <div className="sim-root">
      <SimBanner onExit={exit} />
      {error && <p className="sim-error" role="alert">{error}</p>}
      {stage === 'setup' && (terms ? <Setup terms={terms} defaults={defaults} onStart={start} /> : <p className="sim-loading">불러오는 중…</p>)}
      {stage === 'queue' && <Queue onDone={queueDone} reloaded={reloaded} />}
      {stage === 'main' && data && (
        <Main data={data} config={config} taken={taken} programNames={programNames} entryYear={entryYear} store={store}
          onFinish={(registered, log) => { setResult({ registered, log }); setStage('result') }} />
      )}
      {stage === 'result' && result && (
        <Result {...result} round={config.round} store={store} onAgain={() => setStage('setup')} onExit={exit}
          onExport={() => { onExportPlanned(result.registered, data); exit() }} />
      )}
    </div>
  )
}
