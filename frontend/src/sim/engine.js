// 수강신청 연습 — 화면과 무관한 계산 (시간 중복, 학점 한도, 다른 학생들의 신청 경쟁 모델)
//
// 경쟁 모델: 실제로 수집된 '신청인원·꾸러미 인원'을 수요로 보고, 신청 시작 뒤 다른 학생들이
// 지수적으로 몰려 자리가 찬다고 가정한다. 인기가 많을수록(수요/정원 ↑) 더 빨리 찬다.
//   신청된 수(t) = 수요 × (1 − e^(−t/τ)),  τ = BASE_TAU / (수요/정원)
// 실제 학교 서버 동작을 재현한 것이 아니라 연습용 근사치다.

const BASE_TAU = 25 // 초 — 수요가 정원과 같을 때 63%가 차는 데 걸리는 시간

export function demandOf(course) {
  const cap = course.capacity || 0
  const seen = Math.max(course.applied || 0, course.basket || 0)
  return Math.max(seen, Math.round(cap * 0.4))
}

// 분반마다 조금씩 다르게 (같은 분반은 항상 같은 값)
function jitter(id) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 0.75 + (h % 1000) / 2000 // 0.75 ~ 1.25
}

function hash(text, salt = 0) {
  let h = 2166136261 ^ salt
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

function tauOf(course) {
  const ratio = Math.max(demandOf(course) / course.capacity, 0.05)
  return (BASE_TAU / ratio) * jitter(course.id)
}

/** 정원이 다 차는 시각(신청 시작 후 초). 수요가 정원보다 적으면 Infinity */
export function fillTime(course) {
  const cap = course.capacity || 0
  const demand = demandOf(course)
  if (!cap || demand <= cap) return Infinity
  return -tauOf(course) * Math.log(1 - cap / demand)
}

// 여석 매매 방지 규칙: 마감 뒤 취소로 생긴 빈자리는 '무작위 시간이 지난 뒤' 열린다.
// 분반마다 30~90초 간격으로, 그 안의 무작위 시점에 RELEASE_WINDOW초 동안 1자리가 열린다고 가정 (연습용).
const RELEASE_WINDOW = 2.5

export function releaseOpen(course, elapsedSec, busy = 1) {
  const full = fillTime(course)
  if (!Number.isFinite(full) || elapsedSec < full + 10) return false
  // busy > 1: 수강정정 기간처럼 취소가 잦을 때 더 자주 열린다
  const period = Math.max(8, Math.round((30 + (hash(course.id) % 61)) / busy))
  const k = Math.floor((elapsedSec - full) / period)
  const start = full + k * period + (hash(course.id, k + 1) % (period - RELEASE_WINDOW))
  return elapsedSec >= start && elapsedSec < start + RELEASE_WINDOW
}

/** 신청 시작 후 elapsed초에 남은 자리 (내가 신청한 자리 제외) */
export function seatsLeft(course, elapsedSec, busy = 1) {
  const cap = course.capacity || 0
  if (!cap) return Infinity // 정원 정보가 없는 분반은 제한 없음으로
  if (elapsedSec <= 0) return cap
  const demand = demandOf(course)
  const taken = demand * (1 - Math.exp(-elapsedSec / tauOf(course)))
  const left = Math.max(0, Math.floor(cap - taken))
  return left === 0 && releaseOpen(course, elapsedSec, busy) ? 1 : left
}

// ── 회차별 신청 시작 시각 (2026-2학기 수강신청 안내 기준) ──────────────
// 신입생: 10:00 소속 학과 1학년 과목, 11:00 타 학과 1학년 과목 / 재학생: 14:00 소속 학과 전공
// 전원: 15:00 타 학과 전공, 16:00 교양. 표에 없는 경우(신입생의 소속 학과 2학년 이상 과목 등)는 15:00으로 둔다(추정).
export const ROUNDS = [
  { at: 10 * 3600, label: '10:00 신입생 · 소속 학과 1학년 과목', freshman: true },
  { at: 11 * 3600, label: '11:00 신입생 · 타 학과 1학년 과목', freshman: true },
  { at: 14 * 3600, label: '14:00 재학생 · 소속 학과 전공', freshman: false },
  { at: 15 * 3600, label: '15:00 전원 · 타 학과 전공' },
  { at: 16 * 3600, label: '16:00 전원 · 교양' },
]

export const isLiberal = (c) => c.code.startsWith('CLTR') || c.type === '교양'

/** 이 학생에게 이 분반의 신청이 열리는 시각 (자정부터 초) */
export function openTimeOf(course, { freshman, dept }) {
  if (isLiberal(course)) return 16 * 3600
  const own = course.dept_code === dept
  if (freshman) {
    if (course.grade === 1) return own ? 10 * 3600 : 11 * 3600
    return 15 * 3600
  }
  return own ? 14 * 3600 : 15 * 3600
}

export const fmtSec = (sec) => {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

export function competition(course) {
  const cap = course.capacity || 0
  if (!cap) return null
  return demandOf(course) / cap
}

/** 두 분반의 강의 시간이 겹치면 겹치는 요일·교시 목록 */
export function overlap(a, b) {
  const set = new Set((a.slots ?? []).map(([d, s]) => `${d}${s}`))
  return (b.slots ?? []).filter(([d, s]) => set.has(`${d}${s}`)).map(([d, s]) => `${d} ${s}`)
}

/**
 * 신청 가능 여부 판정. 반환: { ok: true } 또는 { ok: false, code, message }
 * 메시지 문구는 실제 사이트 문구를 그대로 옮긴 것이 아니라 연습용 안내문이다.
 */
// ── 학과·대상 제한 분반 (강좌 비고란 문구로 판정) ────────────────────
// 비고란은 자유 문구라 아래 몇 가지 확실한 형태만 막는다. 나머지는 비고를 보여 주기만 한다.
export function restrictionOf(course, student) {
  const r = course.remark || ''
  if (/본교생\s*수강\s*불가|본교\s*학생들의\s*수강을\s*금/.test(r)) return '타 대학 교류 학생 전용 분반입니다 (본교생 수강 불가).'
  const mine = [student.deptName, student.college, ...(student.aliases ?? [])].filter(Boolean)
  const isMine = (who) => mine.some((m) => who.includes(m) || m.includes(who))
  let m = /([^\s]+(?:\s[^\s]+)?)\s*학생\s*수강\s*불가/.exec(r)
  if (m && isMine(m[1].trim())) return `${m[1].trim()} 학생은 수강할 수 없는 분반입니다.`
  m = /([^\s]+)\s*재학생들?만\s*신청\s*가능/.exec(r)
  if (m && !isMine(m[1])) return `${m[1]} 재학생만 신청할 수 있는 분반입니다.`
  m = /\[수강\s*대상\]\s*([^()\[\]]+?)\s*학생/.exec(r)
  if (m && !/이외|일반선택/.test(m[1])) { // '…이외 학생', '…일반선택 학생'은 타 학과 학생도 들을 수 있음
    const who = m[1].replace(/\d{2}(~\d{2})?학번/g, '').trim()
    if (who && !isMine(who.split(' ')[0])) return `수강 대상이 정해진 분반입니다: ${m[1]} 학생`
  }
  m = /(\S+융합전공)\s*대상강좌/.exec(r)
  if (m && !(student.programs ?? []).includes(m[1])) return `${m[1]} 이수자 대상 강좌입니다.`
  return null
}

export function check(course, { registered, maxCredits, elapsedSec, open, opensAt, student, busy }) {
  if (!open) return { ok: false, code: 'closed', message: '수강신청 기간이 아닙니다. (연습: 시작 시간 전)' }
  const restricted = student && restrictionOf(course, student)
  if (restricted) return { ok: false, code: 'restricted', message: `수강 제한: ${restricted}` }
  if (elapsedSec < 0) {
    return { ok: false, code: 'not-yet', message: `아직 이 과목의 신청 시간이 아닙니다. ${opensAt ?? ''}부터 신청할 수 있습니다.` }
  }
  if (registered.some((r) => r.id === course.id)) {
    return { ok: false, code: 'dup', message: '이미 신청한 분반입니다.' }
  }
  const same = registered.find((r) => r.code === course.code)
  if (same) return { ok: false, code: 'same', message: `같은 교과목(${same.id})을 이미 신청했습니다.` }
  const credits = registered.reduce((s, r) => s + (r.credits || 0), 0)
  if (credits + (course.credits || 0) > maxCredits) {
    return { ok: false, code: 'credits', message: `신청 가능 학점(${maxCredits}학점)을 초과합니다. 현재 ${credits}학점` }
  }
  for (const r of registered) {
    const o = overlap(r, course)
    if (o.length) return { ok: false, code: 'time', message: `${r.name}(${r.id})과 강의 시간이 겹칩니다: ${o.slice(0, 3).join(', ')}` }
  }
  if (seatsLeft(course, elapsedSec, busy) <= 0) {
    return { ok: false, code: 'full', message: '수강 정원이 초과되었습니다.' }
  }
  return { ok: true }
}

/** 과목코드-분반 입력 정규화: 'caib0207 1' / 'CAIB0207-001' → 'CAIB0207-001' */
export function normalizeId(text) {
  const m = /([A-Za-z]{4}\d{4})\s*[-_ ]?\s*(\d{1,3})?/.exec(text.trim())
  if (!m) return null
  return `${m[1].toUpperCase()}-${String(m[2] ?? '1').padStart(3, '0')}`
}

// 시간표 그리기용: 'A'/'B'는 30분 단위, 1교시 = 09:00
export function slotRow(slot) {
  const m = /^(\d+)([AB])$/.exec(slot)
  if (!m) return null
  return (Number(m[1]) - 1) * 2 + (m[2] === 'B' ? 1 : 0)
}
