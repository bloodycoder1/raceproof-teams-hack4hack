export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Idempotency: Mutating requests attach an Idempotency-Key
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'DELETE', 'PATCH', 'PUT'].includes(method)) {
    if (!headers.has('Idempotency-Key')) {
      const key = options.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}-${Math.random()}`);
      headers.set('Idempotency-Key', key);
    }
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include', // Automatically send and receive httpOnly JWT auth cookies
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const code = data?.error?.code || `HTTP_${response.status}`;
    const message = data?.error?.message || response.statusText || 'Request failed';
    throw new ApiError(response.status, code, message, data?.error?.details);
  }

  return data as T;
}
