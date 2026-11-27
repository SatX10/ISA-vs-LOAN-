import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { AccountProvider } from './account/AccountProvider.jsx';
import App from './App.jsx';
import './theme/themes.css';
import './theme/planner.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AccountProvider>
          <App />
        </AccountProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
