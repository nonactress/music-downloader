// 도움말 문구 — docs/HELP.md 그대로 (결정 47). **굵게**는 <b>로 표시
import type { Screen } from '../store/flowStore'

export interface HelpText {
  title: string
  steps: string[]
  note?: string
}

export type HelpKey = 'import' | 'progress' | 'edit' | 'trim' | 'speed' | 'done' | 'findSaved'

export const HELP: Record<HelpKey, HelpText> = {
  import: {
    title: '노래를 가져오는 방법',
    steps: [
      '유튜브에서 넣고 싶은 노래 영상을 열어요.',
      '맨 위 주소창을 한 번 누르고, 마우스 오른쪽 버튼 → [복사]를 눌러요.',
      '이 화면으로 돌아와 [붙여넣기]를 누르면 주소가 들어가요.',
      '[노래 불러오기]를 누르면 노래를 가져와요.',
    ],
    note: '재생목록 주소는 넣을 수 없어요. 노래 영상 하나의 주소를 넣어 주세요. 20분이 넘는 영상도 가져올 수 없어요.',
  },
  progress: {
    title: '기다리는 동안',
    steps: [
      '노래를 가져오거나 만드는 데 1분쯤 걸릴 수 있어요.',
      '이 창을 닫지 말고 기다려 주세요. 다 되면 저절로 다음 화면으로 넘어가요.',
      '그만두고 싶으면 [취소하고 돌아가기]를 누르세요.',
    ],
  },
  edit: {
    title: '노래를 다듬는 방법',
    steps: [
      '[잘라내기]: 노래의 앞부분이나 뒷부분을 잘라요.',
      '[빠르기]: 노래를 빠르게 하거나 느리게 해요.',
      '[노래 하나 더 붙이기]: 다른 노래를 뒤에 이어 붙여요. [위로] [아래로]로 순서를 바꾸고, [빼기]로 목록에서 빼요.',
      '잘못 바꿨으면 맨 위의 [되돌리기]를 누르세요. 바꾸기 전으로 돌아가요.',
      '다 고쳤으면 [다 됐어요, 저장하기]를 누르세요.',
    ],
  },
  trim: {
    title: '잘라내는 방법',
    steps: [
      '파란 부분만 남고, 회색 부분은 잘려 나가요.',
      '[−5초] [+5초]로 남길 부분의 시작과 끝을 옮겨요.',
      '[남긴 부분 들어보기]를 눌러 잘 잘렸는지 들어 보세요.',
      '다 됐으면 [완료, 목록으로]를 누르세요. 바꾼 것은 바로 반영돼요.',
    ],
  },
  speed: {
    title: '빠르기를 바꾸는 방법',
    steps: [
      '[느리게] [보통] [빠르게] 중에 하나를 누르세요.',
      '조금씩 바꾸고 싶으면 [− 느리게] [+ 빠르게]를 누르세요.',
      '[목소리 높낮이는 그대로 두기]를 켜 두면 빨라져도 목소리가 높아지지 않아요.',
      '모든 노래 빠르기는 [모든 노래에 적용하기]를 눌러야 바뀌어요.',
    ],
  },
  done: {
    title: '저장하는 방법',
    steps: [
      '[내 컴퓨터에 저장하기]를 누르면 노래 파일이 컴퓨터에 저장돼요.',
      '[들어보기]로 저장하기 전에 들어 볼 수 있어요.',
      '다시 고치고 싶으면 [다시 고치러 가기]를 누르세요.',
    ],
    note: '만든 노래는 하루(24시간)가 지나면 이 사이트에서 지워져요. 그 전에 저장해 주세요.',
  },
  findSaved: {
    title: '저장한 노래 찾기',
    steps: [
      '저장한 노래는 컴퓨터의 **다운로드** 폴더에 있어요.',
      '크롬이나 엣지에서는 키보드의 **Ctrl** 키와 **J** 키를 함께 누르면 받은 파일 목록이 보여요. (맥은 **⌘** 키와 **Option** 키와 **L** 키)',
      '파일 이름은 "내 노래_월일.mp3"예요. 예: 내 노래_1011.mp3',
    ],
  },
}

/** [도움말]을 누른 화면의 도움말 */
export const HELP_FOR_SCREEN: Record<Screen, HelpKey> = {
  import: 'import',
  loading: 'progress',
  saving: 'progress',
  edit: 'edit',
  trim: 'trim',
  speed: 'speed',
  speedAll: 'speed',
  done: 'done',
}

/** "**굵게**" 조각 나누기 — 홀수 번째가 굵은 글자 */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text !== '')
}
