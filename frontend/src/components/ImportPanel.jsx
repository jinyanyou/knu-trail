import { useEffect, useRef, useState } from 'react'
import Mascot from './Mascot.jsx'
import * as api from '../api.js'
import { GRADES } from './CourseEditor.jsx'

const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
const METHOD_LABEL = {
  code: '코드 일치',
  name_exact: '이름 일치',
  name_contains: '이름 포함',
  name_fuzzy: '비슷한 이름',
  'ai+code': 'AI · 코드 일치',
  'ai+name_exact': 'AI · 이름 일치',
  'ai+name_contains': 'AI · 이름 포함',
  'ai+name_fuzzy': 'AI · 비슷한 이름',
  ai: 'AI · 교육과정에 없음',
  other_school: '다른 대학 학점교류',
}
const PLACEHOLDER = `예) 포털 성적 조회 화면이나 시간표를 복사해서 붙여넣기

2025학년도 1학기
CAIB0227  인공지능수학1  3  A+
프로그래밍 기초와 실습  4  B+
2025학년도 2학기
이산수학, 컴퓨팅사고와 SW코딩`

const newId = () => Math.random().toString(36).slice(2, 10)

// 연도 고르기: 학번부터 6년 + 인식된 과목의 연도 (학번을 잘못 골라도 인식한 연도가 사라지지 않게)
const yearOptions = (entryYear, rows = []) =>
  [...new Set([...Array.from({ length: 6 }, (_, i) => entryYear + i), ...rows.map((r) => r.year).filter(Boolean)])].sort()

export default function ImportPanel({ entryYear, aiEnabled, programCodes = [], taken, onAdd, onClose, onEntryYear, onAddProgram }) {
  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [useAi, setUseAi] = useState(false)
  const [defaults, setDefaults] = useState({ year: '', semester: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState(null)

  const recognize = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const d = { year: defaults.year ? Number(defaults.year) : null, semester: defaults.semester || null }
      const r = mode === 'text'
        ? await api.importText(entryYear, text, d, useAi, programCodes)
        : await api.importFile(entryYear, file, d, programCodes)
      setResult(r)
      // 성적증명서는 학교가 발급한 기록이라 교육과정에 없는 과목(학점교류·일반선택)도 기본으로 넣는다
      const certified = r.format === 'certificate'
      setRows(r.candidates.map((c) => ({ ...c, id: newId(), include: c.matched || certified })))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 증명서를 보고 학번을 바꾸거나 다전공을 추가하면, 바뀐 조건의 교육과정으로 다시 인식한다
  const rerun = useRef(false)
  const programKey = programCodes.join(',')
  useEffect(() => {
    if (rerun.current) {
      rerun.current = false
      recognize()
    }
  }, [entryYear, programKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const hint = result?.entry_year_hint
  const switchYear = () => {
    rerun.current = true
    onEntryYear(hint)
  }
  const programHints = onAddProgram ? (result?.program_hints ?? []) : []
  const addPrograms = () => {
    rerun.current = true
    onAddProgram(programHints)
  }

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const chosen = rows.filter((r) => r.include)
  const missingTerm = chosen.filter((r) => !r.year || !r.semester)

  const add = () => {
    // 성적증명서는 공식 기록 — 같은 과목이 이미 있으면(빠르게 채우기·예정 등) 증명서 것으로 바꾼다
    const certified = result?.format === 'certificate'
    const replace = new Set(certified ? chosen.filter((r) => r.matched).map((r) => r.code) : [])
    const have = new Set(taken.filter((t) => !replace.has(t.code)).map((t) => `${t.code}|${t.year}|${t.semester}`))
    const fresh = []
    let skipped = 0
    for (const r of chosen) {
      const course = r.matched
        ? { code: r.code, year: r.year, semester: r.semester, grade: r.grade || null }
        : { code: `ETC-${newId()}`, name: r.name, credits: r.credits || 3, year: r.year, semester: r.semester, grade: r.grade || null }
      const key = `${course.code}|${course.year}|${course.semester}`
      if (r.matched && have.has(key)) {
        skipped += 1
        continue
      }
      have.add(key)
      fresh.push(course)
    }
    // 증명서를 다시 올려도 교육과정에 없는 과목(ETC)이 쌓이지 않게 같은 이름·학기는 건너뛴다
    const etcKeys = new Set(taken.filter((t) => t.code.startsWith('ETC-')).map((t) => `${t.name}|${t.year}|${t.semester}`))
    const deduped = fresh.filter((c) => !c.code.startsWith('ETC-') || !etcKeys.has(`${c.name}|${c.year}|${c.semester}`))
    skipped += fresh.length - deduped.length
    const replaced = taken.filter((t) => replace.has(t.code)).length
    onAdd(deduped, replace)
    setMessage(`${deduped.length}과목을 추가했어요${replaced ? ` (기존 ${replaced}과목은 증명서 기록으로 바꿈)` : ''}${skipped ? ` (이미 있는 ${skipped}과목은 건너뜀)` : ''}.`)
    setResult(null)
    setRows([])
    setText('')
    setFile(null)
  }

  const canRecognize = mode === 'text' ? text.trim().length > 0 : !!file
  const fileNeedsAi = mode === 'file' && file && file.type !== 'application/pdf' && !aiEnabled

  return (
    <div className="import">
      <div className="import-head">
        <h3 className="with-mascot"><Mascot pose="report" size={40} />성적표·시간표 가져오기</h3>
        <button type="button" className="icon-btn" aria-label="가져오기 닫기" onClick={onClose}>✕</button>
      </div>

      {!result && (
        <>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>텍스트 붙여넣기</button>
            <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>사진·PDF 올리기</button>
          </div>

          {mode === 'text' ? (
            <textarea rows={7} value={text} maxLength={50000} placeholder={PLACEHOLDER} aria-label="붙여넣을 텍스트"
              onChange={(e) => setText(e.target.value)} />
          ) : (
            <div className="file-drop">
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" aria-label="파일 선택"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="muted">
                성적표 PDF는 바로 인식돼요. 시간표 캡처 같은 사진은 AI 인식이 필요해요
                {aiEnabled ? '.' : ' (현재 서버에서 꺼져 있음).'}
              </p>
            </div>
          )}

          <div className="row term-defaults">
            <span className="muted">학기 정보가 없을 때</span>
            <select aria-label="기본 연도" value={defaults.year} onChange={(e) => setDefaults({ ...defaults, year: e.target.value })}>
              <option value="">연도</option>
              {Array.from({ length: 6 }, (_, i) => entryYear + i).map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select aria-label="기본 학기" value={defaults.semester} onChange={(e) => setDefaults({ ...defaults, semester: e.target.value })}>
              <option value="">학기</option>
              {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          {mode === 'text' && aiEnabled && (
            <label className="check">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              <span>AI로 인식 (형식이 복잡할 때)</span>
            </label>
          )}
          {aiEnabled && (useAi || mode === 'file') && (
            <p className="muted">AI 인식을 쓰면 자료가 Claude API(Anthropic)로 전송돼요. 이 서비스는 자료를 저장하지 않습니다.</p>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary" disabled={!canRecognize || loading || fileNeedsAi} onClick={recognize}>
            {loading ? '인식 중…' : '인식하기'}
          </button>
        </>
      )}

      {message && !result && <p className="ok" role="status">{message}</p>}

      {result && (
        <div className="preview">
          {hint && hint !== entryYear && onEntryYear && (
            <div className="banner banner-warn" role="status">
              성적증명서의 입학연도는 <b>{hint}년</b>인데 학번이 <b>{entryYear}학번</b>으로 되어 있어요.{' '}
              <button type="button" className="btn-link" onClick={switchYear}>{hint}학번으로 바꾸고 다시 인식</button>
            </div>
          )}
          {programHints.length > 0 && !(hint && hint !== entryYear) && (
            <div className="banner banner-warn" role="status">
              성적증명서에 <b>{programHints.map((h) => h.name).join(', ')}</b>이 있어요. 다전공에 추가하면 그 전공 과목도 인식해요.{' '}
              <button type="button" className="btn-link" onClick={addPrograms}>다전공에 추가하고 다시 인식</button>
            </div>
          )}
          <p className="muted">
            {rows.length}과목 인식
            {rows.some((r) => r.confidence === 'low' || !r.matched) && ' · 표시된 과목은 맞는지 확인해 주세요'}
          </p>
          <ul className="preview-list">
            {rows.map((r) => (
              <li key={r.id} className={`conf-${r.confidence}`}>
                <label className="p-main">
                  <input type="checkbox" checked={r.include} onChange={(e) => setRow(r.id, { include: e.target.checked })} />
                  <span>
                    <span className="c-name">{r.name}</span>
                    <span className="c-meta">
                      {r.credits ? `${r.credits}학점 · ` : ''}{r.program ? `다전공 · ${r.program}` : (r.category ?? '직접 입력으로 추가')} ·{' '}
                      <em className={`method m-${r.confidence}`}>{METHOD_LABEL[r.method] ?? '교육과정에 없음'}</em>
                    </span>
                    {r.confidence === 'low' && <span className="c-meta">원문: {r.source}</span>}
                  </span>
                </label>
                <div className="p-fields">
                  <select aria-label="연도" value={r.year ?? ''} className={r.include && !r.year ? 'invalid' : ''}
                    onChange={(e) => setRow(r.id, { year: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">연도</option>
                    {yearOptions(entryYear, rows).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select aria-label="학기" value={r.semester ?? ''} className={r.include && !r.semester ? 'invalid' : ''}
                    onChange={(e) => setRow(r.id, { semester: e.target.value || null })}>
                    <option value="">학기</option>
                    {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <select aria-label="성적" value={r.grade ?? ''} onChange={(e) => setRow(r.id, { grade: e.target.value || null })}>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="">예정</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>

          {result.unmatched_lines?.length > 0 && (
            <details className="alts">
              <summary>인식하지 못한 줄 {result.unmatched_lines.length}개</summary>
              <ul>{result.unmatched_lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}

          {missingTerm.length > 0 && <p className="error">{missingTerm.length}과목의 연도·학기를 골라 주세요.</p>}
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!chosen.length || missingTerm.length > 0} onClick={add}>
              선택한 {chosen.length}과목 추가
            </button>
            <button type="button" className="btn" onClick={() => { setResult(null); setRows([]) }}>다시 인식</button>
          </div>
        </div>
      )}
    </div>
  )
}
