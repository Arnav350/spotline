import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useShowStore } from './store/showStore.ts'

// Expose store for debugging
if (typeof window !== 'undefined') {
  (window as any).__spotlineStore = useShowStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
