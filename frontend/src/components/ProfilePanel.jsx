import { useMemo, useState } from 'react'

export const KINDS = [
  { value: 'double', label: '복수전공' },
  { value: 'convergence', label: '융합전공' },
  { value: 'minor', label: '부전공' },
  { value: 'linked', label: '연계전공' },
]
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]))
const MAX_PROGRAMS = 3

const FLAGS = [
  { key: 'math_science_waived', label: '기초학력 진단평가 A (수리·기초과학 면제)' },
  { key: 'software_alternative', label: '소프트웨어 대체 인정 (자격증·교육 이수 등)' },
  { key: 'major_assessment_done', label: '전공영역 평가 통과' },
  { key: 'transfer', label: '편입생' },
  { key: 'teaching_course', label: '교직과정 이수' },
  { key: 'joint_degree', label: '부산대 공동학위 희망' },
]

// 융합·연계전공은 각자의 목록에서, 복수전공·부전공은 학과·전공 목록에서 고른다
const POOL = {
  double: ['major'],
  minor: ['major'],
  convergence: ['convergence', 'convergence_unlisted'], // 공고에 없는 융합전공은 목록 아래쪽에 (기존 이수자용)
  linked: ['linked'],
}
// 학사안내 기준 허용 학과만: 예술대·글로벌인재학부·농산업학과는 부전공만, 사범대는 교직과정 이수자만 복수전공
const fits = (kind, p, profile) => {
  if (!POOL[kind].includes(p.kind)) return false
  if (kind === 'double') return p.allowed?.double === true || (p.allowed?.double === 'teaching' && !!profile.teaching_course)
  if (kind === 'minor') return p.allowed?.minor !== false
  return true
}

function programMeta(p) {
  if (p.kind === 'convergence') {
    return [p.host && `주관 ${p.host}`, p.quota && `${p.quota}명 선발`].filter(Boolean).join(' · ') || '융합전공'
  }
  if (p.kind === 'convergence_unlisted') return '현재 선발 공고에 없음 (이미 이수 중인 학생용)'
  return [p.college, p.multi_major_credits ? `다전공 ${p.multi_major_credits}학점` : '기준 학점 확인 필요']
    .filter(Boolean).join(' · ')
}
const PLACEHOLDER = {
  convergence: '융합전공 검색 (예: 빅데이터)',
  linked: '연계전공 검색',
}

function ProgramRow({ choice, programs, profile, taken, onChange, onRemove }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const info = programs.find((p) => p.code === choice.code)
  const results = useMemo(() => {
    const q = query.replace(/\s/g, '')
    return programs
      .filter((p) => fits(choice.kind, p, profile) && !taken.has(p.code))
      .filter((p) => !q || `${p.college ?? ''}${p.name}`.replace(/\s/g, '').includes(q))
      .sort((a, b) => (a.kind === 'convergence_unlisted') - (b.kind === 'convergence_unlisted'))
      .slice(0, 40)
  }, [programs, query, choice.kind, taken, profile])

  const defaultCredits = info
    ? choice.kind === 'minor' ? 24 : (info.multi_major_credits ?? (choice.kind === 'convergence' ? 36 : null))
    : null

  return (
    <li className="program">
      <div className="row">
        <select aria-label="다전공 종류" value={choice.kind}
          onChange={(e) => onChange({ kind: e.target.value, code: null, min_credits: null })}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <button type="button" className="icon-btn" aria-label="이 다전공 삭제" onClick={onRemove}>✕</button>
      </div>
      <div className="search">
        <input
          type="search"
          placeholder={PLACEHOLDER[choice.kind] ?? '학과·전공 검색 (예: 경영학부)'}
          aria-label={`${KIND_LABEL[choice.kind]} 학과 검색`}
          value={info && !open ? info.name : query}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {open && results.length === 0 && !query && (
          <p className="muted">이 학번에는 고를 수 있는 {KIND_LABEL[choice.kind]}이 없습니다.</p>
        )}
        {open && results.length > 0 && (
          <ul className="results" role="listbox">
            {results.map((p) => (
              <li key={p.code} role="option" aria-selected={p.code === choice.code}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ ...choice, code: p.code, min_credits: null })
                  setOpen(false)
                }}>
                <span className="r-name">{p.name}</span>
                <span className="r-meta">{programMeta(p)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {info && (
        <label className="field inline">
          <span>
            필요 학점 {defaultCredits ? `(기준 ${defaultCredits}학점 — 다르면 입력)` : '(기준표에 없음 — 학과 공지 확인 후 입력)'}
          </span>
          <input type="number" min="1" max="200" className="narrow" placeholder={defaultCredits ?? ''}
            value={choice.min_credits ?? ''}
            onChange={(e) => onChange({ ...choice, min_credits: e.target.value ? Number(e.target.value) : null })} />
        </label>
      )}
    </li>
  )
}

export default function ProfilePanel({ profile, programs, onChange }) {
  const set = (key, value) => onChange({ ...profile, [key]: value })
  const chosen = profile.programs ?? []
  const setChosen = (list) => set('programs', list)
  const used = (except) => new Set(chosen.filter((c, i) => i !== except && c.code).map((c) => c.code))

  return (
    <div className="card">
      <h2>내 조건</h2>

      <div className="field">
        <span>다전공 (복수·융합·부·연계전공)</span>
        {chosen.length === 0 && <p className="muted">인공지능전공만 이수 — 전공 90학점 기준</p>}
        <ul className="programs">
          {chosen.map((c, i) => (
            <ProgramRow key={i} choice={c} programs={programs} profile={profile} taken={used(i)}
              onChange={(next) => setChosen(chosen.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setChosen(chosen.filter((_, j) => j !== i))} />
          ))}
        </ul>
        {chosen.length < MAX_PROGRAMS && (
          <button type="button" className="btn" onClick={() => setChosen([...chosen, { kind: 'double', code: null }])}>
            + 다전공 추가
          </button>
        )}
      </div>

      <label className="field">
        <span>영어 성적 (실용영어 대체)</span>
        <input
          type="text"
          placeholder="예: TOEIC 750"
          value={profile.english_test ?? ''}
          maxLength={50}
          onChange={(e) => set('english_test', e.target.value || null)}
        />
      </label>
      <fieldset className="checks">
        <legend className="sr-only">해당 사항</legend>
        {FLAGS.map((f) => (
          <label key={f.key} className="check">
            <input type="checkbox" checked={!!profile[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
            <span>{f.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
