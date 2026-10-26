import { useLayoutEffect, useRef } from 'react'
import { MixBar, STATUS_LABEL } from './RoadmapTrail.jsx'

// 학기별 짐 꾸러미 — 학기마다 카드 한 장 (로드맵 화면).
// 넓은 화면은 격자, 폰은 한 장씩 옆으로 넘긴다

const termShort = (i) => `${i.year}년 ${i.semester}`

// 들은 과목·이미 넣어 둔 수강 예정 — 읽기 전용. 재수강 전/후를 함께 보여 준다
export function TakenItem({ i, tag }) {
  const state = i.fail ? 'tc-fail' : i.before ? 'tc-before' : ''
  return (
    <li className={`tc-item k-${i.cls} ${state}`}>
      <span className="tc-name">{i.name}{i.season && <small className="tc-season">{i.season}계절</small>}</span>
      <span className="tc-meta">
        {tag} · {i.credits}학점 · {i.grade ? <b className="tc-grade">{i.grade}</b> : '수강 예정'}
        {i.retakeOf && <span className="tc-flag tc-flag-after">재수강 후</span>}
        {i.before && <span className="tc-flag">재수강 전</span>}
      </span>
      {i.fail && <span className="tc-note">학점을 받지 못했어요{i.retakenIn ? ` → ${termShort(i.retakenIn)} 재수강` : ' — 재수강하면 학점이 생겨요'}</span>}
      {i.before && <span className="tc-note">{termShort(i.retakenIn)}에 재수강 → 이 성적은 평점에서 빠지고 {i.retakenIn.grade}로 바뀌어요</span>}
      {i.retakeOf && (
        <span className="tc-note">
          이전 {termShort(i.retakeOf)} {i.retakeOf.grade} → {i.grade}{i.noCredit ? ' · 학점은 한 번만 쳐요' : ''}
        </span>
      )}
    </li>
  )
}

/**
 * nodes: buildTrail 결과 / tagOf(cls, prog): 과목 꼬리표
 * renderPlan(item, tag): 계획 과목 그리기
 * footer(node): 카드 아래 버튼 등
 */
export default function TermCards({ nodes, tagOf, filter = null, picked = null, maxCredits = null, renderPlan, footer }) {
  const ref = useRef(null)
  const shown = (items) => (filter ? items.filter((i) => i.cls === filter) : items)

  // 폰(카드를 옆으로 넘김)은 처음에 지금·다음 학기 카드가 보이게
  const scrolled = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || scrolled.current) return
    scrolled.current = true
    if (el.scrollWidth <= el.clientWidth) return
    const card = el.querySelector('.term-card.s-now, .term-card.s-next')
    if (card) el.scrollLeft = card.offsetLeft - el.firstElementChild.offsetLeft
  }, [nodes])

  return (
    <div className="term-cards" ref={ref}>
      {nodes.map((n) => {
        const future = n.status === 'next' || n.status === 'later'
        const over = maxCredits && future && n.credits > maxCredits
        const list = shown(n.items)
        return (
          <article key={n.key} id={`term-${n.key}`} className={`term-card s-${n.status}${picked === n.key ? ' picked' : ''}`}
            aria-label={`${n.grade}학년 ${n.sem}학기`}>
            <div className="tc-head">
              <h3 className="display">{n.grade}학년 {n.sem}학기</h3>
              <span className="muted">{n.year}년</span>
            </div>
            <div className="tc-sub">
              <span className={`tc-credits${over ? ' over' : ''}`}>{n.credits}학점·{n.count}과목{over ? ` · ${maxCredits}학점 초과` : ''}</span>
              <span className={`tc-status s-${n.status}`}>{STATUS_LABEL[n.status]}</span>
            </div>
            <MixBar mix={n.mix} />
            {list.length > 0 ? (
              <ul className="tc-list">
                {list.map((i) => {
                  const tag = tagOf(i.cls, i.prog)
                  if (!i.plan) return <TakenItem key={i.key} i={i} tag={tag} />
                  return renderPlan(i, tag)
                })}
              </ul>
            ) : (
              <p className="muted tc-empty">
                {n.items.length ? '이 분류 과목 없음' : n.status === 'empty' ? '입력한 과목 없음 (휴학이면 그대로 두세요)' : '새로 넣을 과목 없음'}
              </p>
            )}
            {footer?.(n)}
          </article>
        )
      })}
    </div>
  )
}
