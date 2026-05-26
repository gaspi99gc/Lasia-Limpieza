'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const employeesKey = ['employees'];

export function useEmployees(options = {}) {
  return useQuery({
    queryKey: employeesKey,
    queryFn: () => apiFetch('/api/employees'),
    ...options,
  });
}
