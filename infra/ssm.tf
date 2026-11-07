# Endereco do ALB do ambiente, gravado pelo pipeline de deploy dos servicos (ver ci-cd.yml de cada um):
#   /oficina/<env>/alb-url = http://<hostname-do-alb>
#
# Substitui o app_base_url que ficava fixo em variables.tf e era preenchido a mao a cada recriacao do
# ambiente. Tambem e o endereco que a Lambda de token usa para consultar o cliente no OS Service
# (/internal/clientes/por-cpf/{cpf}); la o ALB so encaminha a rota com o header X-Service-Token.
data "aws_ssm_parameter" "alb_url" {
  name = "/${var.project}/${local.environment}/alb-url"
}

# Segredo das chamadas internas entre servicos, criado pelo infra/ do OS Service. Lido por NOME: este
# repositorio nao le o state de outro. Se nao existir, o plan falha com mensagem clara.
data "aws_secretsmanager_secret" "service_token" {
  name = "${var.project}/${local.environment}/service-token"
}
