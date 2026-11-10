"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

export interface ErrorBoundaryProps {
  children: ReactNode
  /** What to render instead of the children; `reset` renders them again. */
  fallback: (error: unknown, reset: () => void) => ReactNode
  /** Reset when any of these change (a route's params, for example). */
  resetKeys?: readonly unknown[]
  onError?: (error: unknown, info: ErrorInfo) => void
}

interface State {
  error: unknown
  failed: boolean
  keys: readonly unknown[] | undefined
}

/** A React error boundary (React has no hook for it). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null, failed: false, keys: this.props.resetKeys }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, failed: true }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    const changed =
      props.resetKeys !== state.keys &&
      (props.resetKeys?.length !== state.keys?.length ||
        props.resetKeys?.some((k, i) => !Object.is(k, state.keys?.[i])))
    if (changed)
      return { keys: props.resetKeys, ...(state.failed ? { error: null, failed: false } : {}) }
    return null
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null, failed: false })
  }

  override render(): ReactNode {
    return this.state.failed
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children
  }
}
