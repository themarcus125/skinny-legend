import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
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
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <RouterProvider router={createRouter()} />
        </ApiProvider>
      </QueryClientProvider>
    </LocaleProvider>
  </StrictMode>,
);
