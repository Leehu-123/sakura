import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './messenger/inbox.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { sakuraLogo } from './Brand';
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.href = sakuraLogo;
document.head.appendChild(favicon);
