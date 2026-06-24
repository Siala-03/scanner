export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// API base URL — defaults to /api for same-origin deployments.
// Override VITE_API_URL with a full URL (e.g. https://backend.example.com/api) for external backends.
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown; includeAuthHeaders?: boolean } = {}
): Promise<T> {
  let url = path;
  if (!path.startsWith('http')) {
    if (path.startsWith('/api/')) {
      // Express backend routes: keep as same-origin path (reverse proxy handles routing)
      url = path;
    } else {
      const prefix = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      url = path.startsWith('/') ? `${prefix}${path}` : `${prefix}/${path}`;
    }
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (API_BASE.includes('supabase.co') && SUPABASE_ANON_KEY) {
    headers.set('apikey', SUPABASE_ANON_KEY);
    headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
  }
  if (!init.method || init.method.toUpperCase() === 'GET') {
    headers.set('Cache-Control', 'no-cache');
  }

  const includeAuthHeaders = init.includeAuthHeaders ?? true;
  if (includeAuthHeaders) {
    // Add authentication headers automatically from localStorage
    let staffId = localStorage.getItem('staffId');
    if (!staffId) {
      const savedAuthUser = localStorage.getItem('authUser');
      if (savedAuthUser) {
        try {
          const authUser = JSON.parse(savedAuthUser);
          if (authUser?.id) {
            staffId = authUser.id;
          }
        } catch {
          // ignore invalid auth user JSON
        }
      }
    }

    const token = localStorage.getItem('token');
    if (staffId) {
      headers.set('x-staff-id', staffId);
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      cache: init.cache ?? 'no-store'
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

