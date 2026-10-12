import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DisplayPage } from './pages/Display/DisplayPage.tsx';

const isDisplayPage = window.location.pathname.replace(/\/$/, '') === '/display';

if (isDisplayPage) {
  document.title = '大画面 | プログラミング体験会';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isDisplayPage ? <DisplayPage /> : <App />}</StrictMode>,
);
