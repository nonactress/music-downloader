import { describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { mockApi } from './mock'

const codeOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: ApiError) => `${e.status} ${e.code}`)

describe('mock 로그인 (CONTRACT 5장 형식)', () => {
  it('맞으면 user, 아이디는 앞뒤 공백 · 대소문자 정리', async () => {
    await expect(mockApi.login(' GrandMa ', '123456')).resolves.toEqual({ user: { loginId: 'grandma' } })
  })

  it('틀리면 401 LOGIN_FAILED, 5번 틀리면 맞아도 429 LOGIN_LOCKED', async () => {
    expect(await codeOf(mockApi.login('nobody', '123456'))).toBe('401 LOGIN_FAILED')
    for (let i = 0; i < 5; i++) expect(await codeOf(mockApi.login('grandma', 'wrong!'))).toBe('401 LOGIN_FAILED')
    expect(await codeOf(mockApi.login('grandma', '123456'))).toBe('429 LOGIN_LOCKED')
  })
})
