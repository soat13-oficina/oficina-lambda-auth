/**
 * Assinatura e verificacao de JWT HMAC usando apenas node:crypto.
 *
 * Sem dependencia externa de proposito: o pacote da Lambda fica com alguns KB,
 * o cold start encurta e nao ha CVE de terceiro para acompanhar em algo que
 * cabe em poucas linhas. HMAC com segredo compartilhado porque a API em Spring
 * Boot ja valida o token com o mesmo segredo - ver docs/adr/0001.
 *
 * ASSINAMOS em HS256; VERIFICAMOS HS256, HS384 e HS512.
 *
 * A assimetria e proposital. A biblioteca jjwt, usada pela aplicacao, escolhe o
 * algoritmo pelo TAMANHO da chave: com o segredo de 64 caracteres gerado pelo
 * Terraform (512 bits), ela assina em HS512. Se o authorizer aceitasse apenas
 * HS256, todo token emitido pelo login de e-mail e senha da aplicacao seria
 * recusado no gateway - falha que so apareceria em runtime, com o token
 * "correto" na mao.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// Os tres algoritmos HMAC do JWT e o digest correspondente no node:crypto.
// Qualquer alg fora deste mapa e recusado - inclusive "none" e os assimetricos,
// que abririam caminho para confusao de algoritmo.
const ALGORITMOS = Object.freeze({
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
});

const base64url = (entrada) => Buffer.from(entrada).toString('base64url');

const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

function calcularAssinatura(digest, secret, conteudo) {
  return base64url(createHmac(digest, secret).update(conteudo).digest());
}

/**
 * @param {object} payload Claims da aplicacao (sub, nome, roles...).
 * @param {string} secret Segredo HMAC.
 * @param {{expiresInSeconds?: number, issuer?: string, algoritmo?: string}} opcoes
 * @returns {string} Token JWT compacto.
 */
export function assinar(payload, secret, opcoes = {}) {
  if (!secret) throw new Error('segredo JWT ausente');

  const {
    expiresInSeconds = 3600,
    issuer = 'oficina-lambda-auth',
    algoritmo = 'HS256',
  } = opcoes;

  const digest = ALGORITMOS[algoritmo];
  if (!digest) throw new Error(`algoritmo nao suportado: ${algoritmo}`);

  const emitidoEm = agoraEmSegundos();

  const header = { alg: algoritmo, typ: 'JWT' };
  const corpo = {
    ...payload,
    iss: issuer,
    iat: emitidoEm,
    exp: emitidoEm + expiresInSeconds,
  };

  const conteudo = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(corpo))}`;

  return `${conteudo}.${calcularAssinatura(digest, secret, conteudo)}`;
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

  let header;
  try {
    header = JSON.parse(Buffer.from(headerCodificado, 'base64url').toString('utf8'));
  } catch {
    throw new Error('token malformado');
  }

  const digest = ALGORITMOS[header?.alg];
  if (!digest) throw new Error('algoritmo nao suportado');

  const esperada = calcularAssinatura(digest, secret, `${headerCodificado}.${payloadCodificado}`);

  // Comparacao em tempo constante: um "===" vazaria informacao da assinatura
  // pelo tempo de resposta.
  const recebida = Buffer.from(assinaturaRecebida);
  const referencia = Buffer.from(esperada);
  if (recebida.length !== referencia.length || !timingSafeEqual(recebida, referencia)) {
    throw new Error('assinatura invalida');
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadCodificado, 'base64url').toString('utf8'));
  } catch {
    throw new Error('token malformado');
  }

  if (typeof claims.exp !== 'number' || claims.exp < agoraEmSegundos()) {
    throw new Error('token expirado');
  }

  return claims;
}
