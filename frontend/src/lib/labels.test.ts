import { describe, expect, it } from 'vitest'
import { speedLabel, trimLabel } from './labels'

describe('labels', () => {
  it('잘라내기 괄호 (결정 18)', () => {
    expect(trimLabel('none')).toBe('')
    expect(trimLabel('front')).toBe(' (앞 잘라냄)')
    expect(trimLabel('back')).toBe(' (뒤 잘라냄)')
    expect(trimLabel('both')).toBe(' (앞뒤 잘라냄)')
  })
  it('빠르기 (와이어프레임 카드)', () => {
    expect(speedLabel(1)).toBe('보통 빠르기')
    expect(speedLabel(1.25)).toBe('빠르게 1.25배')
    expect(speedLabel(0.75)).toBe('느리게 0.75배')
    expect(speedLabel(2)).toBe('빠르게 2.0배')
  })
})
