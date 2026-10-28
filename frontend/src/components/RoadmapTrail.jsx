import { useLayoutEffect, useRef } from 'react'
import { mascotSrc } from './Mascot.jsx'

// 졸업 로드맵 산길 지도 (팀 디자인 '졸업 로드맵 산길 지도'): 학기마다 쌓은 누적 학점이 고도가 된다.
// 들은 과목(성적 있음)·수강 예정·로드맵 계획을 학기별로 모아 길 위의 점으로 찍는다.
// 재수강: 처음 학점을 딴 학기에만 누적에 넣고, 재수강 학기에는 더하지 않는다 (F 뒤 재수강은 재수강 학기에 넣는다)

export const SEM_NO = { '1학기': 1, '여름계절': 1, '2학기': 2, '겨울계절': 2 }
const ORDER = { '1학기': 0, '여름계절': 1, '2학기': 2, '겨울계절': 3 }
const FAIL = new Set(['F', 'U', 'NP'])
const SEASON = { '여름계절': '여름', '겨울계절': '겨울' }
export const nodeKey = (year, semester) => `${year}-${SEM_NO[semester] ?? 1}`
const keyNum = (k) => {
  const [y, s] = k.split('-').map(Number)
  return y * 2 + s - 1
}

// 과목 분류 색 — 화면 범례·막대·카드 왼쪽 띠 모두 이 순서
export const CLS = ['req', 'major', 'prog', 'la', 'free']
export const CLS_LABEL = { req: '전공필수', major: '전공선택', prog: '다전공', la: '교양', free: '자유·일반선택' }
export const CLS_TAG = { req: '전필', major: '전선', prog: '다전공', la: '교양', free: '자선' }
const CLS_COLOR = { req: '#910000', major: '#e8821a', prog: '#3b5bdb', la: '#e0a800', free: '#cfcbc0' }
const CAT_CLS = { 전공필수: 'req', 전공: 'major', 교양: 'la' }
// counts_for: 'primary'(주전공에 인정) 또는 다전공 학과 코드 — 'primary'는 다전공이 아니다
const progOf = (cf) => (cf && cf !== 'primary' ? cf : null)
const clsOfReport = (rc) => (!rc ? 'free' : progOf(rc.counts_for) ? 'prog' : CAT_CLS[rc.category] ?? 'free')

// 다전공 꼬리표: 융합전공 → 융합, 복수전공 → 복수 (부전공은 그대로)
export const progTag = (label) => (label === '부전공' ? '부전공' : (label ?? '다전공').replace(/전공$/, ''))
export const makeTagOf = (programs) => (cls, prog) => (cls === 'prog'
  ? progTag(programs.find((p) => p.code === prog)?.label ?? programs[0]?.label)
  : CLS_TAG[cls])
// 로드맵 엔진이 붙인 kind → 색 구분
const KIND_CLS = { 전공필수: 'req', 전공: 'major', 다전공: 'prog', 교양: 'la' }
export const planCls = (c) => KIND_CLS[c.kind] ?? 'free'

/**
 * 학기별 점 목록을 만든다.
 * taken: 들은 과목·수강 예정 입력 / report: 그 입력으로 계산한 졸업요건 (중복·재이수·F 판정)
 * plan: 로드맵이 새로 넣는 과목 (kind·counts_for 포함) / startKey: 계획을 시작하는 학기
 */
export function buildTrail({ entryYear, taken, report, plan, startKey, clsOfPlan }) {
  const at = (x) => `${x.code}|${x.year}|${x.semester}`
  const dropped = new Map((report?.excluded ?? []).map((x) => [at({ ...x, year: x.year || entryYear }), x.reason]))
  const kept = new Map((report?.courses ?? []).map((c) => [at(c), c]))
  const byCode = new Map((report?.courses ?? []).map((c) => [c.code, c]))

  const items = []
  for (const t of taken) {
    const x = { ...t, year: t.year || entryYear, semester: t.semester || '1학기' }
    const why = dropped.get(at(x)) ?? ''
    if (why.includes('중복')) continue // 같은 과목을 두 번 입력한 것 — 화면에서도 뺀다
    const rc = kept.get(at(x)) ?? byCode.get(x.code)
    items.push({
      key: `t-${t.id ?? at(x)}`, code: x.code, name: rc?.name ?? x.name ?? x.code, credits: rc?.credits ?? x.credits ?? 0,
      year: x.year, semester: x.semester, grade: x.grade || null, cls: clsOfReport(rc), prog: progOf(rc?.counts_for),
      fail: why.startsWith('성적'), before: why.startsWith('재이수'), retake: t.retake ?? null,
    })
  }
  // 학생이 직접 표시한 재수강 — 이전 수강 학기를 알면 그 학기에 '재수강 전' 과목으로 되살린다
  const manual = new Map()
  for (const i of [...items]) {
    const r = i.retake
    if (!r || !i.grade) continue
    if (items.some((o) => o !== i && o.code === i.code && o.grade && o.year * 4 + (ORDER[o.semester] ?? 0) < i.year * 4 + (ORDER[i.semester] ?? 0))) continue
    // 이전 수강 학기가 이 과목보다 앞일 때만 (과목 학기를 나중에 고쳐 순서가 어긋나면 '학기 모름'으로)
    if (r.year && r.semester && r.year * 4 + (ORDER[r.semester] ?? 0) < i.year * 4 + (ORDER[i.semester] ?? 0)) {
      items.push({ ...i, key: `r-${i.key}`, year: r.year, semester: r.semester, grade: r.grade ?? '?',
        fail: FAIL.has(r.grade), before: !FAIL.has(r.grade), manualRetake: true })
    } else {
      manual.set(i, { grade: r.grade })
    }
  }
  for (const c of plan) {
    items.push({ ...c, key: `p-${c.code}`, grade: null, cls: clsOfPlan(c), prog: progOf(c.counts_for), plan: true })
  }

  // 재수강: 같은 과목의 성적 있는 수강을 학기 순으로 이어 앞뒤를 알려 준다
  const order = (i) => i.year * 4 + (ORDER[i.semester] ?? 0)
  const attempts = new Map()
  for (const i of items.filter((x) => x.grade).sort((a, b) => order(a) - order(b))) {
    if (!attempts.has(i.code)) attempts.set(i.code, [])
    attempts.get(i.code).push(i)
  }
  for (const list of attempts.values()) {
    list.forEach((i, n) => {
      if (n > 0) i.retakeOf = list[n - 1]
      if (n < list.length - 1) i.retakenIn = list[n + 1]
    })
  }
  for (const [i, prev] of manual) i.retakeOf = prev // 이전 학기를 모름

  // 점 범위: 입학 1학기 ~ 4학년 2학기 (계획이 더 길면 그만큼)
  const firstKey = `${entryYear}-1`
  const lastNum = Math.max(keyNum(`${entryYear + 3}-2`), ...items.map((i) => keyNum(nodeKey(i.year, i.semester))))
  const nodes = []
  for (let n = keyNum(firstKey); n <= lastNum; n += 1) {
    const year = Math.floor(n / 2)
    const sem = (n % 2) + 1
    nodes.push({ key: `${year}-${sem}`, year, sem, grade: year - entryYear + 1, items: [] })
  }
  const byKey = new Map(nodes.map((n) => [n.key, n]))
  for (const i of items) {
    const k = nodeKey(i.year, i.semester)
    ;(byKey.get(k) ?? nodes[0]).items.push(i)
  }

  // 누적 학점 (같은 과목은 처음 딴 학기에 한 번만)
  const passed = new Set()
  const progCum = {}
  let cum = 0
  let earned = 0
  const startNum = startKey ? keyNum(startKey) : Infinity
  for (const node of nodes) {
    node.items.sort((a, b) => (ORDER[a.semester] ?? 0) - (ORDER[b.semester] ?? 0) || (a.plan ? 1 : 0) - (b.plan ? 1 : 0))
    let add = 0
    for (const i of node.items) {
      i.season = SEASON[i.semester]
      if (i.fail) continue
      if (passed.has(i.code)) {
        i.noCredit = true
        continue
      }
      passed.add(i.code)
      add += i.credits
      if (i.grade) earned += i.credits
      if (i.prog) progCum[i.prog] = (progCum[i.prog] ?? 0) + i.credits
      i.progAdd = i.prog ? i.credits : 0
    }
    cum += add
    node.add = add
    node.cum = cum
    node.earned = earned
    node.progCum = { ...progCum }
    node.progAdd = {}
    for (const i of node.items) if (i.progAdd) node.progAdd[i.prog] = (node.progAdd[i.prog] ?? 0) + i.progAdd
    const listed = node.items.filter((i) => !i.fail)
    node.credits = listed.reduce((s, i) => s + i.credits, 0)
    node.count = listed.length
    node.mix = CLS.map((c) => [c, listed.filter((i) => i.cls === c).reduce((s, i) => s + i.credits, 0)]).filter(([, v]) => v > 0)
    node.reqCount = listed.filter((i) => i.cls === 'req' && !i.grade).length
    const graded = node.items.length > 0 && node.items.every((i) => i.grade)
    const n = keyNum(node.key)
    node.status = graded ? 'done'
      : n === startNum ? 'next'
        : n === startNum - 1 ? (node.items.length ? 'now' : 'empty')
          : n < startNum ? (node.items.length ? 'nograde' : 'empty') : 'later'
  }
  // 지금 여기 = 성적까지 받은 마지막 학기 (계획 시작 전까지)
  let here = -1
  nodes.forEach((n, idx) => {
    if (n.status === 'done' && keyNum(n.key) < startNum) here = idx
  })
  return { nodes, here, total: cum, earned }
}

export const STATUS_LABEL = { done: '이수 완료', now: '듣는 중', next: '다음 학기', later: '예정', empty: '입력 없음', nograde: '성적 미입력' }

// ── 그림 ─────────────────────────────────────────────
const GAP = 124
const PAD_L = 34
const H = 372
const TOP = 96
const BOTTOM = 292
const INK = '#1b1a17'
const RIDGE = [[0, 300], [120, 230], [230, 290], [380, 170], [520, 260], [700, 130], [860, 230], [1020, 110], [1160, 200], [1296, 120]]

export const trailWidth = (n) => PAD_L + n * GAP + 70

// 점들을 지나는 부드러운 곡선 (Catmull-Rom → 베지어) — 구간마다 따로 그릴 수 있게 구간 문자열로
function segments(pts) {
  const out = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    out.push(`C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`)
  }
  return out
}
const M = (p) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`

function Tree({ x, y, s = 1 }) {
  const w = 10 * s
  const h = 16 * s
  const tri = (dy, k) => `${x - w * k},${y + dy} ${x},${y + dy - h} ${x + w * k},${y + dy}`
  return (
    <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
      <rect x={x - 3} y={y} width="6" height="8" fill="#8a5a3a" />
      <polygon points={tri(1, 1)} fill="#2a7a4c" />
      <polygon points={tri(1 - 5.6 * s, 0.78)} fill="#2a7a4c" />
      <polygon points={tri(1 - 10.7 * s, 0.56)} fill="#2a7a4c" />
    </g>
  )
}

// 누적 학점이 높이가 되는 산길
export function TrailMap({ nodes, here, required, picked, onPick, label }) {
  const W = trailWidth(nodes.length)
  const scroll = useRef(null)
  const top = Math.max(required || 0, nodes.at(-1)?.cum ?? 0, 1)
  const y = (v) => BOTTOM - (Math.min(v, top) / top) * (BOTTOM - TOP)
  const start = [PAD_L, BOTTOM]
  const pts = [start, ...nodes.map((n, i) => [PAD_L + (i + 1) * GAP, y(n.cum)])]
  const segs = segments(pts)
  const full = M(start) + segs.join('')
  const last = pts.at(-1)
  const ridge = RIDGE.map(([rx, ry]) => `${((rx / 1296) * W).toFixed(0)},${((ry / 540) * H * 0.82).toFixed(0)}`).join(' ')
  const hereNode = here >= 0 ? nodes[here] : null
  const hereAt = here >= 0 ? pts[here + 1] : start
  const busiest = nodes.reduce((b, n, i) => (n.status !== 'done' && n.reqCount >= 3 && n.reqCount > (b?.n.reqCount ?? 0) ? { n, i } : b), null)
  const reqY = required ? y(required) : null

  // 폰에서는 가로로 밀어 본다 — 처음엔 '지금 여기'가 가운데 오게
  useLayoutEffect(() => {
    const el = scroll.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const svg = el.firstElementChild
    const scale = svg.getBoundingClientRect().width / W
    el.scrollLeft = hereAt[0] * scale - el.clientWidth / 2
  }, [W, hereAt[0]])

  const tip = hereNode ? `지금 누적 ${hereNode.cum}학점` : '입학'
  return (
    <div className="trail-scroll" ref={scroll}>
      <svg className="trail-svg" viewBox={`0 0 ${W} ${H}`} style={{ '--w': W }} role="img"
        aria-label={`${label}: ${tip}, 계획대로면 마지막 학기에 누적 ${nodes.at(-1)?.cum ?? 0}학점 (졸업 ${required}학점)`}>
        <polygon points={`0,${H} ${ridge} ${W},${H}`} fill="#dcebdd" stroke={INK} strokeWidth="2" strokeLinejoin="round" opacity=".7" />
        <path d={`${full} L${last[0]} ${H} L${start[0]} ${H} Z`} fill="#c3dfc9" />
        {[38, 76, 114].map((dy) => <path key={dy} d={full} transform={`translate(0 ${dy})`} fill="none" stroke="#a8cdb0" strokeWidth="1.5" strokeDasharray="3 7" />)}
        {pts.slice(1).map((p, i) => {
          const q = pts[i]
          const ty = Math.min(H - 14, Math.max(p[1], q[1]) + 44)
          return (
            <g key={i}>
              <Tree x={q[0] + GAP * 0.3} y={ty} s={i % 2 ? 0.8 : 1.05} />
              <Tree x={q[0] + GAP * 0.62} y={Math.min(H - 10, ty + 12)} s={0.7} />
            </g>
          )
        })}

        {reqY != null && (
          <g>
            <line x1={PAD_L} x2={W - 8} y1={reqY} y2={reqY} stroke="#167a43" strokeWidth="1.6" strokeDasharray="6 6" opacity=".7" />
            <text x={PAD_L} y={reqY - 8} className="t-small" fill="#1a5a35">졸업 {required}학점</text>
          </g>
        )}

        {/* 길: 검은 테두리 → 크림색 바탕 → 학기별 색 (이수 = 진한 초록, 계획 = 연한 초록, 비어 있음 = 점선) */}
        <path d={full} fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d={full} fill="none" stroke="#f6f2e7" strokeWidth="9" strokeLinecap="round" />
        {segs.map((s, i) => {
          const n = nodes[i]
          const d = M(pts[i]) + s
          if (n.status === 'done') return <path key={i} d={d} fill="none" stroke="#167a43" strokeWidth="9" strokeLinecap="round" />
          if (n.add > 0) return <path key={i} d={d} fill="none" stroke="#8fd3a8" strokeWidth="9" strokeLinecap="round" />
          return <path key={i} d={d} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2 10" />
        })}

        <text x={start[0]} y={start[1] + 32} textAnchor="middle" className="t-display" fill={INK}>입학</text>

        {nodes.map((n, i) => {
          const [cx, cy] = pts[i + 1]
          const done = n.status === 'done'
          const ring = n.status === 'next' || n.status === 'now'
          return (
            <g key={n.key} className={`trail-node${picked === n.key ? ' picked' : ''}`} role="button" tabIndex={0}
              aria-label={`${n.grade}학년 ${n.sem}학기 · ${STATUS_LABEL[n.status]} · 누적 ${n.cum}학점`}
              onClick={() => onPick(n.key)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(n.key))}>
              {ring && <circle cx={cx} cy={cy} r="25" fill="none" stroke="#167a43" strokeWidth="3" strokeDasharray="3 5" />}
              <circle cx={cx} cy={cy} r="18" fill={done ? '#167a43' : '#fff'} stroke={INK} strokeWidth="3" />
              <text x={cx} y={cy + 4.5} textAnchor="middle" className="t-num" fill={done ? '#fff' : INK}>{n.grade}-{n.sem}</text>
              <rect x={cx - 46} y={cy + 25} width="92" height="24" rx="12" fill="#fff" stroke={INK} strokeWidth="1.8" />
              <text x={cx} y={cy + 41.5} textAnchor="middle" className="t-num" fill={INK}>누적 {n.cum}학점</text>
            </g>
          )
        })}

        {/* 마지막 학기 위 졸업 깃발 */}
        <path d={`M${last[0]} ${last[1] - 19} L${last[0]} ${last[1] - 80}`} stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
        <path d={`M${last[0]} ${last[1] - 80} L${last[0] + 60} ${last[1] - 66} L${last[0]} ${last[1] - 50} Z`} fill="#167a43" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <text x={last[0] + 7} y={last[1] - 61} className="t-display t-flag" fill="#fff">졸업</text>

        {busiest && (
          <g transform={`translate(${pts[busiest.i + 1][0] - 66} ${pts[busiest.i + 1][1] - 70})`}>
            <rect width="132" height="30" rx="15" fill="#fff0df" stroke={INK} strokeWidth="2" />
            <text x="66" y="20" textAnchor="middle" className="t-num" fill="#8f3a00">⚠ 병목 · 전필 {busiest.n.reqCount}과목</text>
          </g>
        )}

        {/* 지금 여기 — 다람쥐 */}
        <image href={mascotSrc(nodes.at(-1)?.status === 'done' ? 'cheer' : 'walk')} x={hereAt[0] - 64} y={hereAt[1] - 92} width="72" height="72" />
        <text x={hereAt[0]} y={hereAt[1] + (here >= 0 ? 68 : 52)} textAnchor="middle" className="t-num" fill="#1a5a35">지금 여기</text>
      </svg>
    </div>
  )
}

// 다전공 두 번째 길: 원 안 = 누적 다전공 학점, 아래 = 그 학기에 더하는 학점
export function ProgramTrail({ nodes, program }) {
  const W = trailWidth(nodes.length)
  const req = program.min_credits || Math.max(1, nodes.at(-1)?.progCum[program.code] ?? 1)
  const xs = nodes.map((_, i) => PAD_L + (i + 1) * GAP)
  return (
    <svg className="trail-svg prog-svg" viewBox={`0 0 ${W} 100`} style={{ '--w': W }} role="img"
      aria-label={`${program.name} 누적 학점 진행`}>
      <line x1={PAD_L} y1="42" x2={xs.at(-1)} y2="42" stroke={INK} strokeWidth="2.4" strokeDasharray="2 8" strokeLinecap="round" />
      {nodes.map((n, i) => {
        const cum = n.progCum[program.code] ?? 0
        const add = n.progAdd[program.code] ?? 0
        const r = 9 + 14 * Math.min(1, cum / req)
        return (
          <g key={n.key}>
            <circle cx={xs[i]} cy="42" r={r} fill={cum >= req ? CLS_COLOR.prog : '#e6ecff'} stroke={INK} strokeWidth="2.6"
              strokeDasharray={n.status === 'done' ? undefined : '4 3'} />
            <text x={xs[i]} y="47" textAnchor="middle" className="t-num" fill={cum >= req ? '#fff' : '#1c3aa9'}>{cum}</text>
            <text x={xs[i]} y="90" textAnchor="middle" className="t-small" fill="#67645d">{add ? `+${add}학점` : '–'}</text>
          </g>
        )
      })}
    </svg>
  )
}

// 학기 학점 구성 막대
export function MixBar({ mix }) {
  if (!mix.length) return <div className="mix-bar empty" aria-hidden="true" />
  return (
    <div className="mix-bar" role="img" aria-label={mix.map(([c, v]) => `${CLS_LABEL[c]} ${v}학점`).join(', ')}>
      {mix.map(([c, v]) => <span key={c} style={{ flex: v, background: CLS_COLOR[c] }} />)}
    </div>
  )
}
