import { AlertIcon } from './Icons'

/** 서버 error.message를 그대로 크게 보여준다 */
export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="error-box">
      <AlertIcon />
      <span>{message}</span>
    </div>
  )
}
