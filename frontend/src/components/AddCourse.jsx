import { useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'
import { GRADES } from './CourseEditor.jsx'
import { RgBadge, termKey, useRelativeGrading } from './RelativeGrading.jsx'

const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
const newId = () => Math.random().toString(36).slice(2, 10)
const squash = (s) => (s ?? '').replace(/\s/g, '').toLowerCase()

// 요건(pick)에 맞는 과목인지 — 전공이면 전공 과목, 교양 영역이면 그 영역 과목만
function fits(pick, c) {
  if (!pick || pick.program) return true
  if (pick.categories && !pick.categories.includes(c.category)) return false
  if (pick.area && (c.area !== pick.area || !pick.sub_areas?.includes(c.sub_area))) return false
  if (pick.sdg && !c.sdg) return false
  return true
}

// 목록에 없는 과목을 이 요건에 넣을 때의 분류
function manualCategory(pick) {
  if (!pick || pick.program) return {}
  const category = pick.categories?.[0]
  if (category !== '교양') return category ? { category } : {}
  return { category, area: pick.area ?? null, sub_area: pick.sub_areas?.[0] ?? null }
}

// 홈의 과목 창 안에서 바로 과목을 찾아 넣는다
export default function AddCourse({ req, report, taken, onAdd }) {
  const pick = req.pick
  const entryYear = report.entry_year
  const programCodes = useMemo(() => report.programs.map((p) => p.code), [report.programs])
  const lastYear = Math.max(entryYear, ...taken.map((t) => t.year ?? entryYear))
  const [year, setYear] = useState(Math.min(lastYear, new Date().getFullYear()))
  const [semester, setSemester] = useState('1학기')
  const [grade, setGrade] = useState('A0')
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [manual, setManual] = useState(null) // { name, credits }
  const [courses, setCourses] = useState([])
  const [added, setAdded] = useState(null)
  const rg = useRelativeGrading(entryYear, programCodes)

  useEffect(() => {
    let alive = true
    const load = pick?.program && !all
      ? api.getProgramCourses(entryYear, pick.program).then((p) => p.courses.map((c) => ({ ...c, category: c.type })))
      : api.getCatalog(entryYear, year, programCodes).then((c) => c.courses)
    load.then((list) => alive && setCourses(list)).catch(() => alive && setCourses([]))
    return () => {
      alive = false
    }
  }, [entryYear, year, programCodes, pick?.program, all])

  const have = new Set(taken.map((t) => t.code))
  const missing = new Set((req.missing ?? []).map((m) => m.code))
  const list = useMemo(() => {
    const q = squash(query)
    return courses
      .filter((c) => all || fits(pick, c))
      .filter((c) => !q || squash(c.name).includes(q) || c.code.toLowerCase().includes(q))
      .sort((a, b) => missing.has(b.code) - missing.has(a.code) || have.has(a.code) - have.has(b.code)
        || (a.grade ?? 9) - (b.grade ?? 9) || a.name.localeCompare(b.name))
      .slice(0, 40)
  }, [courses, query, all, pick]) // eslint-disable-line react-hooks/exhaustive-deps

  const term = { year, semester, grade: grade || null }
  const addCourse = (c) => {
    onAdd({ id: newId(), code: c.code, ...term, ...(pick?.program ? { counts_for: pick.program } : {}) })
    setAdded(c.name)
  }
  const addManual = (e) => {
    e.preventDefault()
    if (!manual.name.trim()) return
    onAdd({ id: newId(), code: `ETC-${newId()}`, name: manual.name.trim(), credits: Number(manual.credits) || 0, ...term,
            ...manualCategory(pick), ...(pick?.program ? { counts_for: pick.program } : {}) })
    setAdded(manual.name.trim())
    setManual(null)
  }

  const years = Array.from({ length: Math.max(6, lastYear - entryYear + 2) }, (_, i) => entryYear + i)
  return (
    <div className="add-course">
      <h3>과목 추가</h3>
      <div className="row add-term">
        <select aria-label="수강 연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select aria-label="학기" value={semester} onChange={(e) => setSemester(e.target.value)}>
          {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="성적" value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="">수강 예정</option>
        </select>
      </div>

      {manual ? (
        <form className="row" onSubmit={addManual}>
          <input className="grow" type="text" placeholder="과목명 (타 대학·교환학생 등)" value={manual.name} maxLength={100} autoFocus
            onChange={(e) => setManual({ ...manual, name: e.target.value })} />
          <input className="narrow" type="number" min="0" max="30" aria-label="학점" value={manual.credits}
            onChange={(e) => setManual({ ...manual, credits: e.target.value })} />
          <button type="submit" className="btn btn-primary" disabled={!manual.name.trim()}>추가</button>
          <button type="button" className="btn-link" onClick={() => setManual(null)}>취소</button>
        </form>
      ) : (
        <>
          <input type="search" placeholder="과목명 또는 코드로 찾기" aria-label="추가할 과목 검색" value={query}
            onChange={(e) => setQuery(e.target.value)} />
          {pick && (
            <label className="check">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              <span>이 요건과 상관없이 전체 과목에서 찾기</span>
            </label>
          )}
          <ul className="add-list">
            {list.length === 0 && <li className="muted">찾는 과목이 없어요.</li>}
            {list.map((c) => (
              <li key={c.code}>
                <span className="c-main">
                  <span className="c-name">{c.name} {!have.has(c.code) && <RgBadge rg={rg} code={c.code} term={termKey(year, semester)} />}</span>
                  <span className="c-meta">
                    {c.credits}학점{c.grade ? ` · ${c.grade}학년` : ''}{c.sub_area ? ` · ${c.sub_area}` : ''}
                    {c.program ? ` · ${c.program}` : ''}{missing.has(c.code) ? ' · 아직 안 들은 필수' : ''}
                  </span>
                </span>
                {have.has(c.code)
                  ? <span className="muted">추가됨</span>
                  : <button type="button" className="btn btn-sm" onClick={() => addCourse(c)}>추가</button>}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-link" onClick={() => setManual({ name: query, credits: 3 })}>
            목록에 없는 과목 직접 입력
          </button>
        </>
      )}
      {added && <p className="ok" role="status">{added} 추가했어요.</p>}
    </div>
  )
}
