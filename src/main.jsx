import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // 👈 關鍵！一定要是 App.jsx
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)