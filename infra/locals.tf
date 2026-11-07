locals {
  environment = terraform.workspace

  # Falha cedo e com mensagem legivel quando alguem esquece de selecionar o
  # workspace - sem isto, um apply no workspace default criaria um terceiro
  # API Gateway fora de qualquer ambiente.
  cfg = try(
    var.environments[local.environment],
    file("ERRO: workspace '${terraform.workspace}' invalido. Rode 'terraform workspace select hml' ou 'terraform workspace select prd' antes do plan/apply.")
  )

  prefixo = "${var.project}-auth-${local.environment}"

  # Endereco do ALB do ambiente (IngressGroup oficina-<env>, ADR 0008 do oficina-app): o pipeline de deploy
  # de cada servico grava em /oficina/<env>/alb-url depois do rollout. Se o parametro nao existe, o plan
  # falha aqui - o gateway so sobe depois do deploy dos servicos (apply: ... deploy dos 3 -> lambda-auth).
  app_base_url = data.aws_ssm_parameter.alb_url.insecure_value
}
