import { useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'
import ImportPanel from './ImportPanel.jsx'
import BrowsePanel from './BrowsePanel.jsx'

export const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'P', 'F', 'NP', '이수']
const PLANNED = '' // 성적 없음 = 수강 예정
const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
const SLOTS = [1, 2, 3, 4].flatMap((g) => ['1학기', '2학기'].map((s) => ({ grade: g, semester: s })))

const newId = () => Math.random().toString(36).slice(2, 10)
const semesterOrder = (s) => SEMESTERS.indexOf(s)

function categoryLabel(c) {
  if (!c) return ''
  if (c.program) return `다전공 · ${c.program}`
  if (c.category === '교양') return [c.area, c.sub_area].filter(Boolean).join(' · ') || '교양'
  return c.category
}

const PRIMARY = 'primary'

// 주전공·다전공 양쪽에 해당하는 과목: 어느 쪽에 인정할지 고르게 한다 (한 과목은 한 곳에만 인정)
function CountsFor({ info, course, programNames, onChange }) {
  if (!info || info.eligible.length < 2) return null
  const name = (pool) => (pool === PRIMARY ? '인공지능전공' : programNames[pool] ?? pool)
  return (
    <select className="counts-for" aria-label={`${info.name} 인정 전공`} value={course.counts_for ?? ''}
      onChange={(e) => onChange(e.target.value || null)}>
      <option value="">자동 ({name(info.counts_for)})</option>
      {info.eligible.map((pool) => <option key={pool} value={pool}>{name(pool)}</option>)}
    </select>
  )
}

export default function CourseEditor({ entryYear, aiEnabled, programs = [], programCodes = [], taken, report, onChange }) {
  const [showImport, setShowImport] = useState(false)
  const [year, setYear] = useState(entryYear)
  const [semester, setSemester] = useState('1학기')
  const [grade, setGrade] = useState('A0')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [mode, setMode] = useState('browse') // browse: 분류로 찾기 / search: 과목 검색 / manual: 목록에 없는 과목
  const manual = mode === 'manual'
  const [manualCourse, setManualCourse] = useState({ name: '', credits: 3 })
  const [catalog, setCatalog] = useState([])
  const [fillUntil, setFillUntil] = useState(0)
  const [fillNextPlanned, setFillNextPlanned] = useState(true)

  useEffect(() => setYear(entryYear), [entryYear])

  useEffect(() => {
    let alive = true
    api.getCatalog(entryYear, year, programCodes).then((c) => alive && setCatalog(c.courses)).catch(() => {})
    return () => {
      alive = false
    }
  }, [entryYear, year, programCodes])

  const results = useMemo(() => {
    const q = query.trim().replace(/\s/g, '').toLowerCase()
    if (!q || picked) return []
    return catalog
      .filter((c) => c.name.replace(/\s/g, '').toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .slice(0, 8)
  }, [catalog, query, picked])

  const add = (courses) => onChange([...taken, ...courses.map((c) => ({ id: newId(), ...c }))])

  const addPicked = (e) => {
    e.preventDefault()
    if (manual) {
      if (!manualCourse.name.trim()) return
      add([{ code: `ETC-${newId()}`, name: manualCourse.name.trim(), credits: Number(manualCourse.credits) || 0,
             year, semester, grade: grade || null }])
      setManualCourse({ name: '', credits: 3 })
    } else {
      if (!picked) return
      add([{ code: picked.code, year, semester, grade: grade || null }])
      setPicked(null)
      setQuery('')
    }
  }

  const fillStandardPlan = async () => {
    const { plan } = await api.getStandardPlan(entryYear)
    const have = new Set(taken.map((t) => t.code))
    const rank = (p) => (p.grade - 1) * 2 + (p.semester === '2학기' ? 1 : 0)
    const courses = plan
      .filter((p) => !have.has(p.code))
      .filter((p) => rank(p) <= fillUntil || (fillNextPlanned && rank(p) === fillUntil + 1))
      .map((p) => ({
        code: p.code,
        year: entryYear + p.grade - 1,
        semester: p.semester,
        grade: rank(p) <= fillUntil ? '이수' : null,
      }))
    add(courses)
  }

  const addFromBrowse = (course) => add([{ ...course, year, semester, grade: grade || null }])
  const takenCodes = useMemo(() => new Set(taken.map((t) => t.code)), [taken])
  const myPrograms = useMemo(
    () => programCodes.map((code) => programs.find((p) => p.code === code)).filter(Boolean),
    [programCodes, programs],
  )

  const setRow = (id, patch) => onChange(taken.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const remove = (id) => onChange(taken.filter((t) => t.id !== id))

  const infoByCode = useMemo(() => Object.fromEntries((report?.courses ?? []).map((c) => [c.code, c])), [report])
  const programNames = useMemo(() => Object.fromEntries((report?.programs ?? []).map((p) => [p.code, p.name])), [report])
  const excluded = report?.excluded ?? []
  const isExcluded = (t) =>
    excluded.find((x) => x.code === t.code && x.year === t.year && (x.grade ?? null) === (t.grade ?? null))

  const groups = useMemo(() => {
    const sorted = [...taken].sort((a, b) => a.year - b.year || semesterOrder(a.semester) - semesterOrder(b.semester))
    const map = new Map()
    for (const t of sorted) {
      const key = `${t.year}년 ${t.semester ?? ''}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return [...map.entries()]
  }, [taken])

  return (
    <div className="card">
      <h2>들은 과목</h2>

      {showImport ? (
        <ImportPanel entryYear={entryYear} aiEnabled={aiEnabled} programCodes={programCodes} taken={taken}
          onAdd={add} onClose={() => setShowImport(false)} />
      ) : (
        <button type="button" className="btn btn-import" onClick={() => setShowImport(true)}>
          성적표·시간표 붙여넣어 한 번에 가져오기
        </button>
      )}

      <div className="quick-fill">
        <label className="field">
          <span>빠르게 채우기: 표준 이수 모형대로</span>
          <select value={fillUntil} onChange={(e) => setFillUntil(Number(e.target.value))}>
            {SLOTS.map((s, i) => (
              <option key={i} value={i}>{s.grade}학년 {s.semester}까지 이수</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={fillNextPlanned} onChange={(e) => setFillNextPlanned(e.target.checked)} />
          <span>다음 학기 과목은 수강 예정으로 추가</span>
        </label>
        <button type="button" className="btn" onClick={fillStandardPlan}>채우기</button>
      </div>

      <form className="add-form" onSubmit={addPicked}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'browse'} className={mode === 'browse' ? 'on' : ''} onClick={() => setMode('browse')}>분류로 찾기</button>
          <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}>과목명 검색</button>
        </div>

        {mode === 'browse' ? (
          <BrowsePanel entryYear={entryYear} catalog={catalog} programs={programs} myPrograms={myPrograms}
            takenCodes={takenCodes} onAdd={addFromBrowse} />
        ) : manual ? (
          <div className="row">
            <input className="grow" type="text" placeholder="과목명" value={manualCourse.name} maxLength={100}
              onChange={(e) => setManualCourse({ ...manualCourse, name: e.target.value })} />
            <input className="narrow" type="number" min="0" max="30" aria-label="학점" value={manualCourse.credits}
              onChange={(e) => setManualCourse({ ...manualCourse, credits: e.target.value })} />
          </div>
        ) : (
          <div className="search">
            <input
              type="search"
              placeholder="과목명 또는 코드 (예: 기계학습, 글쓰기)"
              value={picked ? `${picked.name} (${picked.credits}학점)` : query}
              onChange={(e) => {
                setPicked(null)
                setQuery(e.target.value)
              }}
              aria-label="과목 검색"
            />
            {results.length > 0 && (
              <ul className="results" role="listbox">
                {results.map((c) => (
                  <li key={c.code} role="option" aria-selected="false" onClick={() => setPicked(c)}>
                    <span className="r-name">{c.name}</span>
                    <span className="r-meta">{c.credits}학점 · {categoryLabel(c)}{c.sdg ? ' · SDG' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="row">
          <select aria-label="수강 연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => entryYear + i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select aria-label="학기" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="성적" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value={PLANNED}>수강 예정</option>
          </select>
          {mode !== 'browse' && (
            <button type="submit" className="btn btn-primary" disabled={manual ? !manualCourse.name.trim() : !picked}>추가</button>
          )}
        </div>
        {manual ? (
          <button type="button" className="btn-link" onClick={() => setMode('browse')}>← 목록에서 고르기</button>
        ) : (
          <button type="button" className="btn-link" onClick={() => setMode('manual')}>
            목록에 없는 과목 (타 대학·교환학생 학점 등)
          </button>
        )}
      </form>

      {taken.length === 0 ? (
        <p className="muted">아직 입력한 과목이 없습니다. 신입생이라면 비워 둔 채로 졸업까지 필요한 것을 확인할 수 있어요.</p>
      ) : (
        <>
          <div className="list-head">
            <span className="muted">{taken.length}과목</span>
            <button type="button" className="btn-link" onClick={() => onChange([])}>모두 지우기</button>
          </div>
          {groups.map(([label, rows]) => (
            <div key={label} className="term">
              <h3>{label}</h3>
              <ul className="course-list">
                {rows.map((t) => {
                  const info = infoByCode[t.code]
                  const ex = isExcluded(t)
                  return (
                    <li key={t.id} className={ex ? 'excluded' : ''}>
                      <div className="c-main">
                        <span className="c-name">{info?.name ?? t.name ?? t.code}</span>
                        <span className="c-meta">
                          {(info?.credits ?? t.credits ?? '?')}학점 · {categoryLabel(info) || '…'}
                          {ex && <em> · 제외: {ex.reason}</em>}
                        </span>
                        <CountsFor info={info} course={t} programNames={programNames}
                          onChange={(v) => setRow(t.id, { counts_for: v })} />
                      </div>
                      <select aria-label="성적" value={t.grade ?? PLANNED} onChange={(e) => setRow(t.id, { grade: e.target.value || null })}>
                        {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                        <option value={PLANNED}>예정</option>
                      </select>
                      <button type="button" className="icon-btn" aria-label={`${info?.name ?? t.code} 삭제`} onClick={() => remove(t.id)}>✕</button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
