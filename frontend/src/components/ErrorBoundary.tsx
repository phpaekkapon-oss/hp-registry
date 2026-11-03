import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[UI] Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-chroma-canvas">
        <div className="gov-card max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="text-lg font-bold text-ink">ระบบเกิดข้อผิดพลาดที่ไม่คาดคิด</h1>
          <p className="text-sm text-ink-3">
            ข้อมูลที่บันทึกไว้ยังอยู่ครบถ้วน กรุณาโหลดหน้าใหม่ หากยังพบปัญหาให้แจ้งผู้ดูแลระบบ
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-brand min-h-[48px] px-5 rounded-lg font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            โหลดหน้าใหม่
          </button>
        </div>
      </div>
    );
  }
}
