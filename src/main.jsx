// src/main.jsx

/**
 * App Entry Point (Vite/React)
 *
 * Responsibilities
 * - Mounts <App/> into #root.
 * - Global styles import and error boundaries (if applicable).
 *
 * Notes
 * - Keep this file minimal—composition lives in App.jsx.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
