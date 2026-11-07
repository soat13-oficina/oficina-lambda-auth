# Segredo HMAC compartilhado entre esta Lambda (que assina o JWT) e os tres servicos em Spring Boot
# (que o validam).
#
# Criado pelo infra/ do OS Service (oficina-app), como o service-token, e lido aqui pelo NOME
# "oficina/<ambiente>/jwt-secret". Antes era criado por este repositorio, mas o deploy do Billing e da
# Execution precisa dele e este repositorio precisa do ALB que esses deploys criam: com o segredo no
# infra/ do OS a ordem volta a ser linear (infra/ dos servicos -> deploy -> esta Lambda). Se nao
# existir, o plan falha com mensagem clara.
data "aws_secretsmanager_secret" "jwt" {
  name = "${var.project}/${local.environment}/jwt-secret"
}
