import Meter from './Meter.jsx'

export const STATUS = {
  met: { icon: '✓', label: '충족', tone: 'good' },
  planned: { icon: '◔', label: '예정 포함 충족', tone: 'warning' },
  unmet: { icon: '✕', label: '부족', tone: 'critical' },
  waived: { icon: '–', label: '면제', tone: 'neutral' },
  manual: { icon: '!', label: '본인 확인', tone: 'neutral' },
  unknown: { icon: '?', label: '기준 확인 중', tone: 'neutral' },
}

function Badge({ status }) {
  const s = STATUS[status]
  return (
    <span className={`badge tone-${s.tone}`}>
      <span className="badge-icon" aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  )
}

function Progress({ r }) {
  if (r.required == null) {
    // 기준을 모르는 다전공 학점 — 지금까지 모은 학점만 보여준다
    return r.earned == null ? null : (
      <span className="numbers">
        <strong>{r.earned}</strong>
        {r.planned > 0 && <span className="plus"> +{r.planned}</span>}
        <span className="of"> {r.unit} 이수</span>
      </span>
    )
  }
  return (
    <span className="numbers">
      <strong>{r.earned}</strong>
      {r.planned > 0 && <span className="plus"> +{r.planned}</span>}
      <span className="of"> / {r.required}{r.unit}</span>
    </span>
  )
}

// 'program:1403:credits' → '1403' (다전공 과목은 그 전공에 인정되도록 표시해서 추가)
const poolOf = (r) => (r.id.startsWith('program:') ? r.id.split(':')[1] : null)

function PlanButton({ course, r, onPlan, planned }) {
  if (!onPlan) return null
  return planned.has(course.code) ? (
    <span className="muted">예정에 있음</span>
  ) : (
    <button type="button" className="btn-link" onClick={() => onPlan(course, poolOf(r))}
      aria-label={`${course.name} 수강 예정으로 추가`}>+ 예정</button>
  )
}

// 들어야 하는 선택 과목 — 학년별로 묶어 접어 둔다
function Options({ r, onPlan, planned }) {
  const byGrade = new Map()
  for (const c of r.options) {
    const key = c.grade ? `${c.grade}학년` : '학년 무관'
    if (!byGrade.has(key)) byGrade.set(key, [])
    byGrade.get(key).push(c)
  }
  return (
    <details className="options">
      <summary>{r.options_label ?? '들을 수 있는 과목'} {r.options.length}개</summary>
      {[...byGrade.entries()].map(([grade, list]) => (
        <div key={grade} className="opt-group">
          <h4>{grade}</h4>
          <ul>
            {list.map((c) => (
              <li key={c.code}>
                <span>{c.name}</span>
                <span className="muted">{c.credits}학점{c.semester ? ` · ${c.semester}` : ''}</span>
                <PlanButton course={c} r={r} onPlan={onPlan} planned={planned} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}

function Requirement({ r, onPlan, planned }) {
  return (
    <li className="req">
      <div className="req-head">
        <span className="req-label">{r.label}</span>
        <Progress r={r} />
        <Badge status={r.status} />
      </div>
      {r.required != null && <Meter earned={r.earned} planned={r.planned} required={r.required} unit={r.unit} label={r.label} />}

      {r.missing?.length > 0 && (
        <ul className="missing">
          {r.missing.map((m) => (
            <li key={m.code}>
              <span>{m.name}</span>
              <span className="muted">{m.credits}학점{m.recommended ? ` · 권장 ${m.recommended}` : ''}</span>
              <PlanButton course={m} r={r} onPlan={onPlan} planned={planned} />
            </li>
          ))}
        </ul>
      )}
      {r.options?.length > 0 && r.status !== 'met' && <Options r={r} onPlan={onPlan} planned={planned} />}
      {r.examples?.length > 0 && <p className="hint">추천: {r.examples.slice(0, 3).join(', ')}</p>}
      {r.note && r.status !== 'met' && <p className="hint">※ {r.note}</p>}
      {r.if_incomplete && r.status !== 'met' && <p className="hint hint-strong">못 채우면: {r.if_incomplete}</p>}
      {r.required == null && r.status !== 'met' && r.alternatives?.length > 0 && (
        <p className="hint">{r.alternatives.join(' / ')}</p>
      )}
      {r.required != null && r.alternatives?.length > 0 && r.status !== 'met' && (
        <details className="alts">
          <summary>다른 인정 방법</summary>
          <ul>{r.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      )}
    </li>
  )
}

export default function Dashboard({ report, onPlan }) {
  const planned = new Set(report.courses.map((c) => c.code))
  const byId = Object.fromEntries(report.requirements.map((r) => [r.id, r]))
  const total = byId.total
  const groups = [...new Set(report.requirements.map((r) => r.group))].filter((g) => g !== '졸업학점')
  const blocking = report.requirements.filter((r) => r.status === 'unmet')
  const remaining = Math.max(total.required - total.earned, 0)

  return (
    <>
      {report.ruleset.status !== 'confirmed' && (
        <div className="banner banner-warn" role="status">
          <strong>{report.entry_year}학번 졸업요건은 아직 확정 공지 전이라</strong> 이전 학번 기준으로 계산했어요. 바뀔 수 있습니다.
        </div>
      )}

      <div className="panel hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">총 이수학점</p>
            <p className="hero-figure">
              {total.earned}<span className="hero-of">/{total.required}학점</span>
            </p>
            <p className="muted">
              {total.planned > 0 && <>수강 예정 {total.planned}학점 포함 시 {total.earned + total.planned}학점 · </>}
              졸업까지 {remaining}학점
            </p>
          </div>
          <div className="hero-status">
            {report.summary.graduation_ready ? (
              <Badge status="met" />
            ) : (
              <p className="count"><strong>{report.summary.met}</strong> / {report.summary.total} 요건 충족</p>
            )}
          </div>
        </div>
        <Meter earned={total.earned} planned={total.planned} required={total.required} unit="학점" label="총 이수학점" large />
        <div className="legend" aria-hidden="true">
          <span><i className="sw sw-earned" />이수</span>
          <span><i className="sw sw-planned" />수강 예정</span>
          <span><i className="sw sw-track" />남은 학점</span>
        </div>
        {blocking.length > 0 && (
          <p className="blocking">
            <span className="muted">아직 부족:</span> {blocking.map((r) => r.label).join(' · ')}
          </p>
        )}
      </div>

      <div className="kpis">
        {['major', 'major_required', 'liberal_arts'].map((id) => {
          const r = byId[id]
          return (
            <div key={id} className="panel kpi">
              <p className="eyebrow">{id === 'major_required' ? '전공필수' : r.label.replace(' (전공필수 포함)', '')}</p>
              <p className="kpi-value">
                {r.earned}
                {r.planned > 0 && <span className="plus">+{r.planned}</span>}
                <span className="of">/{r.required}{r.unit}</span>
              </p>
              <Meter earned={r.earned} planned={r.planned} required={r.required} unit={r.unit} label={r.label} />
              <Badge status={r.status} />
            </div>
          )
        })}
      </div>

      {groups.map((g) => (
        <div key={g} className="panel">
          <h2>{g}</h2>
          <ul className="reqs">
            {report.requirements.filter((r) => r.group === g).map((r) => <Requirement key={r.id} r={r} onPlan={onPlan} planned={planned} />)}
          </ul>
        </div>
      ))}

      {report.warnings.length > 0 && (
        <div className="panel">
          <h2>확인해 주세요</h2>
          <ul className="warnings">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </>
  )
}
