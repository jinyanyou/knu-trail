import { useLayoutEffect, useRef, useState } from 'react'
import Mascot from './Mascot.jsx'
import scene from '../assets/trail-scene.svg'

// 졸업까지의 산길 (팀 디자인 초안): 하늘·구름·능선·나무 그림 위에 입학(왼쪽 아래)에서 졸업(깃발)까지 길을 그린다.
// 걸어온 길(이수) = 진한 초록, 수강 예정 = 연한 초록, 남은 길 = 크림색 길 + 점선.
// 그림은 비율을 지킨 채 폭에 맞춰 커지고 작아진다 — 다람쥐·말풍선은 글씨 크기를 지키려고 HTML로 겹쳐 그린다
const W = 880
const H = 210
// 왼쪽 끝에서 조금 들어와 앞 언덕을 지나, 정상 산의 완만한 왼쪽 비탈을 타고 정상(깃발)까지 고르게 오른다
// (그림의 정상 산 왼쪽 골짜기를 얕게 고치고 나무를 길 밖으로 옮김)
const PATH = 'M70 197 C170 196 260 192 340 180 C440 165 520 140 562 112 C594 91 618 74 640 56'
const TOP = { x: 640, y: 56 }
const at = (pt) => ({ left: `${(pt.x / W) * 100}%`, top: `${(pt.y / H) * 100}%` })

export default function TrailPath({ earned, planned = 0, required, label = '총 이수학점' }) {
  const ref = useRef(null)
  const [me, setMe] = useState(null)
  const frac = (v) => (required > 0 ? Math.min(1, Math.max(0, v / required)) : 0)
  const e = frac(earned)
  const p = Math.min(1 - e, frac(planned))

  // 길 위의 지금 위치는 그린 뒤에 길이를 재서 구한다
  useLayoutEffect(() => {
    const path = ref.current
    if (!path?.getTotalLength) return
    setMe(path.getPointAtLength(path.getTotalLength() * e))
  }, [e])

  const tip = `이수 ${earned}학점${planned ? ` · 예정 ${planned}학점` : ''} · 졸업 ${required}학점`
  return (
    <figure className={`trail${e >= 1 ? ' done' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={required}
      aria-valuenow={Math.min(earned, required)} aria-valuetext={tip}>
      <div className="trail-plot">
        <img className="trail-scene" src={scene} alt="" aria-hidden="true" draggable="false" />
        <svg className="trail-road" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <title>{tip}</title>
          {/* 크림색 길: 검은 테두리 → 길 바탕 → 가운데 점선 */}
          <path ref={ref} d={PATH} className="road-edge" />
          <path d={PATH} className="road-bed" />
          <path d={PATH} className="road-dash" />
          {/* 수강 예정 → 걸어온 길 순서로 겹쳐 그린다 */}
          {p > 0 && <path d={PATH} className="road-planned" pathLength="100" strokeDasharray={`0 ${e * 100} ${p * 100} 100`} />}
          {e > 0 && <path d={PATH} className="road-earned" pathLength="100" strokeDasharray={`${e * 100} 100`} />}
          {/* 정상 깃발 */}
          <line x1={TOP.x} y1={TOP.y + 2} x2={TOP.x} y2="12" className="flag-pole" />
          <path d={`M${TOP.x} 12 L${TOP.x + 34} 22 L${TOP.x} 34 Z`} className="flag-cloth" />
        </svg>
        <span className="trail-goal" style={at({ x: 684, y: 23 })}>졸업 {required}학점{e >= 1 ? ' 달성' : ''}</span>
        {me && (
          <span className={`trail-me${me.x < 130 ? ' at-start' : me.x > 560 ? ' at-end' : ''}`} style={at(me)}>
            <Mascot pose={e >= 1 ? 'cheer' : 'walk'} size={60} className="trail-me-img" />
            {/* 정상에 닿으면 '졸업 … 달성' 말풍선 하나로 (위로 잘리지 않게) */}
            {e < 1 && <span className="trail-me-label">지금 {earned}학점</span>}
          </span>
        )}
      </div>
    </figure>
  )
}
