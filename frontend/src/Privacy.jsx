import { useLayoutEffect, useState } from 'react'
import LoginShell from './components/LoginShell.jsx'

// 내용을 바꾸면 버전을 올린다 → 기존 사용자도 다음 접속 때 다시 동의를 받는다
export const PRIVACY_VERSION = '2026-10-23'
export const OFFICER = { name: '연다(Open)', contact: 'yummyday007@gmail.com' }

export const consentRecord = () => ({ version: PRIVACY_VERSION, agreedAt: new Date().toISOString() })
export const hasConsent = (state) => state?.consent?.version === PRIVACY_VERSION

const ITEMS = [
  ['수집 항목', '(로그인) 카카오·Google 계정 식별값, 이메일, 이름(닉네임) / (직접 입력) 학번(입학연도), 들은·들을 과목과 성적, 다전공·영어 성적 등 졸업요건 조건, 수강신청 연습 기록, 오늘의 퀴즈 풀이 기록'],
  ['이용 목적', '로그인, 졸업요건 계산 결과와 입력 내용의 저장·제공(다른 기기에서 이어 보기)'],
  ['보유 기간', '회원 탈퇴 시 즉시 삭제. 서비스를 종료하면 모든 데이터를 파기합니다.'],
  ['동의 거부', '동의하지 않을 수 있으나, 이 경우 로그인과 서비스 이용이 불가합니다.'],
]

// 동의 요약 (필수 항목 표 + 체크박스)
export function ConsentSummary({ agreed, onChange }) {
  return (
    <div className="consent">
      <p className="consent-title">개인정보 수집·이용 동의 (필수)</p>
      <dl className="consent-table">
        {ITEMS.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="consent-more">
        과목·성적은 Supabase의 서울 리전 서버에 보관하고, 졸업요건 계산은 trAIl 서버(Render, 싱가포르)에서 저장 없이 처리합니다.
        <a className="consent-full" href="#/privacy" target="_blank" rel="noreferrer">개인정보 처리 안내 전문</a>
      </p>
      <label className="consent-check">
        <input type="checkbox" checked={agreed} onChange={(e) => onChange(e.target.checked)} />
        위 내용을 확인했으며 개인정보 수집·이용에 동의합니다.
      </label>
    </div>
  )
}

// 로그인했지만 유효한 동의 기록이 없는 사용자
// mode 'signup': 가입하지 않은 계정으로 [로그인]한 경우 → 동의하면 가입, 취소하면 방금 만들어진 계정 삭제
// mode 'updated': 기존 회원인데 안내 내용(PRIVACY_VERSION)이 바뀐 경우 → 다시 동의, 거부하면 로그아웃
export function ConsentScreen({ mode = 'signup', onAgree, onDecline }) {
  const [agreed, setAgreed] = useState(false)
  const signup = mode === 'signup'
  return (
    <LoginShell pose={signup ? 'think' : 'surprise'}>
      <h2 className="consent-heading">{signup ? '아직 가입하지 않은 계정이에요' : '개인정보 처리 안내가 바뀌었어요'}</h2>
      <p className="login-lead">
        {signup ? '아래 안내에 동의하면 이 계정으로 가입이 완료돼요.' : '바뀐 안내를 확인하고 다시 동의해 주세요. 입력해 둔 내용은 그대로 있어요.'}
      </p>
      <ConsentSummary agreed={agreed} onChange={setAgreed} />
      <button type="button" className="btn btn-primary" disabled={!agreed} onClick={onAgree}>
        {signup ? '동의하고 가입하기' : '동의하고 계속하기'}
      </button>
      <button type="button" className="btn-link" onClick={onDecline}>
        {signup ? '가입하지 않기 (방금 로그인한 계정 정보는 지워져요)' : '동의하지 않음 (로그아웃)'}
      </button>
    </LoginShell>
  )
}

// #/privacy — 개인정보 처리 안내 전문
export function PrivacyPage() {
  // 홈 맨 아래 링크로 들어와도 맨 위부터 보이게 (App 밖에서 그려져 App의 스크롤 초기화가 안 닿음)
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="app privacy">
      <a className="btn-link" href="#">← trAIl로</a>
      <h1>개인정보 처리 안내</h1>
      <p className="subtitle">시행일 {PRIVACY_VERSION}</p>

      <h2>1. 수집하는 항목과 방법</h2>
      <ul>
        <li>카카오·Google 로그인 시 해당 서비스에서 받는 정보: 계정 식별값, 이메일, 이름(닉네임)</li>
        <li>이용자가 직접 입력하는 정보: 학번(입학연도), 들은·들을 과목과 성적, 다전공, 영어 성적 등 졸업요건 조건, 수강신청 연습 기록(최고 기록·희망 과목 메모), 오늘의 퀴즈 풀이 기록(최근 90일)</li>
        <li>학교 포털(knuin 등) 아이디·비밀번호는 수집하지 않습니다.</li>
      </ul>

      <h2>2. 이용 목적</h2>
      <ul>
        <li>로그인과 본인 확인</li>
        <li>입력한 내용을 저장해 졸업요건 계산 결과와 로드맵을 제공하고, 다른 기기에서도 이어서 볼 수 있게 함</li>
      </ul>

      <h2>3. 보유 및 파기</h2>
      <ul>
        <li>회원 탈퇴(계정 메뉴 → 회원 탈퇴) 시 계정 정보와 입력한 모든 데이터를 즉시 삭제합니다.</li>
        <li>서비스를 종료하면 보관 중인 모든 데이터를 파기합니다.</li>
      </ul>

      <h2>4. 처리 위탁 및 국외 이전</h2>
      <ul>
        <li><b>Supabase Inc.</b> — 로그인 처리와 데이터 보관. 데이터는 대한민국 서울 리전(AWS ap-northeast-2) 서버에 저장합니다. 보유 기간은 위 3과 같습니다.</li>
        <li>
          <b>Render Services, Inc. (서버 위치: 싱가포르)</b> — trAIl 서버 운영(국외 이전).
          졸업요건 계산·로드맵·성적표 글자 인식을 위해, 화면을 쓸 때마다 학번·과목·성적·졸업요건 조건을 HTTPS로 보내 계산만 하고
          결과를 돌려준 뒤 저장하지 않습니다.
        </li>
        <li><b>Anthropic PBC (미국)</b> — 성적표·시간표 <em>사진/스캔 PDF</em>의 AI 인식을 이용자가 직접 실행한 경우에만, 그 파일을 인식 목적으로 전송합니다. 인식 결과만 화면에 돌려받으며 trAIl은 원본 파일을 저장하지 않습니다.</li>
        <li>글자로 붙여넣은 성적표·시간표는 AI 서비스로 보내지 않고 trAIl 서버에서 규칙으로만 인식합니다.</li>
      </ul>

      <h2>5. 이용자의 권리</h2>
      <ul>
        <li>입력한 내용은 언제든 화면에서 조회·수정·삭제할 수 있고, 회원 탈퇴로 전부 삭제할 수 있습니다.</li>
        <li>동의를 거부할 수 있으나, 이 경우 로그인과 서비스 이용이 불가합니다.</li>
      </ul>

      <h2>6. 안전성 확보 조치</h2>
      <ul>
        <li>데이터베이스 행 단위 보안으로 로그인한 본인의 데이터만 읽고 쓸 수 있습니다.</li>
        <li>모든 통신은 HTTPS로 암호화됩니다.</li>
      </ul>

      <h2>7. 문의</h2>
      <p>개인정보 보호책임자: {OFFICER.name} · <a href={`mailto:${OFFICER.contact}`}>{OFFICER.contact}</a></p>
      <p className="subtitle">이 안내의 내용이 바뀌면 다음 접속 때 다시 동의를 받습니다.</p>
    </div>
  )
}
