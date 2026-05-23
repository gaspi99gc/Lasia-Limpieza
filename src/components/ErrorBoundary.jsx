'use client';

import { Component } from 'react';
import ErrorState from './ErrorState';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary captured:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorState error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
