import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './utils/ThemeContext'
import { initEmailService } from './lib/emailService'
import { startAnonymousSession } from './lib/firebase'

// Initialize Email.js
initEmailService()

// Give every visitor a Firebase Auth identity (anonymous until an admin signs in)
startAnonymousSession()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
