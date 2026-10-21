import { STATUS } from './Dashboard.jsx'

const left = (r) => Math.max((r.required ?? 0) - r.earned - r.planned, 0)

// 졸업 시뮬레이션 중 홈 위쪽 띠: 시작했을 때와 지금의 졸업요건 차이
export default function SimBanner({ base, now, onApply, onCancel }) {
  const before = Object.fromEntries((base?.requirements ?? []).map((r) => [r.id, r]))
  const changed = (now?.requirements ?? []).filter((r) => {
    const b = before[r.id]
    return !b || b.status !== r.status || b.earned !== r.earned || b.planned !== r.planned
  })
  const total = (rep) => rep && left(rep.requirements.find((r) => r.id === 'total'))
  return (
    <div className="sim-banner panel" role="status">
      <div className="sim-head">
        <div>
          <strong>🧪 졸업 시뮬레이션 중</strong>
          <p className="muted">과목·다전공·학번을 바꿔 보세요. 저장되지 않고, 적용하기를 눌러야 내 계정에 반영돼요.</p>
        </div>
        <div className="sim-actions">
          <button type="button" className="btn btn-primary" onClick={onApply}>적용하기</button>
          <button type="button" className="btn" onClick={onCancel}>되돌리고 끝내기</button>
        </div>
      </div>
      {base && now && (
        <div className="sim-diff">
          <span>남은 학점 <b>{total(base)}</b> → <b>{total(now)}</b></span>
          <span>충족 요건 <b>{base.summary.met}/{base.summary.total}</b> → <b>{now.summary.met}/{now.summary.total}</b></span>
          {changed.length > 0 && (
            <ul className="sim-changes">
              {changed.slice(0, 8).map((r) => {
                const b = before[r.id]
                return (
                  <li key={r.id}>
                    {r.label}: {b ? `${b.earned}${b.planned ? `+${b.planned}` : ''}` : '없음'} → {r.earned}{r.planned ? `+${r.planned}` : ''}
                    {r.required != null ? `/${r.required}${r.unit}` : ''}
                    {(!b || b.status !== r.status) && <em> · {STATUS[r.status].label}</em>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
