'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const supplyRequestsKey = (filters = {}) => ['supply-requests', filters];

export function useSupplyRequests(filters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const url = '/api/supply-requests' + (params ? `?${params}` : '');
  return useQuery({
    queryKey: supplyRequestsKey(filters),
    queryFn: () => apiFetch(url),
  });
}
