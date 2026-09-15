import { initializeIcons } from '@fluentui/react';
initializeIcons();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import './index.css';

import ErrorBoundary from "./components/comunes/ErrorBoundary.jsx";

const CHUNK_RELOAD_GUARD_KEY = 'sistema_chunk_reload_guard';

function isChunkLoadErrorMessage(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed') ||
    text.includes('loading chunk')
  );
}

function installChunkRecovery() {
  const tryRecover = () => {
    try {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
      if (alreadyReloaded) return;
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  window.addEventListener('error', (event) => {
    const target = event?.target;
    const src = String(target?.src || '');
    if (src.includes('/assets/') && src.endsWith('.js')) {
      tryRecover();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason?.message || reason;
    if (isChunkLoadErrorMessage(message)) {
      tryRecover();
    }
  });
}

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');
  document.body?.setAttribute('translate', 'no');
  document.body?.classList.add('notranslate');
}

if (typeof window !== 'undefined') {
  installChunkRecovery();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
