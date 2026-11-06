import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { startRuntime } from './app/runtime/session-runtime.ts';
import './styles/index.css';

if (window.self === window.top) {
  void startRuntime();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
