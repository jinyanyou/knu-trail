import { useEffect, useState } from 'react'
import BrandMark from './components/BrandMark.jsx'

// 공지사항·업데이트 기록. 새 소식은 맨 위에 추가한다 (id는 겹치지 않게, 날짜는 YYYY-MM-DD)
// kind: notice(공지) / update(업데이트)
export const NOTICES = [
  {
    id: '2026-10-27-update',
    date: '2026-10-27',
    kind: 'update',
    title: '졸업 로드맵이 산길 지도로 바뀌었어요',
    items: [
      '학기마다 쌓은 누적 학점이 산의 높이가 되는 산길 지도를 그려요. 길 위의 학기를 누르면 그 학기 카드로 가요.',
      '융합·복수전공 등 다전공은 아래에 두 번째 길로 따로 보여 줘요.',
      '학기별 짐 꾸러미: 지난 학기까지 학기마다 과목 구성을 카드로 보여 줘요.',
      '재수강한 과목은 재수강 전·후 학기에 모두 보이고, 누적 학점에는 한 번만 들어가요.',
      '학생상담지도교수 상담 횟수를 홈에서 바로 입력하고 고칠 수 있어요.',
      '어느 화면에서든 trAIl 로고를 누르면 홈으로 돌아와요.',
      '폰에서는 오늘의 뉴스·퀴즈가 맨 아래로 내려가고, 홈 버튼 크기를 맞췄어요.',
    ],
  },
  {
    id: '2026-10-27-notice',
    date: '2026-10-27',
    kind: 'notice',
    title: 'trAIl 이용 안내',
    items: [
      '졸업요건 계산은 학교·학과 공식 기준을 바탕으로 하지만 참고용이에요. 최종 확인은 학과 사무실에서 해 주세요.',
      '무료 서버를 쓰고 있어서, 한동안 아무도 접속하지 않으면 첫 화면이 열리기까지 30초~1분 걸릴 수 있어요.',
      '틀린 계산이나 불편한 점은 개인정보 처리 안내에 적힌 연락처로 알려 주세요.',
    ],
  },
  {
    id: '2026-10-23-update',
    date: '2026-10-23',
    kind: 'update',
    title: '카카오·Google 로그인과 회원가입',
    items: [
      '카카오·Google 계정으로 가입하고, 내 과목·성적이 계정에 저장돼요.',
      '수강신청 연습을 폰 화면에 맞게 정리했어요.',
      '학사모 다람쥐 캐릭터가 곳곳에서 안내해 줘요.',
      '카카오톡으로 링크를 공유하면 미리보기 그림이 떠요.',
    ],
  },
  {
    id: '2026-10-23-notice',
    date: '2026-10-23',
    kind: 'notice',
    title: '개인정보 처리 안내가 바뀌었어요',
    items: [
      '개인정보 보호책임자와 연락처, 데이터를 보관하는 서버 위치를 안내에 추가했어요.',
      '기존 회원은 다음 접속 때 한 번 다시 동의해 주세요.',
    ],
    link: { href: '#/privacy', label: '개인정보 처리 안내 보기' },
  },
  {
    id: '2026-10-22-update',
    date: '2026-10-22',
    kind: 'update',
    title: '졸업 로드맵·성적 통계·학사일정 추가',
    items: [
      '남은 졸업요건을 채우는 학기별 수강 계획(졸업 로드맵)을 짜 줘요.',
      '졸업 시뮬레이션: 조건을 바꿔 보고 마음에 들면 적용할 수 있어요.',
      '성적 통계(4.3 만점), 학사일정 D-day, 오늘의 AI 뉴스와 퀴즈를 넣었어요.',
      '상대평가 권장 과목(A 최대 50%)을 표시해요.',
      '성적증명서 PDF로 들은 과목을 한 번에 가져올 수 있어요.',
    ],
  },
  {
    id: '2026-10-20-update',
    date: '2026-10-20',
    kind: 'update',
    title: 'trAIl 첫 공개',
    items: [
      '경북대 인공지능전공 졸업요건 대시보드: 들은 과목을 넣으면 남은 요건을 계산해요.',
      '복수·융합·부·연계전공을 함께 계산해요.',
      '수강신청 연습(시뮬레이션)을 해 볼 수 있어요.',
    ],
  },
]

const KIND_LABEL = { notice: '공지', update: '업데이트' }
const SEEN_KEY = 'trail:notice-seen'

// 마지막으로 본 소식 — 이 브라우저에만 기억 (못 읽어도 화면은 그대로)
export function useNoticeSeen() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY)
    } catch {
      return null
    }
  })
  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, NOTICES[0].id)
    } catch { /* 저장 불가 환경 */ }
    setSeen(NOTICES[0].id)
  }
  const unseen = seen ? NOTICES.findIndex((n) => n.id === seen) : NOTICES.length
  return { unseen: Math.max(0, unseen), markSeen }
}

// 홈 위 한 줄: 가장 최근 소식
export function NoticeBar() {
  const { unseen } = useNoticeSeen()
  const latest = NOTICES[0]
  return (
    <a className="notice-bar" href="#/notices">
      <span className={`notice-kind k-${latest.kind}`}>{KIND_LABEL[latest.kind]}</span>
      <span className="notice-bar-title">{latest.title}</span>
      {unseen > 0 && <span className="notice-new" aria-label={`새 소식 ${unseen}개`}>NEW</span>}
      <span className="notice-bar-more">전체 보기 ›</span>
    </a>
  )
}

// #/notices — 공지사항·업데이트 기록 (로그인 없이도 열림)
export function NoticesPage() {
  const [tab, setTab] = useState('all')
  const { markSeen } = useNoticeSeen()
  useEffect(() => {
    markSeen()
    window.scrollTo(0, 0)
  }, [])
  const list = NOTICES.filter((n) => tab === 'all' || n.kind === tab)
  return (
    <div className="app notices">
      <header className="setup-head">
        <a className="btn-link setup-back" href="#">← 홈으로</a>
        <h1 className="brand"><a className="brand-link" href="#" aria-label="trAIl 홈으로"><BrandMark /></a><span>공지 · 업데이트</span></h1>
        <p className="subtitle">trAIl 소식과 바뀐 점을 모아 뒀어요.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="소식 종류">
        {[['all', '전체'], ['notice', '공지'], ['update', '업데이트']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <ol className="notice-list">
        {list.map((n) => (
          <li key={n.id} className="panel notice-item">
            <div className="notice-head">
              <span className={`notice-kind k-${n.kind}`}>{KIND_LABEL[n.kind]}</span>
              <time dateTime={n.date} className="muted">{n.date.replaceAll('-', '. ')}</time>
            </div>
            <h2 className="display notice-title">{n.title}</h2>
            <ul className="notice-items">{n.items.map((t) => <li key={t}>{t}</li>)}</ul>
            {n.link && <a className="btn-link notice-link" href={n.link.href}>{n.link.label} ›</a>}
          </li>
        ))}
      </ol>
    </div>
  )
}
