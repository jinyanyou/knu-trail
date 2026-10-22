import Meter from './Meter.jsx'
import TrailPath from './TrailPath.jsx'
import Mascot from './Mascot.jsx'
import { RgBadge, RgNote, useRelativeGrading } from './RelativeGrading.jsx'

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
function Options({ r, onPlan, planned, rg }) {
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
                <span>{c.name} <RgBadge rg={rg} code={c.code} /></span>
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

function Requirement({ r, onPlan, planned, onOpen, rg }) {
  return (
    <li className="req">
      <div className="req-head">
        {r.counted ? (
          <button type="button" className="req-label req-open" onClick={() => onOpen(r.id)}>
            {r.label} <span className="req-count">과목 {r.counted.length}개 ›</span>
          </button>
        ) : (
          <span className="req-label">{r.label}</span>
        )}
        <Progress r={r} />
        <Badge status={r.status} />
      </div>
      {r.required != null && <Meter earned={r.earned} planned={r.planned} required={r.required} unit={r.unit} label={r.label} />}

      {r.missing?.length > 0 && (
        <ul className="missing">
          {r.missing.map((m) => (
            <li key={m.code}>
              <span>{m.name} <RgBadge rg={rg} code={m.code} /></span>
              <span className="muted">{m.credits}학점{m.recommended ? ` · 권장 ${m.recommended}` : ''}</span>
              <PlanButton course={m} r={r} onPlan={onPlan} planned={planned} />
            </li>
          ))}
        </ul>
      )}
      {r.options?.length > 0 && r.status !== 'met' && <Options r={r} onPlan={onPlan} planned={planned} rg={rg} />}
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

export default function Dashboard({ report, onPlan, onOpen }) {
  const planned = new Set(report.courses.map((c) => c.code))
  const rg = useRelativeGrading(report.entry_year, report.programs.map((p) => p.code))
  const byId = Object.fromEntries(report.requirements.map((r) => [r.id, r]))
  const total = byId.total
  const groups = [...new Set(report.requirements.map((r) => r.group))].filter((g) => g !== '졸업학점')
  const blocking = report.requirements.filter((r) => r.status === 'unmet')
  const remaining = Math.max(total.required - total.earned, 0)
  // 홈 카드: 주전공·교양 + 고른 다전공마다 하나씩
  const kpiIds = ['major', 'major_required', 'liberal_arts',
    ...report.programs.map((p) => `program:${p.code}:credits`).filter((id) => byId[id])]

  return (
    <>
      {report.ruleset.status !== 'confirmed' && (
        <div className="banner banner-warn with-mascot" role="status">
          <Mascot pose="surprise" size={44} />
          <span><strong>{report.entry_year}학번 졸업요건은 아직 확정 공지 전이라</strong> 이전 학번 기준으로 계산했어요. 바뀔 수 있습니다.</span>
        </div>
      )}

      <div className="panel hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">
              총 이수학점{' '}
              <button type="button" className="btn-link req-count" onClick={() => onOpen('total')}>전체 과목 {total.counted?.length ?? 0}개 ›</button>
            </p>
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
              <span className="hero-done"><Mascot pose="cheer" size={56} /><Badge status="met" /></span>
            ) : (
              <p className="count"><strong>{report.summary.met}</strong> / {report.summary.total} 요건 충족</p>
            )}
          </div>
        </div>
        <TrailPath earned={total.earned} planned={total.planned} required={total.required} />
        <div className="legend" aria-hidden="true">
          <span><i className="sw sw-earned" />걸어온 길 (이수)</span>
          <span><i className="sw sw-planned-solid" />수강 예정</span>
          <span><i className="sw sw-rest" />남은 길</span>
        </div>
        {blocking.length > 0 && (
          <p className="blocking">
            <span className="muted">아직 부족:</span> {blocking.map((r) => r.label).join(' · ')}
          </p>
        )}
      </div>

      {/* 카드 수에 맞춰 한 줄에 고르게 (5~6개면 3개씩 두 줄) */}
      <div className="kpis" style={{ '--kpi-cols': kpiIds.length >= 5 ? 3 : kpiIds.length }}>
        {kpiIds.map((id) => {
          const r = byId[id]
          // 다전공 카드: 'program:<코드>:credits' — 이름은 그 학과·융합전공, 필수 과목이 있으면 함께
          const prog = id.startsWith('program:') ? report.programs.find((p) => id === `program:${p.code}:credits`) : null
          const req = prog && byId[`program:${prog.code}:required`]
          const title = prog ? `${prog.label} · ${prog.name}` : id === 'major_required' ? '전공필수' : r.label.replace(' (전공필수 포함)', '')
          return (
            // 카드 안에 막대(div)가 있어 <button> 대신 역할만 버튼으로
            <div key={id} role="button" tabIndex={0} className={`panel kpi kpi-open${prog ? ' kpi-program' : ''}`} onClick={() => onOpen(id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(id))}
              aria-label={`${title} 과목 보기·고치기`}>
              <p className="eyebrow">{title}</p>
              <p className="kpi-value">
                {r.earned}
                {r.planned > 0 && <span className="plus">+{r.planned}</span>}
                <span className="of">{r.required != null ? `/${r.required}${r.unit}` : `${r.unit} (기준 확인 필요)`}</span>
              </p>
              {r.required != null && <Meter earned={r.earned} planned={r.planned} required={r.required} unit={r.unit} label={title} />}
              {req && (
                <p className="muted">
                  {req.label} {req.earned}{req.planned > 0 ? `+${req.planned}` : ''}/{req.required}{req.unit}
                </p>
              )}
              <span className="kpi-foot"><Badge status={r.status} /><span className="req-count">과목 {r.counted?.length ?? 0}개 ›</span></span>
            </div>
          )
        })}
      </div>

      {groups.map((g) => (
        <div key={g} className="panel">
          <h2 className="display">{g}</h2>
          <ul className="reqs">
            {report.requirements.filter((r) => r.group === g).map((r) => <Requirement key={r.id} r={r} onPlan={onPlan} planned={planned} onOpen={onOpen} rg={rg} />)}
          </ul>
        </div>
      ))}

      {report.summary.met < report.summary.total && <RgNote rg={rg} />}

      {report.warnings.length > 0 && (
        <div className="panel">
          <h2>확인해 주세요</h2>
          <ul className="warnings">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </>
  )
}
