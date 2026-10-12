import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initAuth } from './store/authStore'
import { initSession } from './store/persist'
import { initUi } from './store/uiStore'
import './styles.css'

initUi()
initSession()
initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
