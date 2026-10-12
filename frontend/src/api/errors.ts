import type { ApiErrorBody } from './types'

export const FALLBACK_ERROR: ApiErrorBody = {
  code: 'INTERNAL',
  message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
}

/** CONTRACT 4장 LOGIN_FAILED — 아이디 · 비밀번호를 비워 두고 누르면 서버에 보내지 않고 이 문구 */
export const LOGIN_FAILED_ERROR: ApiErrorBody = {
  code: 'LOGIN_FAILED',
  message: '아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.',
}

/** CONTRACT 4장 에러. 화면에는 message를 그대로 보여준다. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(body: ApiErrorBody, status: number) {
    super(body.message)
    this.code = body.code
    this.status = status
  }
}

/** 어떤 에러든 사용자에게 보여줄 문구로 바꾼다 */
export function toUserMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : FALLBACK_ERROR.message
}
