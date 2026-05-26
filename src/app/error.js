'use client';

import ErrorState from '@/components/ErrorState';

export default function GlobalError({ error, reset }) {
  return <ErrorState error={error} reset={reset} />;
}
