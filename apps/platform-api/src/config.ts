export function configuration(env = process.env) {
  const jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret.length < 48 || jwtSecret.includes('REPLACE_'))
    throw new Error('JWT_SECRET phải có ít nhất 48 ký tự ngẫu nhiên.');
  if (!env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL.');
  const origin = env.WEB_ORIGIN || 'http://localhost:5173';
  if (new URL(origin).origin !== origin)
    throw new Error('WEB_ORIGIN phải là origin, không có đường dẫn.');
  if (
    env.NODE_ENV === 'production' &&
    (env.COOKIE_SECURE !== 'true' || !origin.startsWith('https://'))
  ) {
    throw new Error('Môi trường production yêu cầu HTTPS và COOKIE_SECURE=true.');
  }
  if (!['0', '1', '2'].includes(env.TRUST_PROXY_HOPS || '0'))
    throw new Error('TRUST_PROXY_HOPS phải bằng 0, 1 hoặc 2.');
  return {
    jwtSecret,
    origin,
    secureCookie: env.COOKIE_SECURE === 'true',
    port: Number(env.PORT || 3000),
  };
}
