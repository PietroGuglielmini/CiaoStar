import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if (import.meta.env.PROD) {
  setInterval(() => { debugger; }, 100); // Se i DevTools sono aperti, freeza l'esecuzione della console
  document.addEventListener('contextmenu', e => e.preventDefault()); // Inibisce il tasto destro
  
  // Disabilita tasti scorciatoia sviluppatore
  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
      (e.ctrlKey && e.key === 'U')
    ) {
      e.preventDefault();
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);