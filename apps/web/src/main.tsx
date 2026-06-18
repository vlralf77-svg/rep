import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App';
import { theme } from './theme';

// 디바이스에서 흰 화면 대신 에러를 직접 표시 (디버깅용)
function showFatal(msg: string) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="padding:16px;font-family:monospace;font-size:12px;color:#fff;background:#900;white-space:pre-wrap;word-break:break-all;">앱 오류:\n' +
      msg.replace(/</g, '&lt;') +
      '</div>';
  }
}
window.addEventListener('error', (e) => {
  showFatal((e.error && e.error.stack) || e.message || String(e));
});
window.addEventListener('unhandledrejection', (e) => {
  showFatal('Promise 거부: ' + ((e.reason && e.reason.stack) || String(e.reason)));
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (err) {
  showFatal((err as Error)?.stack || String(err));
}
