# Terceira camada da cadeia de dependencias:
#   oficina-infra-k8s -> oficina-infra-database -> oficina-lambda-auth
#
# Se algum destes data sources falhar com "Unable to find remote state", a
# camada correspondente ainda nao foi aplicada naquele ambiente.

data "terraform_remote_state" "platform" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = var.platform_state_key
    region = var.aws_region
  }
}

# O repo do banco usa workspaces, entao o state fica em env:/<workspace>/<key>.
# O argumento workspace do data source resolve esse caminho para nos.
data "terraform_remote_state" "database" {
  backend   = "s3"
  workspace = local.environment

  config = {
    bucket = var.state_bucket
    key    = var.database_state_key
    region = var.aws_region
  }
}

locals {
  platform = data.terraform_remote_state.platform.outputs
  database = data.terraform_remote_state.database.outputs

  vpc_id             = local.platform.vpc_id
  private_subnet_ids = local.platform.private_subnet_ids

  db_security_group_id = local.database.security_group_id
  db_secret_arn        = local.database.master_user_secret_arn
  db_address           = local.database.db_address
  db_port              = local.database.db_port
  db_name              = local.database.db_name
}
