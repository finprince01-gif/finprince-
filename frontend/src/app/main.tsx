/**
 * ============================================================================
 * APPLICATION ENTRY POINT (main.tsx)
 * ============================================================================
 * This is the first file that runs when the application starts.
 * It mounts the React application to the HTML DOM.
 * 
 * WHAT THIS FILE DOES:
 * 1. Imports React and ReactDOM libraries
 * 2. Imports the main App component
 * 3. Finds the root HTML element (div with id="root" in index.html)
 * 4. Creates a React root and renders the App component inside it
 * 
 * FOR NEW DEVELOPERS:
 * - Don't modify this file unless you need to change how React initializes
 * - The App component (./App.tsx) contains all the actual application logic
 * - React.StrictMode helps catch bugs during development
 */

// Import React library - needed for all React components
import React from 'react';

// Import ReactDOM - handles rendering React components to the browser DOM
import ReactDOM from 'react-dom/client';

// Import the main App component - this is the root of our application
import App from './App';

// Find the HTML element where we'll mount our React app
// This element is defined in /frontend/index.html as <div id="root"></div>
const rootElement = document.getElementById('root');

// Safety check: If the root element doesn't exist, throw an error
// This prevents the app from running in a broken state
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Create a React root - this is the new React 18+ way of rendering apps
const root = ReactDOM.createRoot(rootElement);

// Render the App component inside the root element
// React.StrictMode is a development tool that:
// - Checks for potential problems in the app
// - Warns about deprecated APIs
// - Helps identify unsafe lifecycle methods
// Note: StrictMode only runs in development, not in production builds
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

