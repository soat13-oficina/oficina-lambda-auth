/**
 * Validacao de CPF por digito verificador.
 *
 * Utilitario neutro em relacao a regra de negocio: diz apenas se o numero e
 * estruturalmente valido. A consulta de existencia e status do cliente na base
 * e responsabilidade do handler (src/handlers/token.mjs).
 */

/** Remove mascara e qualquer caractere nao numerico. */
export function normalizarCpf(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * @param {string} valor CPF com ou sem mascara.
 * @returns {boolean} true se os dois digitos verificadores conferem.
 */
export function cpfValido(valor) {
  const cpf = normalizarCpf(valor);

  if (cpf.length !== 11) return false;

  // Sequencias repetidas (000..., 111..., 999...) passam no calculo dos
  // digitos verificadores, mas nao sao CPFs validos.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Duas passadas: a primeira valida o 10o digito com pesos 10..2, a segunda
  // valida o 11o com pesos 11..2 (ja considerando o 10o digito).
  for (let tamanho = 9; tamanho <= 10; tamanho++) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }

    let digito = (soma * 10) % 11;
    if (digito === 10) digito = 0;

    if (digito !== Number(cpf[tamanho])) return false;
  }

  return true;
}

/** Mascara o CPF para uso em log: 529.982.***-** */
export function cpfParaLog(valor) {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return '***';
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.***-**`;
}
