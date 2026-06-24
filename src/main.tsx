import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { installAuthInterceptor } from '@shared/lib/apiAuthInterceptor'

// Adjunta el JWT de Supabase Auth a todas las llamadas al backend (requireAuth).
installAuthInterceptor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
