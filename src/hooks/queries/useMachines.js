'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const machinesKey = ['machines'];

export function useMachines({ onlyActive = false } = {}) {
  return useQuery({
    queryKey: [...machinesKey, { onlyActive }],
    queryFn: async () => {
      const data = await apiFetch('/api/machines');
      return onlyActive ? data.filter((m) => m.activo !== false) : data;
    },
  });
}
