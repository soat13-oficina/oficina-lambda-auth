import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assinar, verificar } from '../src/lib/jwt.mjs';

const SEGREDO = 'segredo-de-teste-nao-usar-em-lugar-nenhum';

test('token assinado volta a ser lido com as mesmas claims', () => {
  const token = assinar({ sub: '52998224725', nome: 'Fulano' }, SEGREDO);
  const claims = verificar(token, SEGREDO);

  assert.equal(claims.sub, '52998224725');
  assert.equal(claims.nome, 'Fulano');
  assert.equal(claims.iss, 'oficina-lambda-auth');
  assert.ok(claims.exp > claims.iat);
});

test('rejeita token assinado com outro segredo', () => {
  const token = assinar({ sub: '1' }, SEGREDO);
  assert.throws(() => verificar(token, 'outro-segredo'), /assinatura invalida/);
});

test('rejeita payload adulterado', () => {
  const token = assinar({ sub: '1', roles: ['CLIENTE'] }, SEGREDO);
  const [header, , assinatura] = token.split('.');
  const adulterado = Buffer.from(JSON.stringify({ sub: '1', roles: ['ADMIN'] })).toString('base64url');

  assert.throws(() => verificar(`${header}.${adulterado}.${assinatura}`, SEGREDO), /assinatura invalida/);
});

test('rejeita alg "none" e algoritmos assimetricos (confusao de algoritmo)', () => {
  const payload = Buffer.from(JSON.stringify({ sub: '1', exp: 9999999999 })).toString('base64url');

  for (const alg of ['none', 'RS256', 'ES256', 'HS1']) {
    const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
    assert.throws(
      () => verificar(`${header}.${payload}.`, SEGREDO),
      /algoritmo nao suportado/,
      `deveria recusar alg ${alg}`,
    );
  }
});

// A aplicacao em Spring Boot usa jjwt, que escolhe o algoritmo pelo TAMANHO da
// chave: com o segredo de 64 caracteres gerado pelo Terraform, ela assina em
// HS512. Se o authorizer so aceitasse HS256, todo token vindo do login de
// e-mail e senha seria recusado no gateway.
test('verifica tokens HS384 e HS512, nao so HS256', () => {
  for (const algoritmo of ['HS256', 'HS384', 'HS512']) {
    const token = assinar({ sub: '1' }, SEGREDO, { algoritmo });

    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(header.alg, algoritmo);

    assert.equal(verificar(token, SEGREDO).sub, '1', `deveria aceitar ${algoritmo}`);
  }
});

test('assina em HS256 por padrao', () => {
  const token = assinar({ sub: '1' }, SEGREDO);
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'HS256');
});

test('trocar o alg do header sem reassinar nao passa', () => {
  // Ataque classico: pegar um token HS256 valido e reescrever o header para
  // HS512, esperando que a verificacao use outro digest sobre a mesma
  // assinatura.
  const token = assinar({ sub: '1' }, SEGREDO);
  const [, payload, assinatura] = token.split('.');
  const headerFalso = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');

  assert.throws(() => verificar(`${headerFalso}.${payload}.${assinatura}`, SEGREDO), /assinatura invalida/);
});

test('rejeita token expirado', () => {
  const token = assinar({ sub: '1' }, SEGREDO, { expiresInSeconds: -1 });
  assert.throws(() => verificar(token, SEGREDO), /token expirado/);
});

test('rejeita formato malformado e segredo ausente', () => {
  assert.throws(() => verificar('nao-e-um-jwt', SEGREDO), /token malformado/);
  assert.throws(() => verificar('', SEGREDO), /token malformado/);
  assert.throws(() => assinar({}, ''), /segredo JWT ausente/);
});
