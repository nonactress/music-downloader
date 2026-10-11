import { describe, expect, it } from 'vitest'
import { formatClock, formatFileSize, formatKoreanDuration } from './format'

describe('formatKoreanDuration', () => {
  it('와이어프레임 표기와 같다', () => {
    expect(formatKoreanDuration(225)).toBe('3분 45초')
    expect(formatKoreanDuration(240)).toBe('4분 0초')
    expect(formatKoreanDuration(380)).toBe('6분 20초')
    expect(formatKoreanDuration(45)).toBe('45초')
    expect(formatKoreanDuration(224.83)).toBe('3분 45초')
  })
})

describe('formatClock', () => {
  it('0:12, 3:20', () => {
    expect(formatClock(12)).toBe('0:12')
    expect(formatClock(200)).toBe('3:20')
  })
})

describe('formatFileSize', () => {
  it('MB / KB', () => {
    expect(formatFileSize(6082560)).toBe('5.8MB')
    expect(formatFileSize(2048)).toBe('2KB')
  })
})
