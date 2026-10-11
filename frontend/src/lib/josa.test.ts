import { describe, expect, it } from 'vitest'
import { eulReul } from './josa'

describe('eulReul', () => {
  it('받침 있으면 을, 없으면 를, 한글이 아니면 을(를)', () => {
    expect(eulReul('봄날')).toBe('을')
    expect(eulReul('아리랑')).toBe('을')
    expect(eulReul('나비야')).toBe('를')
    expect(eulReul('Me at the zoo')).toBe('을(를)')
    expect(eulReul('[노래 제목]')).toBe('을(를)')
  })
})
