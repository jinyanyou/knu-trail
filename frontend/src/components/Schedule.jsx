import { useEffect, useState } from 'react'
import * as api from '../api.js'

function dday(e) {
  if (e.ongoing) return e.days_left > 0 ? `진행 중 · ${e.days_left}일 남음` : '오늘 마감'
  return e.d_day === 0 ? 'D-DAY' : `D-${e.d_day}`
}

// 홈 위쪽 한 줄: 경북대 학사일정 중 진행 중·다가오는 학부 일정 (수강신청·시험·휴학 마감 등)
export default function Schedule() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    api.getSchedule().then((d) => alive && setData(d)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  if (!data?.events?.length) return null
  return (
    <section className="schedule panel" aria-label="학사일정">
      <a className="schedule-title" href={data.source} target="_blank" rel="noreferrer">학사일정 ↗</a>
      <ul className="schedule-list">
        {data.events.slice(0, 5).map((e) => (
          <li key={`${e.start}${e.title}`} className={e.ongoing ? 'ongoing' : e.d_day <= 7 ? 'soon' : ''}>
            <span className="schedule-dday">{dday(e)}</span>
            <span className="schedule-name">{e.title.replace(/\s*\([^)]*\)\s*$/, '')}</span>
            <span className="schedule-date">{e.start.slice(5).replace('-', '.')}{e.end !== e.start ? `~${e.end.slice(5).replace('-', '.')}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
