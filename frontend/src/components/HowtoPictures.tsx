// ① "유튜브 주소는 어디서 찾나요?" 그림 3장 — docs/HELP.md 설명대로 직접 그린 단순한 그림
// 실제 유튜브 화면 캡처 · 로고는 쓰지 않는다 (결정 47)

const BLUE = '#1F4FB8'
const LINE = '#8A8A86'

/** 브라우저 창 틀: 위 막대(점 3개) + 주소창. highlight면 주소창을 파란 테두리로 */
function BrowserFrame({ highlight = false }: { highlight?: boolean }) {
  return (
    <>
      <rect x="8" y="6" width="224" height="108" rx="8" fill="#FFFFFF" stroke={LINE} strokeWidth="2" />
      <path d="M8 14a8 8 0 0 1 8-8h208a8 8 0 0 1 8 8v20H8z" fill="#ECECE8" />
      <circle cx="20" cy="20" r="3.5" fill="#C9C9C4" />
      <circle cx="31" cy="20" r="3.5" fill="#C9C9C4" />
      <circle cx="42" cy="20" r="3.5" fill="#C9C9C4" />
      <rect
        x="54" y="12" width="168" height="16" rx="8" fill="#FFFFFF"
        stroke={highlight ? BLUE : '#D0D0CB'} strokeWidth={highlight ? 3 : 1.5}
      />
      <rect x="64" y="18" width="92" height="4" rx="2" fill="#B5B5B0" />
    </>
  )
}

/** 동영상 화면 (재생 단추) */
function Video() {
  return (
    <>
      <rect x="20" y="42" width="200" height="62" rx="6" fill="#4A4A48" />
      <circle cx="120" cy="73" r="15" fill="#FFFFFF" />
      <path d="M115 65v16l13-8z" fill="#4A4A48" />
    </>
  )
}

/** 마우스 화살표 */
function Pointer({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M0 0v22l6-5 4 9 4-2-4-9h8z"
      fill="#1A1A1A" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round"
    />
  )
}

function Picture1() {
  return (
    <svg viewBox="0 0 240 120" role="img" aria-label="브라우저 창 안에 노래 영상이 열려 있는 그림">
      <BrowserFrame />
      <Video />
    </svg>
  )
}

function Picture2() {
  return (
    <svg viewBox="0 0 240 120" role="img" aria-label="맨 위 주소창이 파랗게 표시되고 마우스 화살표가 가리키는 그림">
      <BrowserFrame highlight />
      <Video />
      <Pointer x={150} y={22} />
    </svg>
  )
}

function Picture3() {
  return (
    <svg viewBox="0 0 240 120" role="img" aria-label="주소창에서 마우스 오른쪽 버튼을 눌러 뜬 메뉴에서 [복사] 칸이 파랗게 표시된 그림">
      <BrowserFrame />
      <Video />
      {/* 오른쪽 클릭 메뉴: 잘라내기 · 복사(강조) · 붙여넣기 */}
      <rect x="120" y="26" width="96" height="74" rx="6" fill="#FFFFFF" stroke={LINE} strokeWidth="1.5" />
      <rect x="132" y="37" width="46" height="5" rx="2.5" fill="#C9C9C4" />
      <rect x="124" y="51" width="88" height="22" rx="4" fill={BLUE} />
      <text x="134" y="67" fill="#FFFFFF" fontSize="15" fontWeight="700" fontFamily="inherit">복사</text>
      <rect x="132" y="84" width="58" height="5" rx="2.5" fill="#C9C9C4" />
      <Pointer x={176} y={60} />
    </svg>
  )
}

export const HOWTO_PICTURES = [Picture1, Picture2, Picture3]
