import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './shell.css'

const root = document.getElementById('root')
if (!root) throw new Error('Renderer mounted without #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
