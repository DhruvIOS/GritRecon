const ALLOWED_ORIGINS = [
  'https://csprd-web.ps.umbc.edu',
  'chrome-extension://YOUR_EXTENSION_ID_HERE',
];

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

export function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT_MAX;
}

export function getSecurityHeaders(origin: string | null): Record<string, string> {
  const isDev = process.env.NODE_ENV === 'development';
  return {
    'Access-Control-Allow-Origin':
      origin && (ALLOWED_ORIGINS.includes(origin) || isDev) ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}
