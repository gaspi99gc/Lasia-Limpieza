'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const servicesKey = ['services'];

export function useServices() {
  return useQuery({
    queryKey: servicesKey,
    queryFn: () => apiFetch('/api/services'),
  });
}
