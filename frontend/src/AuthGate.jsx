import { useEffect, useState } from 'react'
import { authEnabled, dropSignupConsent, holdSignupConsent, PROVIDERS, signIn, supabase } from './auth.js'
import { useHash } from './hash.js'
import { ConsentSummary, consentRecord, PrivacyPage } from './Privacy.jsx'
import { NoticesPage } from './Notices.jsx'
import LoginShell from './components/LoginShell.jsx'

// 로그인한 사용자만 화면(children)을 본다. Supabase 설정이 없으면 로그인 없이 통과(user=null).
// 개인정보 처리 안내(#/privacy)·공지(#/notices)는 로그인 없이도 볼 수 있다.
// 처음이면 [회원가입] 탭에서 개인정보 안내에 동의한 뒤 카카오·Google로 가입, 이미 가입했으면 [로그인] 탭.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [tab, setTab] = useState('login')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState(null)
  const hash = useHash()

  useEffect(() => {
    if (!authEnabled) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (hash === '#/privacy') return <PrivacyPage />
  if (hash === '#/notices') return <NoticesPage />
  if (!authEnabled) return children(null)
  if (session === undefined) return <LoginShell pose="search"><p className="muted login-wait">로그인 확인 중…</p></LoginShell>
  if (session) return children(session.user)

  const go = (provider) => {
    setError(null)
    // 회원가입이면 동의를 맡겨 두고, 로그인이면 예전에 맡겨 둔 게 남지 않게 지운다
    if (tab === 'signup') holdSignupConsent(consentRecord())
    else dropSignupConsent()
    signIn(provider).then(({ error: e }) => e && setError(e.message))
  }
  const signup = tab === 'signup'

  return (
    <LoginShell pose={signup ? 'report' : 'walk'}>
      <div className="login-tabs" role="tablist" aria-label="로그인 또는 회원가입">
        {[['login', '로그인'], ['signup', '회원가입']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''}
            onClick={() => { setTab(id); setError(null) }}>{label}</button>
        ))}
      </div>

      {signup ? (
        <>
          <p className="login-lead">처음 오셨나요? 아래 안내를 확인하고 카카오나 Google 계정으로 가입해 주세요.</p>
          <ConsentSummary agreed={agreed} onChange={setAgreed} />
        </>
      ) : (
        <p className="login-lead">가입한 카카오·Google 계정으로 로그인하세요.</p>
      )}

      <div className="login-buttons">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" className={`btn login-${p.id}`} disabled={signup && !agreed} onClick={() => go(p.id)}>
            {p.name}로 {signup ? '가입하기' : '로그인'}
          </button>
        ))}
      </div>
      {signup && !agreed && <p className="muted">개인정보 수집·이용에 동의해야 가입할 수 있어요.</p>}
      {error && <div className="banner banner-error" role="alert">{signup ? '가입' : '로그인'}하지 못했습니다: {error}</div>}

      <p className="login-note">
        {signup ? (
          <>이미 가입했다면 <button type="button" className="btn-link" onClick={() => setTab('login')}>로그인</button>으로 들어가세요.</>
        ) : (
          <>처음이라면 <button type="button" className="btn-link" onClick={() => setTab('signup')}>회원가입</button>부터 해 주세요.</>
        )}
        {' '}입력한 과목·성적은 내 계정에 저장되어 본인만 볼 수 있습니다. 학교 포털 아이디·비밀번호는 묻지 않습니다.
      </p>
    </LoginShell>
  )
}
