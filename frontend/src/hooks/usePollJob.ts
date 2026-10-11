import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import type { Job } from '../api/types'

const POLL_MS = 1000

/** GET /jobs/{id}를 1초마다 — done/failed가 되면 멈춘다 (CONTRACT 0장) */
export function usePollJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const next = await api.getJob(jobId!)
        if (stopped) return
        setJob(next)
        if (next.status === 'failed') setError(next.error?.message ?? toUserMessage(null))
        if (next.status === 'done' || next.status === 'failed') return
      } catch (e) {
        if (!stopped) setError(toUserMessage(e))
        return
      }
      timer = setTimeout(tick, POLL_MS)
    }

    setJob(null)
    setError(null)
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [jobId])

  return { job, error }
}
