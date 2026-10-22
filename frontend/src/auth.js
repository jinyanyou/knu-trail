import { createClient } from '@supabase/supabase-js'

// Supabase 주소·공개 키가 있으면 로그인 필수, 없으면(로컬 개발) 이 브라우저에만 저장하는 모드
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const authEnabled = supabase != null

export const PROVIDERS = [
  { id: 'kakao', name: '카카오' },
  { id: 'google', name: 'Google' },
]

// 회원가입 탭에서 동의하고 카카오·Google로 넘어갈 때, 돌아올 때까지 동의 기록을 이 브라우저에 잠깐 맡겨 둔다
// (OAuth는 처음 로그인하는 순간 계정을 만들므로, 돌아온 뒤 새 계정이면 이 동의로 가입을 마친다)
const SIGNUP_KEY = 'trail:signup-consent'
const SIGNUP_TTL_MS = 60 * 60 * 1000

export function holdSignupConsent(record) {
  try {
    localStorage.setItem(SIGNUP_KEY, JSON.stringify(record))
  } catch {
    // 저장이 막혀 있으면 돌아온 뒤 동의 화면을 한 번 더 본다
  }
}

// 맡겨 둔 동의를 꺼낸다 (브라우저에서는 지우고, 이 페이지에서는 기억 — 개발 모드에서 두 번 불려도 같은 값).
// 안내 버전이 다르거나 1시간이 지났으면 무효
let takenSignup
export function takeSignupConsent(version) {
  if (takenSignup === undefined) {
    try {
      const raw = localStorage.getItem(SIGNUP_KEY)
      localStorage.removeItem(SIGNUP_KEY)
      takenSignup = raw ? JSON.parse(raw) : null
    } catch {
      takenSignup = null
    }
  }
  const rec = takenSignup
  if (!rec || rec.version !== version || Date.now() - Date.parse(rec.agreedAt) > SIGNUP_TTL_MS) return null
  return rec
}

export function dropSignupConsent() {
  try {
    localStorage.removeItem(SIGNUP_KEY)
  } catch {
    // 무시
  }
}

export function signIn(provider) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
}

export const signOut = () => supabase.auth.signOut()

export function displayName(user) {
  const m = user?.user_metadata ?? {}
  return m.full_name || m.name || m.nickname || user?.email || '사용자'
}

// ── 사용자별 데이터: user_state 표 한 줄에 화면 상태 전체(JSON)를 담는다 (supabase/schema.sql) ──

export async function loadUserState(userId) {
  const { data, error } = await supabase.from('user_state').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function saveUserState(userId, state) {
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
  if (error) throw error
}

// 회원 탈퇴 — 계정과 저장된 데이터를 모두 지운다 (supabase/schema.sql 의 delete_my_account)
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  await supabase.auth.signOut({ scope: 'local' })
}
