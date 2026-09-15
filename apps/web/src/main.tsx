import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ThemeProvider } from '@/app/theme-provider';
import { SessionGateProvider } from '@/auth/session';
import { LocaleProvider } from '@/i18n/provider';
import { ApiProvider } from '@/lib/api';
import { makeQueryClient, startPersistence } from '@/lib/query';
import { createRouter } from '@/routes';
import './index.css';

const queryClient = makeQueryClient();
startPersistence(queryClient);

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root.');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <ApiProvider>
            <SessionGateProvider>
              <RouterProvider router={createRouter()} />
            </SessionGateProvider>
          </ApiProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
