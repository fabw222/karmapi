"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-white mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-400 mb-2">
              An unexpected error occurred. Please reload the page.
            </p>
            {this.state.error && (
              <p className="text-red-400 text-sm mb-6 font-mono break-all">
                {this.state.error.message.length > 200
                  ? this.state.error.message.slice(0, 200) + "..."
                  : this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
