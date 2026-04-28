export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-staff-id, x-restaurant-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function cors(body: unknown, opts: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function err(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
