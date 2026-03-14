export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// API base URL - defaults to production backend, override with VITE_API_URL if needed
const API_BASE = import.meta.env.VITE_API_URL || 'https://scanner-3cku.onrender.com';

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  // Prepend API_BASE if the path doesn't start with http/https
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body
    });
  } catch (networkError) {
    // Network error (e.g., server not reachable)
    throw new ApiError(0, 'Unable to connect to server. Please check your connection.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as any)?.error ?? 'Request failed', (data as any)?.details);
  }
  return data as T;
}

