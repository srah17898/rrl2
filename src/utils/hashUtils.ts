/**
 * Utilitário para cálculo de Hash simples e determinístico de Base64 e imagens.
 */
export function computeBase64Hash(base64?: string | null): string {
  if (!base64) return '00000000';
  let hash = 5381;
  for (let i = 0; i < base64.length; i++) {
    hash = ((hash << 5) + hash) + base64.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function computeBase64Bytes(base64?: string | null): number {
  if (!base64) return 0;
  return Math.round((base64.length * 3) / 4);
}
