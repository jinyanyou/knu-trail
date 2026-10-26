import { useMemo, useState } from 'react'
import BrandMark from './BrandMark.jsx'
import Mascot from './Mascot.jsx'
import { byTerm, gpa, graded, POINTS } from '../gpa.js'

const RETAKE_GRADES = ['A+', 'A0', 'A-', 'B+', 'B0', 'B-', 'C+']
const LOW = new Set(['C+', 'C0', 'C-', 'D+', 'D0', 'D-', 'F'])
const MAX = 4.3
const short = (t) => `${String(t.year).slice(2)}-${t.semester.replace('학기', '').replace('계절', '')}`

// 학기별 평점 막대 (하나의 계열 — 범례 없이 제목이 이름, 값은 막대 위에 직접 표시)
function TermChart({ terms }) {
  const w = 640
  const h = 200
  const pad = { top: 22, bottom: 30, left: 30, right: 8 }
  const bw = Math.min(46, (w - pad.left - pad.right) / terms.length - 10)
  const step = (w - pad.left - pad.right) / terms.length
  const y = (v) => pad.top + (h - pad.top - pad.bottom) * (1 - v / MAX)
  const best = Math.max(...terms.map((t) => t.gpa ?? 0))
  return (
    <svg className="gpa-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="학기별 평점 막대그래프">
      {[1, 2, 3, 4].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={w - pad.right} y1={y(v)} y2={y(v)} className="gpa-grid" />
          <text x={pad.left - 6} y={y(v) + 4} className="gpa-axis" textAnchor="end">{v}.0</text>
        </g>
      ))}
      {terms.map((t, i) => {
        const x = pad.left + step * i + (step - bw) / 2
        return (
          <g key={`${t.year}${t.semester}`}>
            <title>{`${t.year}년 ${t.semester}: 평점 ${t.gpa?.toFixed(2) ?? '-'} · ${t.credits}학점`}</title>
            <rect x={x - 4} y={pad.top} width={bw + 8} height={h - pad.top - pad.bottom} className="gpa-hit" />
            {t.gpa != null && (
              <path className={`gpa-bar${t.gpa === best ? ' best' : ''}`}
                d={`M${x},${y(0)} V${y(t.gpa) + 4} Q${x},${y(t.gpa)} ${x + 4},${y(t.gpa)} H${x + bw - 4} Q${x + bw},${y(t.gpa)} ${x + bw},${y(t.gpa) + 4} V${y(0)} Z`} />
            )}
            <text x={x + bw / 2} y={y(t.gpa ?? 0) - 5} textAnchor="middle" className="gpa-value">{t.gpa?.toFixed(2) ?? '-'}</text>
            <text x={x + bw / 2} y={h - 10} textAnchor="middle" className="gpa-axis">{short(t)}</text>
          </g>
        )
      })}
      <line x1={pad.left} x2={w - pad.right} y1={y(0)} y2={y(0)} className="gpa-base" />
    </svg>
  )
}

// #/grades — 평점 통계와 재수강 계산
export default function Grades({ report, onBack }) {
  const courses = useMemo(() => graded(report), [report])
  const terms = useMemo(() => byTerm(courses), [courses])
  const [retake, setRetake] = useState({}) // {code: 목표 성적}

  const all = gpa(courses)
  const major = gpa(courses.filter((c) => c.category === '전공필수' || c.category === '전공'))
  const earned = report.courses.filter((c) => !c.planned).reduce((s, c) => s + (c.credits || 0), 0)
  const low = courses.filter((c) => LOW.has(c.grade))
  const after = gpa(courses.map((c) => (retake[c.code] ? { ...c, grade: retake[c.code] } : c)))

  if (!courses.length) {
    return (
      <div className="app grades">
      <header className="setup-head">
        <button type="button" className="btn-link setup-back" onClick={onBack}>← 홈으로</button>
        <h1 className="brand"><a className="brand-link" href="#" aria-label="trAIl 홈으로"><BrandMark /></a><span>성적 통계</span></h1>
        <p className="subtitle">경북대 4.3 만점 기준 · 성적증명서처럼 소수 셋째 자리에서 버림 · P/S 과목은 평점에서 제외</p>
      </header>
        <div className="panel empty with-mascot"><Mascot pose="report" size={72} />성적이 있는 과목이 아직 없어요. 프로필 설정에서 성적표를 가져와 보세요.</div>
      </div>
    )
  }
  return (
    <div className="app grades">
      <header className="setup-head">
        <button type="button" className="btn-link setup-back" onClick={onBack}>← 홈으로</button>
        <h1 className="brand"><a className="brand-link" href="#" aria-label="trAIl 홈으로"><BrandMark /></a><span>성적 통계</span></h1>
        <p className="subtitle">경북대 4.3 만점 기준 · 성적증명서처럼 소수 셋째 자리에서 버림 · P/S 과목은 평점에서 제외</p>
      </header>

      <div className="kpis" style={{ '--kpi-cols': 3 }}>
        <div className="panel kpi"><p className="eyebrow">전체 평점</p><p className="kpi-value">{all?.toFixed(2)}<span className="of">/4.3</span></p></div>
        <div className="panel kpi"><p className="eyebrow">전공 평점</p><p className="kpi-value">{major?.toFixed(2) ?? '-'}<span className="of">/4.3</span></p></div>
        <div className="panel kpi"><p className="eyebrow">취득 학점</p><p className="kpi-value">{earned}<span className="of">학점</span></p></div>
      </div>

      <div className="panel">
        <h2>학기별 평점</h2>
        <TermChart terms={terms} />
        <details className="alts">
          <summary>표로 보기</summary>
          <table className="gpa-table">
            <thead><tr><th>학기</th><th>평점</th><th>평점 반영 학점</th><th>과목</th></tr></thead>
            <tbody>
              {terms.map((t) => (
                <tr key={`${t.year}${t.semester}`}>
                  <td>{t.year}년 {t.semester}</td><td>{t.gpa?.toFixed(2)}</td><td>{t.credits}</td>
                  <td>{t.courses.map((c) => `${c.name} ${c.grade}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="panel">
        <h2>재수강하면 평점이 얼마나 오를까?</h2>
        {low.length === 0 ? (
          <p className="muted">C+ 이하 과목이 없어요.</p>
        ) : (
          <>
            <p className="muted">C+ 이하 과목에 재수강 목표 성적을 골라 보세요. 재수강하면 이전 성적은 평점에서 빠져요.</p>
            <ul className="course-list retake-list">
              {low.map((c) => (
                <li key={`${c.code}${c.year}`}>
                  <div className="c-main">
                    <span className="c-name">{c.name}</span>
                    <span className="c-meta">{c.year}년 {c.semester} · {c.credits}학점 · 지금 {c.grade}</span>
                  </div>
                  <select aria-label={`${c.name} 재수강 목표 성적`} value={retake[c.code] ?? ''}
                    onChange={(e) => setRetake({ ...retake, [c.code]: e.target.value || undefined })}>
                    <option value="">재수강 안 함</option>
                    {RETAKE_GRADES.filter((g) => POINTS[g] > POINTS[c.grade]).map((g) => <option key={g}>{g}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <p className="retake-result">
              전체 평점 <b>{all?.toFixed(2)}</b> → <b className={after > all ? 'up' : ''}>{after?.toFixed(2)}</b>
              {after > all && <span className="muted"> (+{(after - all).toFixed(2)})</span>}
            </p>
            <p className="muted">재수강 가능 성적·최고 성적 제한·횟수는 학교 학사 규정을 확인하세요.</p>
          </>
        )}
      </div>
    </div>
  )
}
