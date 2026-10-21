// 로고 옆 산 모양 표시 (글자색을 따라간다)
export default function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 20 L9 8 L13 14 L16 10 L22 20 Z" fill="currentColor" opacity="0.25" />
      <path d="M3 20 C 8 18, 9 15, 12 15 S 16 12, 19 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 3.6" />
      <path d="M19 6 V2 L22.5 3.4 L19 4.8" fill="currentColor" />
    </svg>
  )
}
