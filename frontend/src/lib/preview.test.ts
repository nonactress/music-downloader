import { describe, expect, it } from 'vitest'
import { fadeVolume, withFades } from './preview'

const seg = (start: number, end: number, speed = 1) => ({ src: 'a', start, end, speed, keepPitch: true })

describe('미리듣기 페이드 (결정 41)', () => {
  it('잇기가 켜져 있고 2곡 이상일 때만, 곡 사이에만', () => {
    expect(withFades([seg(0, 10)], true)[0]).not.toHaveProperty('fadeIn')
    expect(withFades([seg(0, 10), seg(0, 10)], false)[0]).not.toHaveProperty('fadeOut')
    const f = withFades([seg(0, 10), seg(0, 10), seg(0, 10)], true)
    expect(f.map((s) => [s.fadeIn, s.fadeOut])).toEqual([[false, true], [true, true], [true, false]])
  })
  it('처음 1초 키우기 · 끝 1초 줄이기 (빠르기 반영)', () => {
    const s = { ...seg(10, 20), fadeIn: true, fadeOut: true }
    expect(fadeVolume(s, 10)).toBe(0)
    expect(fadeVolume(s, 10.5)).toBeCloseTo(0.5)
    expect(fadeVolume(s, 15)).toBe(1)
    expect(fadeVolume(s, 19.5)).toBeCloseTo(0.5)
    expect(fadeVolume({ ...s, speed: 2 }, 11)).toBeCloseTo(0.5)
    expect(fadeVolume(seg(10, 20), 10)).toBe(1)
  })
})
