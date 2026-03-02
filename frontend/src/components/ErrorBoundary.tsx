/**
 * ============================================================================
 * ERROR BOUNDARY COMPONENT (ErrorBoundary.tsx)
 * ============================================================================
 * React Error Boundary - catches JavaScript errors in child components.
 * 
 * WHAT IT DOES:
 * - Catches errors anywhere in the component tree below it
 * - Logs error information to console
 * - Displays fallback UI instead of crashing the whole app
 * - Provides "Refresh Page" button to recover
 * 
 * HOW IT WORKS:
 * 1. Wraps the entire app (or sections of it)
 * 2. If any child component throws an error, it catches it
 * 3. Shows user-friendly error message instead of white screen
 * 4. Logs error details for debugging
 * 
 * USAGE:
 * ```tsx
 * // In App.tsx or main.tsx
 * <ErrorBoundary>
 *   <YourApp />
 * </ErrorBoundary>
 * ```
 * 
 * FOR NEW DEVELOPERS:
 * - This is a class component (required for error boundaries)
 * - getDerivedStateFromError() updates state when error occurs
 * - componentDidCatch() logs error for debugging
 * - Error details are expandable in the UI
 * 
 * IMPORTANT:
 * - Only catches errors in React components
 * - Does NOT catch errors in event handlers or async code
 * - For those, use try-catch blocks
 */

// Import React and types
import React, { Component, ErrorInfo, ReactNode } from 'react';

/**
 * Props for ErrorBoundary
 */
interface Props {
  children: ReactNode;  // Child components to wrap
}

/**
 * State for ErrorBoundary
 */
interface State {
  hasError: boolean;    // Whether an error has occurred
  error?: Error;        // The error object (for display)
}

/**
 * ErrorBoundary Component - Catches and displays React errors
 * This is a class component (required for error boundaries in React)
 */
export default class ErrorBoundary extends Component<Props, State> {
  props!: Props;

  // Initial state - no error
  state: State = {
    hasError: false
  };

  /**
   * Static method called when an error is thrown
   * Updates state to trigger error UI
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method called after an error is caught
   * Used for logging error details
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-none border border-slate-200-none border border-slate-200 rounded-[4px] p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-800">
                  Something went wrong
                </h3>
                <div className="mt-2 text-sm text-gray-700">
                  <p>The page encountered an error. Please refresh the page to try again.</p>
                  {this.state.error && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-500">Error details</summary>
                      <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto">
                        {this.state.error.message}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}


