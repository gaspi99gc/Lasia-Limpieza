'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const documentTypesKey = ['document-types'];

export function useDocumentTypes() {
  return useQuery({
    queryKey: documentTypesKey,
    queryFn: () => apiFetch('/api/document-types'),
    staleTime: 5 * 60_000,
  });
}
