import { useEffect, useState } from 'react'
import { authEnabled, PROVIDERS, signIn, supabase } from './auth.js'
import { useHash } from './hash.js'
import { PrivacyPage } from './Privacy.jsx'
import BrandMark from './components/BrandMark.jsx'

// 로그인한 사용자만 화면(children)을 본다. Supabase 설정이 없으면 로그인 없이 통과(user=null).
// 개인정보 처리 안내(#/privacy)는 로그인 없이도 볼 수 있다.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [error, setError] = useState(null)
  const hash = useHash()

  useEffect(() => {
    if (!authEnabled) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (hash === '#/privacy') return <PrivacyPage />
  if (!authEnabled) return children(null)
  if (session === undefined) return <p className="app">로그인 확인 중…</p>
  if (session) return children(session.user)

  const start = (provider) => {
    setError(null)
    signIn(provider).then(({ error: e }) => e && setError(e.message))
  }
  return (
    <div className="login">
      <div className="login-card panel">
        <h1 className="brand login-brand" aria-label="trAIl"><BrandMark /><span>tr<span className="brand-ai">AI</span>l</span></h1>
        <p className="subtitle">졸업까지 따라가는 길 · 경북대 인공지능전공 졸업요건 대시보드</p>
        <div className="login-buttons">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" className={`btn login-${p.id}`} onClick={() => start(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {error && <div className="banner banner-error" role="alert">로그인하지 못했습니다: {error}</div>}
        <p className="login-note">
          입력한 과목·성적은 내 계정에 저장되어 다른 기기에서도 이어서 볼 수 있고, 본인만 볼 수 있습니다.
          처음 로그인할 때 한 번 <a href="#/privacy">개인정보 수집·이용</a> 동의를 받습니다.
          {' '}학교 포털 아이디·비밀번호는 묻지 않습니다.
        </p>
      </div>
    </div>
  )
}
