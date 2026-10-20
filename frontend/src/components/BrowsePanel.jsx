import { useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'

// 학교 '수업시간표/교과목 조회'처럼 분류를 고르면 해당 과목이 뜬다
const CATEGORIES = [
  { value: 'ai', label: '인공지능전공' },
  { value: 'la', label: '교양' },
  { value: 'program', label: '내 다전공' },
  { value: 'other', label: '다른 학과 (일반선택)' },
]
const GRADES = [1, 2, 3, 4]

function Select({ label, value, onChange, children }) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  )
}

export default function BrowsePanel({ entryYear, catalog, programs, myPrograms, takenCodes, onAdd }) {
  const [cat, setCat] = useState('ai')
  const [type, setType] = useState('')
  const [grade, setGrade] = useState('')
  const [area, setArea] = useState('')
  const [subArea, setSubArea] = useState('')
  const [sdgOnly, setSdgOnly] = useState(false)
  const [college, setCollege] = useState('')
  const [dept, setDept] = useState('')
  const [deptCourses, setDeptCourses] = useState({ code: null, list: [], loading: false })

  const ai = useMemo(() => catalog.filter((c) => c.category === '전공필수' || c.category === '전공'), [catalog])
  const la = useMemo(() => catalog.filter((c) => c.category === '교양'), [catalog])
  const areas = useMemo(() => [...new Set(la.map((c) => c.area))].filter(Boolean).sort(), [la])
  const subAreas = useMemo(
    () => [...new Set(la.filter((c) => c.area === area).map((c) => c.sub_area))].filter(Boolean).sort(),
    [la, area],
  )
  const colleges = useMemo(
    () => [...new Set(programs.filter((p) => p.kind === 'major').map((p) => p.college ?? '기타'))].sort(),
    [programs],
  )
  const depts = useMemo(
    () => programs.filter((p) => p.kind === 'major' && (p.college ?? '기타') === college),
    [programs, college],
  )

  // 다전공·다른 학과 과목은 고를 때 서버에서 받아 온다
  const deptCode = cat === 'program' ? (dept || myPrograms[0]?.code || '') : cat === 'other' ? dept : ''
  useEffect(() => {
    if (!deptCode) return undefined
    let alive = true
    setDeptCourses({ code: deptCode, list: [], loading: true })
    api.getProgramCourses(entryYear, deptCode)
      .then((r) => alive && setDeptCourses({ code: deptCode, list: r.courses, loading: false }))
      .catch(() => alive && setDeptCourses({ code: deptCode, list: [], loading: false }))
    return () => {
      alive = false
    }
  }, [entryYear, deptCode])

  const list = useMemo(() => {
    if (cat === 'ai') {
      return ai
        .filter((c) => !type || c.category === type)
        .filter((c) => !grade || c.grade === Number(grade))
        .sort((a, b) => (a.grade ?? 9) - (b.grade ?? 9) || a.name.localeCompare(b.name))
        .map((c) => ({ ...c, meta: [c.category, c.grade && `${c.grade}학년`, c.semester].filter(Boolean).join(' · ') }))
    }
    if (cat === 'la') {
      if (!area) return []
      return la
        .filter((c) => c.area === area && (!subArea || c.sub_area === subArea) && (!sdgOnly || c.sdg))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ ...c, meta: [c.sub_area, c.sdg && 'SDG'].filter(Boolean).join(' · ') }))
    }
    if (!deptCode || deptCourses.code !== deptCode) return []
    const name = programs.find((p) => p.code === deptCode)?.name
    return deptCourses.list
      .filter((c) => !type || c.type === type)
      .filter((c) => !grade || c.grade === Number(grade))
      .map((c) => ({
        ...c, program: name,
        meta: [c.type, c.minor_required && '부전공필수', c.grade && `${c.grade}학년`].filter(Boolean).join(' · '),
      }))
  }, [cat, ai, la, type, grade, area, subArea, sdgOnly, deptCode, deptCourses, programs])

  const reset = (next) => {
    setCat(next)
    setType('')
    setGrade('')
    setDept('')
  }

  return (
    <div className="browse">
      <div className="browse-filters">
        <Select label="분류" value={cat} onChange={reset}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value} disabled={c.value === 'program' && myPrograms.length === 0}>
              {c.label}{c.value === 'program' && myPrograms.length === 0 ? ' (내 조건에서 먼저 선택)' : ''}
            </option>
          ))}
        </Select>

        {cat === 'la' && (
          <>
            <Select label="영역" value={area} onChange={(v) => { setArea(v); setSubArea('') }}>
              <option value="">선택</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <Select label="세부 영역" value={subArea} onChange={setSubArea}>
              <option value="">전체</option>
              {subAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <label className="check"><input type="checkbox" checked={sdgOnly} onChange={(e) => setSdgOnly(e.target.checked)} /><span>SDG 교양만</span></label>
          </>
        )}

        {cat === 'program' && (
          <Select label="학과" value={deptCode} onChange={setDept}>
            {myPrograms.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </Select>
        )}

        {cat === 'other' && (
          <>
            <Select label="대학" value={college} onChange={(v) => { setCollege(v); setDept('') }}>
              <option value="">선택</option>
              {colleges.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="학과" value={dept} onChange={setDept}>
              <option value="">선택</option>
              {depts.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </Select>
          </>
        )}

        {cat !== 'la' && (
          <>
            <Select label="구분" value={type} onChange={setType}>
              <option value="">전체</option>
              <option value="전공필수">전공필수</option>
              <option value="전공">전공(선택)</option>
              {cat !== 'ai' && <option value="융합전공">융합전공</option>}
            </Select>
            <Select label="학년" value={grade} onChange={setGrade}>
              <option value="">전체</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </Select>
          </>
        )}
      </div>

      {deptCourses.loading && cat !== 'ai' && cat !== 'la' ? (
        <p className="muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="muted">{cat === 'la' && !area ? '영역을 고르세요.' : cat === 'other' && !dept ? '대학과 학과를 고르세요.' : '해당하는 과목이 없습니다.'}</p>
      ) : (
        <ul className="browse-list" aria-label="과목 목록">
          {list.map((c) => {
            const have = takenCodes.has(c.code)
            return (
              <li key={c.code}>
                <div className="c-main">
                  <span className="c-name">{c.name}</span>
                  <span className="c-meta">{c.code} · {c.credits}학점{c.meta ? ` · ${c.meta}` : ''}</span>
                </div>
                <button type="button" className="btn btn-sm" disabled={have}
                  onClick={() => onAdd({ code: c.code, name: c.name, credits: c.credits })}>
                  {have ? '추가됨' : '추가'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted">{list.length > 0 && `${list.length}과목 · `}아래에서 고른 연도·학기·성적으로 추가됩니다.</p>
    </div>
  )
}
