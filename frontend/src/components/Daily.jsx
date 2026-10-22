import { useEffect, useState } from 'react'
import * as api from '../api.js'

const KEEP_DAYS = 90 // 퀴즈 기록은 최근 이만큼만 저장

// 오늘까지 하루도 빠짐없이 퀴즈를 푼 날 수 (오늘 아직 안 풀었으면 어제까지)
function streak(records, today) {
  const d = new Date(`${today}T00:00:00`)
  if (!records[today]) d.setDate(d.getDate() - 1)
  let n = 0
  while (records[d.toLocaleDateString('sv-SE')]) {
    n += 1
    d.setDate(d.getDate() - 1)
  }
  return n
}

function News({ item }) {
  if (item === undefined) return <div className="panel daily-card"><p className="muted">오늘의 뉴스 불러오는 중…</p></div>
  return (
    <div className="panel daily-card">
      <p className="eyebrow">오늘의 AI 뉴스</p>
      {item ? (
        <>
          <a className="news-title" href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
          {item.summary && <p className="news-summary">{item.summary}</p>}
          <p className="muted news-meta">
            {item.source}{item.kind === 'main' ? ' 오늘의 메인 기사' : ''}{item.published ? ` · ${item.published.slice(0, 10)}` : ''}
            <a className="news-link" href={item.link} target="_blank" rel="noreferrer">원문 보기 ↗</a>
          </p>
        </>
      ) : (
        <p className="muted">지금은 뉴스를 가져오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
      )}
    </div>
  )
}

function Quiz({ quiz, records, onAnswer }) {
  if (!quiz) return <div className="panel daily-card"><p className="muted">오늘의 퀴즈 불러오는 중…</p></div>
  const mine = records[quiz.date]?.id === quiz.id ? records[quiz.date] : null
  const done = mine != null
  const solved = Object.values(records).filter((r) => r.correct).length
  const days = streak(records, quiz.date)
  return (
    <div className="panel daily-card quiz">
      {/* 제목 줄과 기록 줄을 나눠, 좁은 칸에서는 기록이 제목 아래 왼쪽에 온다 */}
      <div className="quiz-head">
        <p className="eyebrow">오늘의 전공 퀴즈 <span className="quiz-topic">{quiz.topic}</span></p>
        {(days > 0 || solved > 0) && <p className="quiz-stats">🔥 {days}일 연속 · 맞힌 문제 {solved}개</p>}
      </div>
      <p className="quiz-q">{quiz.question}</p>
      <ol className="quiz-choices">
        {quiz.choices.map((c, i) => {
          const state = !done ? '' : i === quiz.answer ? ' right' : i === mine.choice ? ' wrong' : ' dim'
          return (
            <li key={i}>
              <button type="button" className={`quiz-choice${state}`} disabled={done}
                onClick={() => onAnswer(quiz, i)}>
                <span className="quiz-no">{i + 1}</span>{c}
              </button>
            </li>
          )
        })}
      </ol>
      {done && (
        <div className={`quiz-result ${mine.correct ? 'is-right' : 'is-wrong'}`} role="status">
          <strong>{mine.correct ? '정답이에요!' : `아쉬워요. 정답은 ${quiz.answer + 1}번`}</strong>
          <p>{quiz.explanation}</p>
          <p className="muted">내일 새 문제가 나와요.</p>
        </div>
      )}
    </div>
  )
}

// 홈 위쪽: 하루에 하나씩 바뀌는 전공 뉴스와 퀴즈. 퀴즈 기록은 계정(state.daily)에 저장
export default function Daily({ records = {}, onChange }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    api.getDaily().then((d) => alive && setData(d)).catch(() => alive && setData({ news: null, quiz: null, failed: true }))
    return () => {
      alive = false
    }
  }, [])

  const answer = (quiz, choice) => {
    const cutoff = new Date(`${quiz.date}T00:00:00`)
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
    const keep = Object.fromEntries(Object.entries(records).filter(([d]) => d >= cutoff.toLocaleDateString('sv-SE')))
    onChange({ ...keep, [quiz.date]: { id: quiz.id, choice, correct: choice === quiz.answer } })
  }

  if (data?.failed) return null
  return (
    <section className="daily" aria-label="오늘의 전공 뉴스와 퀴즈">
      <News item={data ? data.news : undefined} />
      <Quiz quiz={data?.quiz} records={records} onAnswer={answer} />
    </section>
  )
}
