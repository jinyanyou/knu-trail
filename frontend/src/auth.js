import { createClient } from '@supabase/supabase-js'

// Supabase 주소·공개 키가 있으면 로그인 필수, 없으면(로컬 개발) 이 브라우저에만 저장하는 모드
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const authEnabled = supabase != null

export const PROVIDERS = [
  { id: 'kakao', label: '카카오로 시작하기' },
  { id: 'google', label: 'Google로 시작하기' },
]

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
