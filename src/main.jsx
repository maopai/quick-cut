import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import App from './App'
import './styles.css'
import { applyDocumentTheme, getStoredTheme } from './theme'

const initialTheme = applyDocumentTheme(window.frameCut?.initialTheme || getStoredTheme())
window.frameCut?.setTheme?.(initialTheme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialTheme={initialTheme} />
  </React.StrictMode>,
)
