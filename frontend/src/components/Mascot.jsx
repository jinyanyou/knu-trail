// 트레일 다람쥐 (팀 캐릭터 도안). 상황마다 몸짓이 다르다:
// walk 기본·걷기 · cheer 요건 모두 충족 · think 요건 부족·확인 필요 · report 성적표·시간표 가져오기
// search 찾는 중·계산 중 · fighting 로드맵 완성·응원 · surprise 확정 전·주의 · rest 대기·쉬는 중
const urls = import.meta.glob('../assets/mascot/*.svg', { eager: true, query: '?url', import: 'default' })
const src = (pose) => urls[`../assets/mascot/${pose}.svg`]
export const mascotSrc = src // SVG 안에 <image>로 넣을 때

export default function Mascot({ pose = 'walk', size = 56, className = '' }) {
  return <img className={`mascot ${className}`} src={src(pose)} width={size} height={size} alt="" aria-hidden="true" draggable="false" />
}
