import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installMockStudio } from './lib/mockStudio';
import './styles.css';

if (!window.studio) installMockStudio();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
