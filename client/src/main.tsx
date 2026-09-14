import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { authService } from './services/auth';
import './index.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/600.css';

// Automatically inject Bearer token on all API requests
authService.installFetchInterceptor();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
