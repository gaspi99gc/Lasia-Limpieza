export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers,
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const message = body?.error || body?.message || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}
