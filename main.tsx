import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress specific Telegram WebApp warnings/errors that clutter the console in browser environments
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[Telegram.WebApp] CloudStorage is not supported')) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[Telegram.WebApp] CloudStorage is not supported')) {
    return;
  }
  originalError(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
