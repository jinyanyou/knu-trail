// 진행 막대: 이수(진한 파랑) + 수강 예정(빗금) + 남은 부분(같은 계열의 옅은 트랙)
export default function Meter({ earned, planned = 0, required, unit, label, large = false }) {
  const pct = (v) => (required > 0 ? Math.min(100, (v / required) * 100) : 0)
  const earnedPct = pct(earned)
  const plannedPct = Math.min(100 - earnedPct, pct(planned))
  const tip = `이수 ${earned}${unit}${planned ? ` · 예정 ${planned}${unit}` : ''} · 기준 ${required}${unit}`

  return (
    <div
      className={`meter${large ? ' meter-lg' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={Math.min(earned, required)}
      aria-valuetext={tip}
      title={tip}
    >
      {earnedPct > 0 && <span className="meter-earned" style={{ width: `${earnedPct}%` }} />}
      {plannedPct > 0 && <span className="meter-planned" style={{ width: `${plannedPct}%` }} />}
    </div>
  )
}
