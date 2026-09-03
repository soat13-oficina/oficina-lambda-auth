/**
 * Assinatura e verificacao de JWT HS256 usando apenas node:crypto.
 *
 * Sem dependencia externa de proposito: o pacote da Lambda fica com alguns KB,
 * o cold start encurta e nao ha CVE de terceiro para acompanhar em algo que
 * cabe em 60 linhas. HS256 (segredo compartilhado) porque a API em Spring Boot
 * ja valida o token com o mesmo segredo - ver docs/adr/0001.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const base64url = (entrada) => Buffer.from(entrada).toString('base64url');

const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

/**
 * @param {object} payload Claims da aplicacao (sub, nome, roles...).
 * @param {string} secret Segredo HMAC.
 * @param {{expiresInSeconds?: number, issuer?: string}} opcoes
 * @returns {string} Token JWT compacto.
 */
export function assinar(payload, secret, opcoes = {}) {
  if (!secret) throw new Error('segredo JWT ausente');

  const { expiresInSeconds = 3600, issuer = 'oficina-lambda-auth' } = opcoes;
  const emitidoEm = agoraEmSegundos();

  const header = { alg: 'HS256', typ: 'JWT' };
  const corpo = {
    ...payload,
    iss: issuer,
    iat: emitidoEm,
    exp: emitidoEm + expiresInSeconds,
  };

  const conteudo = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(corpo))}`;
  const assinatura = base64url(createHmac('sha256', secret).update(conteudo).digest());

  return `${conteudo}.${assinatura}`;
}

/**
 * @param {string} token Token compacto.
 * @param {string} secret Segredo HMAC.
 * @returns {object} Claims, se o token for valido.
 * @throws {Error} Se o formato, o algoritmo, a assinatura ou a validade falharem.
 */
export function verificar(token, secret) {
  if (!secret) throw new Error('segredo JWT ausente');

  const partes = String(token ?? '').split('.');
  if (partes.length !== 3) throw new Error('token malformado');

  const [headerCodificado, payloadCodificado, assinaturaRecebida] = partes;

  // Rejeita explicitamente qualquer outro alg. Sem esta checagem, um token
  // com alg "none" ou "RS256" abriria caminho para confusao de algoritmo.
  const header = JSON.parse(Buffer.from(headerCodificado, 'base64url').toString('utf8'));
  if (header.alg !== 'HS256') throw new Error('algoritmo nao suportado');

  const esperada = base64url(
    createHmac('sha256', secret).update(`${headerCodificado}.${payloadCodificado}`).digest(),
  );

  // Comparacao em tempo constante: um "===" vazaria informacao da assinatura
  // pelo tempo de resposta.
  const recebida = Buffer.from(assinaturaRecebida);
  const referencia = Buffer.from(esperada);
  if (recebida.length !== referencia.length || !timingSafeEqual(recebida, referencia)) {
    throw new Error('assinatura invalida');
  }

  const claims = JSON.parse(Buffer.from(payloadCodificado, 'base64url').toString('utf8'));
  if (typeof claims.exp !== 'number' || claims.exp < agoraEmSegundos()) {
    throw new Error('token expirado');
  }

  return claims;
}
