import { rmSync } from 'node:fs'
import { SHOT_NAMES } from './fixtures'

export default function globalSetup() {
  rmSync(SHOT_NAMES, { recursive: true, force: true })
}
