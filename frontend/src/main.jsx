import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import './index.css'

// 이름 변경(AI 수강내비 → trAIl) 전에 저장한 데이터를 새 키로 옮긴다
const RENAMED_KEYS = [
  ['sugang-navi:v1', 'trail:v1'],
  ['sugang-navi:sim-best', 'trail:sim-best'],
  ['sugang-navi:sim-memo', 'trail:sim-memo'],
]
try {
  for (const [from, to] of RENAMED_KEYS) {
    const old = localStorage.getItem(from)
    if (old != null && localStorage.getItem(to) == null) localStorage.setItem(to, old)
    localStorage.removeItem(from)
  }
} catch { /* 저장 불가 환경 */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>{(user) => <App key={user?.id ?? 'local'} user={user} />}</AuthGate>
  </StrictMode>,
)
