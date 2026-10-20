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
