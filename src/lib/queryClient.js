import { QueryClient } from '@tanstack/react-query';
import { notify } from './toast';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (err) => {
          notify.error(err?.message || 'Ocurrió un error');
        },
      },
    },
  });
}
