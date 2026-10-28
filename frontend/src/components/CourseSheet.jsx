import { useEffect } from 'react'
import { GRADES } from './CourseEditor.jsx'
import CategoryPicker from './CategoryPicker.jsx'
import RetakeEdit from './RetakeEdit.jsx'
import AddCourse from './AddCourse.jsx'

const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
const termKey = (c) => `${c.code}|${c.year}|${c.semester ?? ''}`

// 홈에서 요건(전공 학점·전공필수·교양 영역 등)을 누르면 뜨는 창: 그 요건에 들어간 과목을 바로 고친다
export default function CourseSheet({ req, report, taken, onChange, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const info = Object.fromEntries(report.courses.map((c) => [termKey(c), c]))
  const counted = new Set((req.counted ?? []).map(termKey))
  const rows = taken
    .filter((t) => counted.has(termKey(t)))
    .sort((a, b) => a.year - b.year || SEMESTERS.indexOf(a.semester) - SEMESTERS.indexOf(b.semester))

  // 같은 과목인데 계산에서 빠진 입력(중복·예정 중복·재이수 이전 기록) — 여기서 바로 지울 수 있게
  const codes = new Set(rows.map((t) => t.code))
  const reasons = Object.fromEntries((report.excluded ?? []).map((x) => [`${x.code}|${x.year}|${x.grade ?? ''}`, x.reason]))
  const extra = taken.filter((t) => codes.has(t.code) && !counted.has(termKey(t)))

  const setRow = (id, patch) => onChange(taken.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const remove = (id) => onChange(taken.filter((t) => t.id !== id))
  const years = [...new Set([...rows.map((t) => t.year), ...Array.from({ length: 6 }, (_, i) => report.entry_year + i)])].sort()

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet panel" role="dialog" aria-modal="true" aria-label={`${req.label} 과목`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>{req.label}</h2>
            <p className="muted">
              {req.earned}{req.planned > 0 ? ` +${req.planned}` : ''}{req.required != null ? ` / ${req.required}${req.unit}` : ` ${req.unit ?? ''}`}
              {' · '}{rows.length}과목
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>✕</button>
        </div>

        {rows.length === 0 ? (
          <p className="muted">아직 이 요건에 들어간 과목이 없어요.</p>
        ) : (
          <ul className="course-list sheet-list">
            {rows.map((t) => {
              const c = info[termKey(t)]
              return (
                <li key={t.id}>
                  <div className="c-main">
                    <span className="c-name">{c?.name ?? t.name ?? t.code}</span>
                    <span className="c-meta">{c?.credits ?? t.credits ?? '?'}학점{c?.program ? ` · ${c.program}` : ''}</span>
                    <CategoryPicker course={t} info={c} areas={report.liberal_areas} programs={report.programs}
                      onChange={(patch) => setRow(t.id, patch)} />
                    <RetakeEdit course={t} entryYear={report.entry_year} onChange={(patch) => setRow(t.id, patch)} />
                  </div>
                  <select aria-label="연도" value={t.year} onChange={(e) => setRow(t.id, { year: Number(e.target.value) })}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select aria-label="학기" value={t.semester ?? ''} onChange={(e) => setRow(t.id, { semester: e.target.value })}>
                    {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <select aria-label="성적" value={t.grade ?? ''} onChange={(e) => setRow(t.id, { grade: e.target.value || null })}>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="">예정</option>
                  </select>
                  <button type="button" className="icon-btn" aria-label={`${c?.name ?? t.code} 삭제`} onClick={() => remove(t.id)}>✕</button>
                </li>
              )
            })}
          </ul>
        )}

        {extra.length > 0 && (
          <div className="sheet-extra">
            <h3>계산에서 빠진 입력 {extra.length}개</h3>
            <ul className="course-list">
              {extra.map((t) => (
                <li key={t.id} className="excluded">
                  <div className="c-main">
                    <span className="c-name">{info[termKey(rows.find((r) => r.code === t.code))]?.name ?? t.name ?? t.code}</span>
                    <span className="c-meta">
                      {t.year}년 {t.semester} · {t.grade ?? '예정'}
                      <em> · {reasons[`${t.code}|${t.year}|${t.grade ?? ''}`] ?? '중복'}</em>
                    </span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => remove(t.id)}>지우기</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <AddCourse req={req} report={report} taken={taken} onAdd={(c) => onChange([...taken, c])} />
      </div>
    </div>
  )
}
