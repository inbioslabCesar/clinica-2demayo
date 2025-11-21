import { initializeIcons } from '@fluentui/react';
initializeIcons();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import './index.css';

import ErrorBoundary from "./components/ErrorBoundary.jsx"; // Ajusta la ruta si es necesario

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
