import { useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'
import BrandMark from './BrandMark.jsx'

const CREDIT_LIMITS = [15, 18, 19, 21]
const TERM_COUNT = 10 // 학기 옮기기에서 고를 수 있는 학기 수 (계획 시작부터)
const newId = () => Math.random().toString(36).slice(2, 10)
const key = (t) => `${t.year}|${t.semester}`
const sumCredits = (courses) => courses.reduce((s, c) => s + (c.credits || 0), 0)

// 계획 과목 → 들은 과목 목록에 넣을 '수강 예정' 항목 (특정 과목이 없는 자유 선택은 직접 입력 과목으로)
function toPlanned(c) {
  const free = c.code.startsWith('ROADMAP-FREE')
  return {
    id: newId(), code: free ? `ETC-${newId()}` : c.code, name: c.name, credits: c.credits,
    year: c.year, semester: c.semester, grade: null,
    ...(c.counts_for ? { counts_for: c.counts_for } : {}), ...(free ? { category: '일반선택' } : {}),
  }
}

// 졸업요건 계산에 넘길 모양 (id 없이)
const forEval = (c) => {
  const { id, ...rest } = toPlanned(c)
  return rest
}

function termList(start, entryYear) {
  const out = []
  let { year, semester } = start
  for (let i = 0; i < TERM_COUNT; i += 1) {
    out.push({ year, semester, grade: year - entryYear + 1 })
    ;[year, semester] = semester === '1학기' ? [year, '2학기'] : [year + 1, '1학기']
  }
  return out
}

// 서버 계획 + 새로 채운 계획을 학기별로 합친다
function mergeTerms(terms, extra) {
  const map = new Map(terms.map((t) => [key(t), { ...t, courses: [...t.courses] }]))
  for (const t of extra) {
    if (!t.courses.length) continue
    if (!map.has(key(t))) map.set(key(t), { ...t, courses: [] })
    map.get(key(t)).courses.push(...t.courses)
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.semester.localeCompare(b.semester))
}

function CourseRow({ c, terms, used, onMove, onSwap, onRemove }) {
  const alts = (c.alternatives ?? []).filter((a) => !used.has(a.code))
  return (
    <li>
      <div className="roadmap-course-main">
        <span className="c-name">{c.name}</span>
        <span className="c-meta">{c.credits}학점 · {c.reason}</span>
      </div>
      <div className="roadmap-course-edit">
        <select aria-label={`${c.name} 학기 옮기기`} value={key(c)} onChange={(e) => onMove(e.target.value)}>
          {terms.map((t) => <option key={key(t)} value={key(t)}>{t.grade}학년 {t.semester}</option>)}
        </select>
        {alts.length > 0 && (
          <select aria-label={`${c.name} 다른 과목으로 바꾸기`} value="" onChange={(e) => onSwap(e.target.value)}>
            <option value="">다른 과목으로…</option>
            {alts.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.credits}학점)</option>)}
          </select>
        )}
        <button type="button" className="icon-btn" aria-label={`${c.name} 계획에서 빼기`} onClick={onRemove}>✕</button>
      </div>
    </li>
  )
}

// #/roadmap — 졸업까지 학기별 수강 계획. 넣기 전에 학기 옮기기·다른 과목으로 바꾸기·빼기로 고칠 수 있다
export default function Roadmap({ entryYear, payload, profile, taken, simulating, onAdd, onBack }) {
  const [maxCredits, setMaxCredits] = useState(18)
  const [plan, setPlan] = useState(null)
  const [terms, setTerms] = useState([])       // 고친 계획
  const [removed, setRemoved] = useState([])   // 계획에서 뺀 과목 (다시 채울 때 추천하지 않음)
  const [base, setBase] = useState({})         // 학기별로 이미 넣어 둔 수강 예정 학점
  const [check, setCheck] = useState(null)     // 고친 계획으로 다시 계산한 졸업요건
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setPlan(null)
    api.roadmap(entryYear, payload, profile, maxCredits)
      .then((p) => {
        if (!alive) return
        setPlan(p)
        setTerms(p.terms.map((t) => ({ year: t.year, semester: t.semester, grade: t.grade, courses: t.courses })))
        setBase(Object.fromEntries(p.terms.map((t) => [key(t), t.credits - sumCredits(t.courses)])))
        setRemoved([])
        setError(null)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [entryYear, payload, profile, maxCredits, reload])

  const planned = useMemo(() => terms.flatMap((t) => t.courses), [terms])
  const used = useMemo(() => new Set(planned.map((c) => c.code)), [planned])

  // 고칠 때마다 졸업요건을 다시 계산해 이 계획으로도 졸업 가능한지 확인
  useEffect(() => {
    if (!plan) return undefined
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      api.evaluate(entryYear, [...payload, ...planned.map(forEval)], profile, ctrl.signal)
        .then((r) => setCheck(r))
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [plan, planned, payload, profile, entryYear])

  const allTerms = plan ? termList(plan.start, entryYear) : []
  const edit = (fn) => {
    setTerms((ts) => fn(ts.map((t) => ({ ...t, courses: [...t.courses] }))).filter((t) => t.courses.length || base[key(t)]))
    setMessage(null)
  }
  const move = (c, to) => {
    const [year, semester] = to.split('|')
    const dest = allTerms.find((t) => key(t) === to)
    edit((ts) => {
      const from = ts.find((t) => key(t) === key(c))
      from.courses = from.courses.filter((x) => x.code !== c.code)
      let target = ts.find((t) => key(t) === to)
      if (!target) {
        target = { ...dest, courses: [] }
        ts.push(target)
      }
      target.courses.push({ ...c, year: Number(year), semester })
      return ts.sort((a, b) => a.year - b.year || a.semester.localeCompare(b.semester))
    })
  }
  const swap = (c, code) => {
    const alt = c.alternatives.find((a) => a.code === code)
    edit((ts) => {
      const t = ts.find((x) => key(x) === key(c))
      t.courses = t.courses.map((x) => (x.code === c.code
        ? { ...x, ...alt, alternatives: [{ code: c.code, name: c.name, credits: c.credits }, ...c.alternatives.filter((a) => a.code !== code)] }
        : x))
      return ts
    })
  }
  const remove = (c) => {
    setRemoved((r) => [...r, c])
    edit((ts) => ts.map((t) => (key(t) === key(c) ? { ...t, courses: t.courses.filter((x) => x.code !== c.code) } : t)))
  }

  // 뺀 과목은 빼고, 고친 계획은 그대로 둔 채 남은 요건만 다시 채운다
  const refill = () => {
    setBusy(true)
    api.roadmap(entryYear, [...payload, ...planned.map(forEval)], profile, maxCredits,
      removed.map((c) => c.code).filter((code) => !used.has(code)))
      .then((p) => {
        setTerms((ts) => mergeTerms(ts, p.terms))
        setMessage(p.added_credits ? `남은 요건을 채우려고 ${p.added_credits}학점을 더 넣었어요.` : '더 넣을 과목이 없어요.')
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const addTerms = (list) => {
    const courses = list.flatMap((t) => t.courses)
    onAdd(courses.map(toPlanned))
    setMessage(`${courses.length}과목을 수강 예정으로 넣었어요. 남은 계획을 다시 계산했어요.`)
  }

  // 뺀 필수 과목(대신할 과목이 없음)은 되살릴 수 있게 따로 보여 준다
  const restore = (c) => {
    setRemoved((r) => r.filter((x) => x !== c))
    edit((ts) => {
      let t = ts.find((x) => key(x) === key(c))
      if (!t) {
        t = { year: c.year, semester: c.semester, grade: c.year - entryYear + 1, courses: [] }
        ts.push(t)
      }
      t.courses.push(c)
      return ts.sort((a, b) => a.year - b.year || a.semester.localeCompare(b.semester))
    })
  }
  const removedRequired = removed.filter((c) => !c.alternatives?.length && !c.code.startsWith('ROADMAP-FREE') && !used.has(c.code))
  const unmet = check ? check.requirements.filter((r) => r.status === 'unmet') : []
  const manual = check ? check.requirements.filter((r) => r.status === 'manual' || r.status === 'unknown') : []
  const edited = plan && JSON.stringify(terms.map((t) => t.courses.map((c) => `${key(c)}${c.code}`)))
    !== JSON.stringify(plan.terms.map((t) => t.courses.map((c) => `${key(c)}${c.code}`)))
  const lastRegular = { year: entryYear + 3, semester: '2학기' }
  const overflow = terms.filter((t) => t.courses.length && (t.year > lastRegular.year)).length

  // 지금 듣고 있는 학기(계획 시작 바로 앞 학기)에 입력한 과목이 없으면 알려 준다
  const start = plan?.start
  const current = start && (start.semester === '1학기' ? { year: start.year - 1, semester: '2학기' } : { year: start.year, semester: '1학기' })
  const currentMissing = current && current.year >= entryYear
    && !taken.some((t) => t.year === current.year && t.semester === current.semester)

  return (
    <div className="app roadmap">
      <header className="setup-head">
        <button type="button" className="btn-link setup-back" onClick={onBack}>← 홈으로</button>
        <h1 className="brand" aria-label="trAIl"><BrandMark /><span>졸업 로드맵</span></h1>
        <p className="subtitle">남은 졸업요건을 채우는 학기별 수강 계획이에요. 과목마다 학기를 옮기거나, 다른 과목으로 바꾸거나, 뺄 수 있어요. 고칠 때마다 졸업요건을 다시 확인해요.</p>
      </header>
      {simulating && <div className="banner banner-warn" role="status">시뮬레이션 중이라 바꾼 조건으로 계획했어요. 넣은 과목도 시뮬레이션에만 반영돼요.</div>}

      <div className="panel roadmap-controls">
        <label className="field inline">
          <span>한 학기 최대</span>
          <select value={maxCredits} onChange={(e) => setMaxCredits(Number(e.target.value))}>
            {CREDIT_LIMITS.map((c) => <option key={c} value={c}>{c}학점</option>)}
          </select>
        </label>
        {plan && <span className="muted">{plan.start.year}년 {plan.start.semester}부터 · 계획 {sumCredits(planned)}학점</span>}
        {edited && <button type="button" className="btn-link" onClick={() => setReload((n) => n + 1)}>처음 계획으로</button>}
        {planned.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => addTerms(terms)}>전체 계획을 수강 예정으로 넣기</button>
        )}
      </div>

      {currentMissing && (
        <div className="banner banner-warn" role="status">
          지금 듣고 있는 {current.year}년 {current.semester} 과목이 아직 없어요. 프로필 설정 → 들은 과목에서 <b>수강 예정</b>으로 넣으면 계획이 더 정확해져요.
        </div>
      )}
      {message && <p className="ok" role="status">{message}</p>}
      {error && <div className="banner banner-error" role="alert">계획을 만들지 못했어요: {error}</div>}
      {!plan && !error && <div className="panel empty">계획 짜는 중…</div>}

      {plan && check && (
        <div className={`banner ${unmet.length ? 'banner-warn' : 'banner-ok'}`} role="status">
          {unmet.length === 0
            ? <><b>✓ 이 계획대로면 학점·과목 졸업요건을 모두 채워요.</b>{overflow > 0 && ` 다만 4학년 2학기를 넘는 학기가 ${overflow}개 있어요 — 학기당 학점을 늘리거나 계절학기를 고려해 보세요.`}</>
            : (
              <>
                <b>이 계획으로는 못 채우는 요건이 있어요:</b> {unmet.map((r) => r.label).join(' · ')}
                {removedRequired.length > 0 && (
                  <p className="roadmap-removed">
                    뺀 필수 과목은 대신할 과목이 없어요:{' '}
                    {removedRequired.map((c) => (
                      <button key={c.code} type="button" className="btn-link" onClick={() => restore(c)}>{c.name} 다시 넣기</button>
                    ))}
                    <span className="muted"> (이미 들었거나 이번 학기에 듣는 중이면 들은 과목에 넣어 주세요)</span>
                  </p>
                )}
                <div><button type="button" className="btn btn-sm" disabled={busy} onClick={refill}>{busy ? '채우는 중…' : '남은 요건 다시 채우기'}</button></div>
              </>
            )}
          {manual.length > 0 && <p className="muted">과목으로 채울 수 없는 요건(직접 확인): {manual.map((r) => r.label).join(' · ')}</p>}
        </div>
      )}

      {plan && terms.length === 0 && unmet.length === 0 && <div className="panel empty">더 들어야 할 과목이 없어요. 🎉</div>}
      {plan && (
        <ol className="roadmap-terms">
          {terms.map((t) => {
            const credits = (base[key(t)] ?? 0) + sumCredits(t.courses)
            return (
              <li key={key(t)} className="panel roadmap-term">
                <div className="roadmap-term-head">
                  <h2>{t.grade}학년 {t.semester} <span className="muted">{t.year}년</span></h2>
                  <span className={`chip${credits > maxCredits ? ' chip-over' : ''}`}>{credits}학점{credits > maxCredits ? ` · ${maxCredits}학점 초과` : ''}</span>
                </div>
                {base[key(t)] > 0 && <p className="muted">이미 넣어 둔 수강 예정 {base[key(t)]}학점 포함</p>}
                {t.courses.length > 0 ? (
                  <>
                    <ul className="roadmap-courses">
                      {t.courses.map((c) => (
                        <CourseRow key={c.code} c={c} terms={allTerms} used={used}
                          onMove={(to) => move(c, to)} onSwap={(code) => swap(c, code)} onRemove={() => remove(c)} />
                      ))}
                    </ul>
                    <button type="button" className="btn btn-sm" onClick={() => addTerms([t])}>이 학기만 수강 예정으로 넣기</button>
                  </>
                ) : <p className="muted">새로 넣을 과목 없음</p>}
              </li>
            )
          })}
        </ol>
      )}
      {plan && (
        <p className="muted roadmap-note">
          규칙으로 짠 추천이에요. 실제 개설 여부·시간표·선수과목은 수강신청 전에 꼭 확인하세요.
        </p>
      )}
    </div>
  )
}
