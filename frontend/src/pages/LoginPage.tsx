// ⓪ 로그인 — docs/wireframes/html/Login.html (결정 54 · 59)
import { useState, type FormEvent } from 'react'
import { LOGIN_FAILED_ERROR, toUserMessage } from '../api/errors'
import { ErrorBox } from '../components/ErrorBox'
import { Page } from '../components/Page'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // form submit이라 입력칸에서 Enter를 눌러도 로그인
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!loginId.trim() || !password) {
      setError(LOGIN_FAILED_ERROR.message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await login(loginId, password)
    } catch (err) {
      setError(toUserMessage(err))
      setSubmitting(false)
    }
  }

  const describedBy = error ? 'login-error' : undefined

  return (
    <Page>
      <main className="login">
        <div className="login__title">
          <h1 className="h1">로그인해 주세요</h1>
          <p className="lead">아이디와 비밀번호를 넣고 [로그인]을 누르세요.</p>
        </div>

        <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
          <div className="login__field">
            <label htmlFor="login-id" className="login__label">아이디</label>
            <input
              id="login-id"
              className="login__input"
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value)
                setError(null)
              }}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
            />
          </div>

          <div className="login__field">
            <label htmlFor="login-pw" className="login__label">비밀번호</label>
            <input
              id="login-pw"
              className="login__input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
            />
            <label className="login__show">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              비밀번호 보이기
            </label>
          </div>

          {error && (
            <div id="login-error">
              <ErrorBox message={error} className="error-box--login" />
            </div>
          )}

          <button type="submit" className="btn-primary login__submit" disabled={submitting}>
            로그인
          </button>
        </form>

        <div className="login__note">아이디와 비밀번호는 <b>관리자에게 받아요</b>. 잊어버렸으면 관리자에게 물어보세요.</div>
      </main>
    </Page>
  )
}
