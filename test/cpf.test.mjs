import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cpfValido, normalizarCpf, cpfParaLog } from '../src/lib/cpf.mjs';

test('aceita CPF valido com e sem mascara', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224725'), true);
});

test('rejeita CPF com digito verificador errado', () => {
  assert.equal(cpfValido('529.982.247-24'), false);
  assert.equal(cpfValido('12345678900'), false);
});

test('rejeita sequencias repetidas, que passam no calculo dos digitos', () => {
  for (const repetido of ['00000000000', '11111111111', '99999999999']) {
    assert.equal(cpfValido(repetido), false, `deveria rejeitar ${repetido}`);
  }
});

test('rejeita tamanho invalido, nulo e nao string', () => {
  assert.equal(cpfValido('123'), false);
  assert.equal(cpfValido('529982247251'), false);
  assert.equal(cpfValido(''), false);
  assert.equal(cpfValido(null), false);
  assert.equal(cpfValido(undefined), false);
  assert.equal(cpfValido({}), false);
});

test('normalizarCpf remove qualquer caractere nao numerico', () => {
  assert.equal(normalizarCpf('529.982.247-25'), '52998224725');
  assert.equal(normalizarCpf(' 529 982 247 25 '), '52998224725');
  assert.equal(normalizarCpf(null), '');
});

test('cpfParaLog nunca devolve o documento inteiro', () => {
  const mascarado = cpfParaLog('529.982.247-25');
  assert.equal(mascarado, '529.982.***-**');
  assert.ok(!mascarado.includes('24725'));
  assert.equal(cpfParaLog('abc'), '***');
});
