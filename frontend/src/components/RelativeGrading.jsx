import { useEffect, useState } from 'react'
import * as api from '../api.js'

// 상대평가 권장 과목(A 최대 50%) — 학기마다 학사과가 지정하는 3학년 이상 전공과목.
// 교과목번호·개설대학·개설학과가 모두 같은 분반에만 적용돼서, 같은 과목이라도 어느 학과가 연 분반인지가 중요하다.

const cache = new Map() // 'entryYear|programs' → Promise (화면 여러 곳에서 한 번만 받는다)

export function useRelativeGrading(entryYear, programs = []) {
  const key = `${entryYear}|${programs.join(',')}`
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!entryYear) return undefined
    let alive = true
    if (!cache.has(key)) {
      cache.set(key, api.getRelativeGrading(entryYear, programs).catch(() => {
        cache.delete(key) // 실패하면 표시만 안 하고 다음에 다시 시도
        return null
      }))
    }
    cache.get(key).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return data
}

const termLabel = (term) => term.replace('-', '년 ') + '학기'
const sameDept = (o, s) => o.dept_codes.includes(s.dept_code) || (o.college === s.college && o.dept === s.dept)

// 수강 연도·학기 → 목록 학기 키 ('2027', '1학기' → '2027-1'). 계절학기는 지정 대상이 아니다
export const termKey = (year, semester) => (year && /^[12]학기$/.test(semester ?? '') ? `${year}-${semester[0]}` : null)

// 지정은 학기마다 바뀐다 — 그 학기 목록이 있으면 그것, 없으면 같은 학기(1·2학기)의 가장 최근 목록
// (목록에는 그 학기에 열리는 과목만 있어서), 그것도 없으면 가장 최근 목록. exact면 그 학기 것만
function pickList(rg, term, exact) {
  if (!rg?.latest) return null
  if (term && rg.lists[term]) return [term, rg.lists[term]]
  if (exact) return null
  const same = term && Object.keys(rg.lists).filter((t) => t.endsWith(term.slice(-2))).sort().pop()
  const used = same || rg.latest
  return [used, rg.lists[used]]
}

// term: 들을 학기 ('2027-1'). section: 수강신청 연습의 분반 — 그 학기 목록에서 분반의 개설학과로 정확히 판정
export function RgBadge({ rg, code, term, section }) {
  const [used, list] = pickList(rg, term, !!section) ?? []
  const c = list?.courses[code]
  if (!c) return null
  if (section && !c.offered_by.some((o) => sameDept(o, section))) return null
  const mine = section || c.mine
  const others = [...new Set(c.offered_by.map((o) => o.dept))]
  const where = mine ? null : others.length > 2 ? `${others.slice(0, 2).join(', ')} 외` : others.join(', ')
  const basis = term && term !== used ? ` (${termLabel(term)} 목록이 아직 없어 ${termLabel(used)} 기준)` : ''
  const title = `${termLabel(used)} 상대평가 권장 과목${basis} — `
    + (mine ? `${section ? '이 분반은' : '내 학과가 연 분반은'} 수강생의 50%까지 A를 받을 수 있어요.`
      : `${others.join(', ')} 개설 분반만 해당돼요.`)
  return (
    <span className={`rg-badge${mine ? '' : ' rg-other'}`} title={title} aria-label={title}>
      A 최대 50%{where && <small> · {where} 분반</small>}
    </span>
  )
}

export function RgNote({ rg }) {
  if (!rg?.latest) return null
  const terms = Object.keys(rg.lists).sort()
  const latest = rg.lists[rg.latest]
  return (
    <p className="muted rg-note">
      <span className="rg-badge" aria-hidden="true">A 최대 50%</span>{' '}
      상대평가 권장 과목이에요 ({terms.map(termLabel).join('·')} 지정 목록, 최근 공지 {latest.notice_date.replaceAll('-', '. ')}.).
      지정된 학과가 연 분반만 해당되고, 목록은 학기마다 바뀌어요 — 들을 학기 목록이 아직 없으면 같은 학기(1·2학기)의 가장 최근 목록으로 보여 줘요.
      목록에 없어도 실습·영어 과목 등은 원래대로 적용될 수 있어요.
    </p>
  )
}
