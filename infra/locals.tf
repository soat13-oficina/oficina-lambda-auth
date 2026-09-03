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

  # A rota proxy so existe depois que a aplicacao subiu naquele ambiente e o
  # NLB ganhou hostname. Ate la o gateway expoe apenas POST /auth.
  publicar_proxy = local.cfg.app_base_url != ""
}
