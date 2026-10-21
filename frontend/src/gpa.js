// 경북대 평점 (4.3 만점). P·S·이수 등은 평점에서 빼고, F는 0점으로 넣는다.
// 성적증명서처럼 소수 셋째 자리에서 버린다 (3.7375 → 3.73)
export const POINTS = {
  'A+': 4.3, A0: 4.0, 'A-': 3.7, 'B+': 3.3, B0: 3.0, 'B-': 2.7,
  'C+': 2.3, C0: 2.0, 'C-': 1.7, 'D+': 1.3, D0: 1.0, 'D-': 0.7, F: 0,
}
export const SEMESTERS = ['1학기', '여름계절', '2학기', '겨울계절']
export const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100

// 평점에 들어가는 과목: 계산에 남은 과목(report.courses) + 아직 재수강하지 않은 F
export function graded(report) {
  const kept = report.courses.filter((c) => c.grade in POINTS)
  const keptCodes = new Set(report.courses.map((c) => c.code))
  const failed = (report.excluded ?? [])
    .filter((x) => x.grade === 'F' && !keptCodes.has(x.code))
    .map((x) => ({ ...x, credits: x.credits ?? 3, category: null, semester: x.semester }))
  return [...kept, ...failed]
}

export function gpa(courses) {
  const credits = courses.reduce((s, c) => s + (c.credits || 0), 0)
  if (!credits) return null
  return floor2(courses.reduce((s, c) => s + (c.credits || 0) * POINTS[c.grade], 0) / credits)
}

export function byTerm(courses) {
  const map = new Map()
  for (const c of courses) {
    const key = `${c.year}|${c.semester}`
    if (!map.has(key)) map.set(key, { year: c.year, semester: c.semester, courses: [] })
    map.get(key).courses.push(c)
  }
  return [...map.values()]
    .sort((a, b) => a.year - b.year || SEMESTERS.indexOf(a.semester) - SEMESTERS.indexOf(b.semester))
    .map((t) => ({ ...t, gpa: gpa(t.courses), credits: t.courses.reduce((s, c) => s + c.credits, 0) }))
}
