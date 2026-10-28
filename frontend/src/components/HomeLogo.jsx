import mountain from '../assets/logo-mountain.png'

// 홈 상단 로고 — 팀 디자인 초안(디자인 초안/TrAIil 졸업 로드맵.html)의 로고를 그대로 옮김.
// 1024x765 그림판에 'Tr·I·l' 글자(제주돌담체)와 'A' 자리의 다람쥐+초록 산 그림을 놓고 통째로 줄인다.
// 크기는 CSS 변수 --s(줄임 비율)로만 바꾼다
export function LogoMark() {
  return (
    <span className="hl-mark" aria-hidden="true">
      <span className="hl-canvas">
        <img src={mountain} alt="" className="hl-mountain" />
        <svg width="1024" height="765" viewBox="0 0 1024 765" className="hl-letters">
          <g fontFamily="JejuStoneWall, sans-serif" fontSize="247" fill="#1b1a17">
            <text x="76.7" y="595">T</text>
            <text x="264.3" y="589">r</text>
            <text x="656.3" y="561" fill="#1a5a35">I</text>
            <text x="813.9" y="548">l</text>
          </g>
        </svg>
      </span>
    </span>
  )
}

export default function HomeLogo({ subtitle }) {
  return (
    <div className="topbar-title hl">
      <a className="hl-link" href="#" aria-label="TrAIl 홈"><LogoMark /></a>
      <div className="hl-text">
        <h1 className="hl-tilt">
          <span className="hl-name">트레일</span>
          <span className="hl-slogan">졸업까지 따라가는 길</span>
        </h1>
        {subtitle && <p className="hl-sub">{subtitle}</p>}
      </div>
    </div>
  )
}
