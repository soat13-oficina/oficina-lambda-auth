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

test('rejeita alg diferente de HS256 (confusao de algoritmo)', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: '1', exp: 9999999999 })).toString('base64url');

  assert.throws(() => verificar(`${header}.${payload}.`, SEGREDO), /algoritmo nao suportado/);
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
