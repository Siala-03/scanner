export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-staff-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function cors(body: unknown, init: ResponseInit = {}): Response {
  const status = (init as any).status ?? 200;
  return new Response(JSON.stringify(body), {
    ...init,
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  });
}

export function err(message: string, status = 500): Response {
  return cors({ error: message }, { status });
}

export function optionsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}
