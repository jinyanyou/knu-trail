import { useEffect, useState } from 'react'
import BrandMark from './BrandMark.jsx'
import Mascot from './Mascot.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import CourseEditor from './CourseEditor.jsx'

const STEPS = ['학번', '다전공·조건', '들은 과목']

// 처음 로그인한 사용자: 학번 → 다전공·조건 → 들은 과목 순서로 안내한다. 끝나면 대시보드로
// editing(프로필 설정): 같은 화면을 탭처럼 아무 단계나 골라 고친다
// 처음 설정할 때 단계마다 다람쥐가 건네는 말
const GUIDE = [
  { pose: 'walk', text: '반가워요! 졸업까지 같이 걸어갈게요. 몇 학번인지부터 알려 주세요.' },
  { pose: 'think', text: '복수전공·융합전공 같은 조건이 있으면 골라 주세요. 없으면 그냥 넘어가도 돼요.' },
  { pose: 'report', text: '지금까지 들은 과목을 알려 주면 남은 길을 계산해 드려요.' },
]

export default function Setup({ meta, state, programs, programCodes, report, editing = false, initialStep = 0, onChange, onAddProgram, onDone }) {
  const [step, setStep] = useState(initialStep)
  const { entryYear, taken, profile } = state
  const last = step === STEPS.length - 1
  const years = meta?.entry_years ?? [{ year: entryYear }]

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  return (
    <div className="app setup">
      <header className="setup-head">
        {editing && <button type="button" className="btn-link setup-back" onClick={onDone}>← 홈으로</button>}
        <h1 className="brand">{editing
          ? <a className="brand-link" href="#" aria-label="trAIl 홈으로"><BrandMark /><span>tr<span className="brand-ai">AI</span>l</span></a>
          : <span className="brand-link" aria-label="trAIl"><BrandMark /><span>tr<span className="brand-ai">AI</span>l</span></span>}</h1>
        <p className="subtitle">
          {editing ? '프로필 설정 · 바꾼 내용은 바로 저장돼요.'
            : '졸업까지 가는 길을 그리기 전에, 지금 내 위치를 알려 주세요. 언제든 다시 바꿀 수 있어요.'}
        </p>
      </header>

      {editing ? (
        <div className="tabs setup-tabs" role="tablist">
          {STEPS.map((s, i) => (
            <button key={s} type="button" role="tab" aria-selected={i === step} className={i === step ? 'on' : ''}
              onClick={() => setStep(i)}>{s}</button>
          ))}
        </div>
      ) : (
        <ol className="steps" aria-label="시작 설정 단계">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>{s}</li>
          ))}
        </ol>
      )}

      <div className="setup-body">
        {!editing && GUIDE[step] && (
          <p className="setup-guide with-mascot"><Mascot pose={GUIDE[step].pose} size={56} /><span>{GUIDE[step].text}</span></p>
        )}
        {step === 0 && (
          <div className="card">
            <h2>몇 학번인가요?</h2>
            <div className="year-cards">
              {years.map((y) => (
                <button key={y.year} type="button" aria-pressed={y.year === entryYear}
                  onClick={() => onChange({ entryYear: y.year })}>
                  {y.year}학번
                  {y.status === 'provisional' && <small>임시 기준</small>}
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <ProfilePanel profile={profile} programs={programs} onChange={(p) => onChange({ profile: p })} />
        )}
        {step === 2 && (
          <>
            <p className="muted">성적표를 가져오거나, 표준 이수 모형으로 빠르게 채운 뒤 고칠 수 있어요. 신입생이면 비워 두고 시작해도 돼요.</p>
            <CourseEditor entryYear={entryYear} aiEnabled={!!meta?.ai_enabled} programs={programs}
              programCodes={programCodes} taken={taken} report={report} onChange={(t) => onChange({ taken: t })}
              onEntryYear={(y) => onChange({ entryYear: y })} onAddProgram={onAddProgram} />
          </>
        )}
      </div>

      <nav className="setup-nav">
        {editing ? (
          <>
            <span className="muted">{state.entryYear}학번 · {taken.length}과목</span>
            <button type="button" className="btn btn-primary" onClick={onDone}>완료</button>
          </>
        ) : <>
        {step > 0 ? (
          <button type="button" className="btn" onClick={() => setStep(step - 1)}>← 이전</button>
        ) : (
          <button type="button" className="btn-link" onClick={onDone}>건너뛰고 바로 보기</button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
          {last ? `시작하기${taken.length ? ` (${taken.length}과목)` : ''}` : '다음 →'}
        </button>
        </>}
      </nav>
    </div>
  )
}
