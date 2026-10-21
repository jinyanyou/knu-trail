import { useLayoutEffect, useRef, useState } from 'react'

// 졸업까지의 산길: 입학(출발)에서 졸업(정상)까지 굽이진 길 위에 지금 위치를 표시한다
// 걸어온 길(이수) = 진한 초록, 수강 예정 = 연한 초록, 남은 길 = 점선
// 화면 폭에 맞춰 가로로만 늘어나고 높이는 고정 — 동그라미·깃발은 찌그러지지 않게 HTML로 겹쳐 그린다
const PATH = 'M14 92 C 90 92, 110 58, 190 66 S 300 96, 360 60 S 470 20, 520 34 S 570 20, 586 12'
const MILESTONES = [0.25, 0.5, 0.75]
const at = (pt) => ({ left: `${(pt.x / 600) * 100}%`, top: `${(pt.y / 110) * 100}%` })

export default function TrailPath({ earned, planned = 0, required, label = '총 이수학점' }) {
  const ref = useRef(null)
  const [points, setPoints] = useState(null)
  const frac = (v) => (required > 0 ? Math.min(1, Math.max(0, v / required)) : 0)
  const e = frac(earned)
  const p = Math.min(1 - e, frac(planned))

  // 길 위의 좌표(현재 위치·이정표)는 그린 뒤에 길이를 재서 구한다
  useLayoutEffect(() => {
    const path = ref.current
    if (!path?.getTotalLength) return
    const len = path.getTotalLength()
    const at = (f) => path.getPointAtLength(len * f)
    setPoints({ me: at(e), milestones: MILESTONES.map(at) })
  }, [e])

  const tip = `이수 ${earned}학점${planned ? ` · 예정 ${planned}학점` : ''} · 졸업 ${required}학점`
  return (
    <figure className="trail" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={required}
      aria-valuenow={Math.min(earned, required)} aria-valuetext={tip}>
      <div className="trail-plot">
      <svg viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true">
        <title>{tip}</title>
        {/* 뒤쪽 산 능선 */}
        <path className="trail-ridge far" d="M0 110 L0 70 L70 40 L130 62 L210 22 L290 58 L360 30 L430 52 L500 8 L560 38 L600 26 L600 110 Z" />
        <path className="trail-ridge near" d="M0 110 L0 90 L80 70 L160 86 L250 60 L330 82 L420 56 L510 72 L600 48 L600 110 Z" />
        {/* 남은 길 → 예정 → 걸어온 길 순서로 겹쳐 그린다 */}
        <path ref={ref} className="trail-rest" d={PATH} pathLength="100" />
        {p > 0 && (
          <path className="trail-planned" d={PATH} pathLength="100" strokeDasharray={`0 ${e * 100} ${p * 100} 100`} />
        )}
        {e > 0 && <path className="trail-earned" d={PATH} pathLength="100" strokeDasharray={`${e * 100} 100`} />}
      </svg>
      {points?.milestones.map((m, i) => (
        <span key={i} className={`trail-post${MILESTONES[i] <= e ? ' passed' : ''}`} style={at(m)} />
      ))}
      {/* 정상 깃발 */}
      <svg className="trail-flag" viewBox="0 0 12 14" style={at({ x: 586, y: 12 })} aria-hidden="true">
        <path d="M1 14 V1 L11 4.5 L1 8" />
      </svg>
      {points && (
        <span className={`trail-me${points.me.x < 60 ? ' at-start' : points.me.x > 540 ? ' at-end' : ''}`} style={at(points.me)}>
          <span className="trail-me-label">지금 {earned}학점</span>
        </span>
      )}
      </div>
      <figcaption className="trail-ends">
        <span>입학</span>
        <span>졸업 {required}학점</span>
      </figcaption>
    </figure>
  )
}
