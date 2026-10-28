import { GRADES } from './CourseEditor.jsx'

const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
const ORDER = { '1학기': 0, 여름계절: 1, '2학기': 2, 겨울계절: 3 }

// 재수강 직접 표시 — 성적증명서엔 재수강 뒤 성적만 남아 이전 수강을 알 수 없다.
// 값: course.retake = { year, semester, grade } (모르는 칸은 null), 재수강 아님 = null
export default function RetakeEdit({ course, entryYear, onChange }) {
  if (!course.grade) return null // 수강 예정 과목은 아직 재수강 여부가 없다
  const r = course.retake
  if (!r) {
    return (
      <div className="retake-row">
        <button type="button" className="btn-link retake-toggle" onClick={() => onChange({ retake: { year: null, semester: null, grade: null } })}>
          재수강한 과목이면 표시
        </button>
      </div>
    )
  }
  const set = (patch) => onChange({ retake: { ...r, ...patch } })
  // 이전 수강은 이 과목을 들은 학기보다 앞이어야 한다
  const years = Array.from({ length: Math.max(1, (course.year ?? entryYear) - entryYear + 1) }, (_, i) => entryYear + i)
  const sems = SEMESTERS.filter((s) => r.year !== course.year || ORDER[s] < (ORDER[course.semester] ?? 4))
  return (
    <div className="retake-row retake-edit">
      <span className="retake-title"><span className="tc-flag tc-flag-after">재수강</span> 재수강 전 수강 (성적표엔 없음)</span>
      <select aria-label="이전 수강 연도" value={r.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}>
        <option value="">연도 모름</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select aria-label="이전 수강 학기" value={r.semester ?? ''} onChange={(e) => set({ semester: e.target.value || null })}>
        <option value="">학기 모름</option>
        {sems.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select aria-label="이전 성적" value={r.grade ?? ''} onChange={(e) => set({ grade: e.target.value || null })}>
        <option value="">성적 모름</option>
        {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <button type="button" className="btn-link" onClick={() => onChange({ retake: null })}>재수강 아님</button>
    </div>
  )
}
