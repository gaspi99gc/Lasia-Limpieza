'use client';

import ErrorState from '@/components/ErrorState';

export default function MiPanelError({ error, reset }) {
  return <ErrorState error={error} reset={reset} title="Error en Mi Panel" />;
}
