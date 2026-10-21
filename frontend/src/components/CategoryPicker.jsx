// 과목 분류 직접 지정 — 학과에서 대체 인정받은 과목, 학점교류 과목 등 자동 분류가 다를 때
// 값: '' = 자동(교육과정 기준) / 전공필수 / 전공 / 일반선택 / 교양|영역|세부영역 / program|다전공 코드
const FIXED = ['전공필수', '전공', '일반선택']
const CLEAR = { category: null, area: null, sub_area: null, counts_for: null }

function encode(t, programs) {
  if (t.counts_for && programs.some((p) => p.code === t.counts_for)) return `program|${t.counts_for}`
  if (t.category === '교양') return ['교양', t.area ?? '', t.sub_area ?? ''].join('|')
  return t.category ?? ''
}

function autoLabel(info) {
  if (!info || info.category_override) return '자동'
  const area = info.category === '교양' && info.sub_area ? ` · ${info.sub_area}` : ''
  return `자동 (${info.program ? `다전공 · ${info.program}` : info.category}${area})`
}

export default function CategoryPicker({ course, info, areas = [], programs = [], onChange }) {
  const value = encode(course, programs)
  const choose = (v) => {
    if (!v) return onChange(CLEAR)
    const [kind, ...rest] = v.split('|')
    // 다전공으로 지정: 분류는 그대로 두고 그 전공 학점으로 인정 (엔진의 counts_for)
    if (kind === 'program') return onChange({ ...CLEAR, counts_for: rest[0] })
    // 전공으로 지정하면 다전공과 겹쳐도 주전공(인공지능전공) 학점으로
    const primary = kind === '전공' || kind === '전공필수' ? { counts_for: 'primary' } : {}
    onChange({ ...CLEAR, category: kind, area: rest[0] || null, sub_area: rest[1] || null, ...primary })
  }
  // 저장된 영역이 이번 교양 목록에 없어도 선택값이 사라지지 않게
  const known = !value.startsWith('교양|') || value === '교양||' || areas.some(([a, s]) => `교양|${a}|${s}` === value)
  const list = known ? areas : [...areas, [course.area, course.sub_area]]
  return (
    <select className={`category-pick${value ? ' is-set' : ''}`} aria-label="과목 분류" value={value}
      onChange={(e) => choose(e.target.value)}>
      <option value="">{autoLabel(info)}</option>
      {FIXED.map((c) => <option key={c} value={c}>{c}</option>)}
      {programs.length > 0 && (
        <optgroup label="다전공">
          {programs.map((p) => <option key={p.code} value={`program|${p.code}`}>{p.label} · {p.name}</option>)}
        </optgroup>
      )}
      <optgroup label="교양">
        <option value="교양||">교양 (영역 없음)</option>
        {list.map(([a, s]) => <option key={`${a}|${s}`} value={`교양|${a}|${s}`}>교양 · {a} · {s}</option>)}
      </optgroup>
    </select>
  )
}
