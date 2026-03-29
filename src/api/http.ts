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
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  let url = path;
  if (!path.startsWith('http')) {
    // Prepend API_BASE for all relative paths (with or without leading /)
    // This ensures production API calls go to the backend server
    const prefix = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
    url = path.startsWith('/') ? `${prefix}${path}` : `${prefix}/${path}`;
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');

  // Add authentication headers automatically from localStorage
  const staffId = localStorage.getItem('staffId');
  const token = localStorage.getItem('token');
  if (staffId) {
    headers.set('x-staff-id', staffId);
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

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

  // Handle 204 No Content responses
  if (res.status === 204) {
    return {} as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMessage = (data as any)?.error ?? `Request failed with status ${res.status}`;
    console.error('API Error:', {
      status: res.status,
      url,
      method: init.method || 'GET',
      error: errorMessage,
      details: (data as any)?.details
    });
    throw new ApiError(res.status, errorMessage, (data as any)?.details);
  }
  return data as T;
}

