import Mascot from './Mascot.jsx'
import scene from '../assets/trail-scene.svg'

// 로그인·회원가입·동의·불러오는 중 화면이 함께 쓰는 카드: 산길 그림 + 다람쥐 + trAIl 로고 + 서비스 소개
export default function LoginShell({ pose = 'walk', children }) {
  return (
    <div className="login">
      <div className="login-card panel">
        <div className="login-scene" aria-hidden="true">
          <img src={scene} alt="" draggable="false" />
          <Mascot pose={pose} size={104} className="login-mascot" />
        </div>
        <h1 className="brand login-brand" aria-label="trAIl"><span>tr<span className="brand-ai">AI</span>l</span></h1>
        <p className="subtitle">졸업까지 따라가는 길 · 경북대 인공지능전공 졸업요건 대시보드</p>
        {children}
      </div>
    </div>
  )
}
