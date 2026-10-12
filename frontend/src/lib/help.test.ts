import { describe, expect, it } from 'vitest'
import md from '../../../docs/HELP.md?raw'
import { HELP, splitBold } from './help'

describe('도움말 문구 = docs/HELP.md 그대로', () => {
  for (const [key, h] of Object.entries(HELP)) {
    it(key, () => {
      expect(md).toContain(`**제목**: ${h.title}`)
      h.steps.forEach((s, i) => expect(md).toContain(`${i + 1}. ${s}\n`))
      if (h.note) expect(md).toContain(`> ${h.note}`)
    })
  }
})

describe('splitBold', () => {
  it('**로 감싼 부분만 굵게', () => {
    expect(splitBold('컴퓨터의 **다운로드** 폴더')).toEqual([
      { text: '컴퓨터의 ', bold: false },
      { text: '다운로드', bold: true },
      { text: ' 폴더', bold: false },
    ])
  })
})
