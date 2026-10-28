// 맨 아래 산자락 띠 (팀 디자인 초안의 하단 그래픽) — 낮은 능선 한 줄과 나무.
// 폭이 좁으면 양옆을 잘라 비율을 지킨다 (preserveAspectRatio slice)
const W = 1240
const H = 90
const RIDGE = '0,48 120,24 268,50 400,14 530,46 680,6 820,40 960,16 1100,46 1240,22'
const TREES = [[24, 1], [182, 1.1], [246, 0.8], [432, 1], [560, 0.85], [752, 1.15], [826, 0.85], [1002, 1.05], [1148, 0.9]]

function Tree({ x, k }) {
  const tier = (w, top, bottom) => `${x - w * k},${H - bottom * k} ${x},${H - top * k} ${x + w * k},${H - bottom * k}`
  return (
    <g>
      <rect x={x - 3 * k} y={H - 9 * k} width={6 * k} height={9 * k} fill="#8a5a3a" stroke="#1b1a17" strokeWidth="2" />
      <polygon points={tier(19, 38, 8)} />
      <polygon points={tier(15, 50, 20)} />
      <polygon points={tier(11, 60, 32)} />
    </g>
  )
}

export default function FooterHills() {
  return (
    <svg className="footer-hills" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <polygon points={`0,${H} ${RIDGE} ${W},${H}`} fill="#c3dfc9" stroke="#1b1a17" strokeWidth="3" strokeLinejoin="round" />
      <g fill="#2a7a4c" stroke="#1b1a17" strokeWidth="2.2" strokeLinejoin="round">
        {TREES.map(([x, k]) => <Tree key={x} x={x} k={k} />)}
      </g>
      <line x1="0" y1={H - 1.5} x2={W} y2={H - 1.5} stroke="#1b1a17" strokeWidth="3" />
    </svg>
  )
}
