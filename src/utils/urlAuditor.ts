/**
 * Utilitário de Auditoria e Diagnóstico de URLs de Transporte de Frames
 */

export interface UrlAuditDetails {
  rawUrl: string;
  fullUrl: string;
  method: string;
  origin: string;
  baseUrl: string;
  apiUrl: string;
  classification: {
    isRelative: boolean;
    isAbsolute: boolean;
    isLocalhost: boolean;
    isExternal: boolean;
    isHttps: boolean;
    isHttp: boolean;
  };
}

export function auditUrl(rawUrl: string, method: string = 'POST'): UrlAuditDetails {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const baseUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000/';

  let fullUrl = rawUrl;
  let isRelative = false;
  let isAbsolute = false;

  if (/^https?:\/\//i.test(rawUrl)) {
    isAbsolute = true;
  } else {
    isRelative = true;
    try {
      fullUrl = new URL(rawUrl, origin).href;
    } catch {
      fullUrl = `${origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }
  }

  let parsedOrigin = origin;
  try {
    parsedOrigin = new URL(fullUrl).origin;
  } catch {}

  const isLocalhost = /localhost|127\.0\.0\.1/i.test(fullUrl);
  const isExternal = parsedOrigin !== origin;
  const isHttps = fullUrl.startsWith('https:');
  const isHttp = fullUrl.startsWith('http:');

  return {
    rawUrl,
    fullUrl,
    method,
    origin,
    baseUrl,
    apiUrl: fullUrl,
    classification: {
      isRelative,
      isAbsolute,
      isLocalhost,
      isExternal,
      isHttps,
      isHttp,
    },
  };
}
