async function request(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = body.detail
    const msg = Array.isArray(d) ? d.map((x) => x.msg).join(', ') : d
    throw new Error(msg || `요청 실패 (${res.status})`)
  }
  return body
}

export const getMeta = () => request('/api/meta')

export const getPrograms = (entryYear) => request(`/api/programs?entry_year=${entryYear}`)

// programs: 고른 다전공 학과 코드 배열 — 그 학과 과목도 검색·인식되게 한다
export const getCatalog = (entryYear, year, programs = []) =>
  request(`/api/catalog?entry_year=${entryYear}&year=${year}&programs=${encodeURIComponent(programs.join(','))}`)

export const getProgramCourses = (entryYear, code) =>
  request(`/api/program-courses?entry_year=${entryYear}&code=${encodeURIComponent(code)}`)

export const getSimTerms = () => request('/api/sim/terms')

export const getSimTimetable = (term) => request(`/api/sim/timetable?term=${encodeURIComponent(term)}`)

export const getStandardPlan = (entryYear) => request(`/api/standard-plan?entry_year=${entryYear}`)

export const evaluate = (entryYear, taken, profile, signal) =>
  request('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_year: entryYear, taken, profile }),
    signal,
  })

export const importText = (entryYear, text, defaults, useAi, programs = []) =>
  request('/api/import/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry_year: entryYear,
      text,
      default_year: defaults.year || null,
      default_semester: defaults.semester || null,
      use_ai: useAi,
      programs,
    }),
  })

export const importFile = (entryYear, file, defaults, programs = []) => {
  const form = new FormData()
  form.append('file', file)
  form.append('entry_year', entryYear)
  if (defaults.year) form.append('default_year', defaults.year)
  if (defaults.semester) form.append('default_semester', defaults.semester)
  if (programs.length) form.append('programs', programs.join(','))
  return request('/api/import/file', { method: 'POST', body: form })
}

// 오늘의 전공 뉴스·퀴즈 (한국 시간 하루에 하나)
export const getDaily = () => request('/api/daily')

// 남은 졸업요건을 채우는 학기별 계획 (규칙 기반, 졸업 가능 여부까지 검증)
// exclude: 로드맵에서 뺀 과목 코드 — 다시 추천하지 않는다
export const roadmap = (entryYear, taken, profile, maxCredits, exclude = []) =>
  request('/api/roadmap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_year: entryYear, taken, profile, max_credits: maxCredits, exclude }),
  })

// 경북대 학사일정 중 진행 중·다가오는 학부 일정
export const getSchedule = () => request('/api/schedule')
