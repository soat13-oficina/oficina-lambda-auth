# Segredo HMAC compartilhado entre esta Lambda (que assina o JWT) e a API em
# Spring Boot (que o valida).
#
# CONTRATO COM O REPO DA APLICACAO: a pipeline de oficina-app le este segredo
# pelo NOME previsivel "oficina/<ambiente>/jwt-secret" e materializa a variavel
# JWT_SECRET no Secret do Kubernetes. Renomear aqui quebra o login la.

resource "random_password" "jwt" {
  length = 64
  # Sem caracteres especiais: o valor viaja por variavel de ambiente, Secret do
  # Kubernetes e YAML. 64 caracteres alfanumericos ja dao ~380 bits de entropia,
  # muito acima do minimo de 256 bits recomendado para HS256.
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name        = "${var.project}/${local.environment}/jwt-secret"
  description = "Segredo HMAC do JWT emitido pela Lambda de autenticacao (${local.environment})"

  # Ambiente de desafio: sem isto, um destroy seguido de apply falharia por
  # ~7 dias com "secret scheduled for deletion".
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt.result
}
