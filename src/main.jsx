import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // Temporarily disabled StrictMode to test flash issue
  // StrictMode causes double-mounting in development which amplifies the flash
  <AuthProvider>
    <App />
  </AuthProvider>
)

