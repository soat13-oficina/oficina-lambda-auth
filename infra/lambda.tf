# O ZIP e montado a partir de build/, populado por scripts/build.sh
# (npm ci --omit=dev + copia de src/ e node_modules/). Rode o build ANTES de
# qualquer plan/apply - a pipeline ja faz isso.
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../build"
  output_path = "${path.module}/../build.zip"
}

# ---------------------------------------------------------------------------
# Funcao de token - POST /auth
# ---------------------------------------------------------------------------

# Criado explicitamente para ter retencao. Se deixarmos a Lambda criar o grupo
# sozinha, ele nasce com retencao "never expire" e a conta de CloudWatch cresce
# para sempre.
resource "aws_cloudwatch_log_group" "token" {
  name              = "/aws/lambda/${local.prefixo}-token"
  retention_in_days = local.cfg.log_retention_days
}

resource "aws_lambda_function" "token" {
  function_name = "${local.prefixo}-token"
  role          = aws_iam_role.token.arn

  runtime = var.node_runtime
  handler = "src/handlers/token.handler"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  memory_size = local.cfg.lambda_memory_mb
  timeout     = local.cfg.lambda_timeout_s

  # Dentro da VPC para alcancar o RDS nas subnets de banco.
  vpc_config {
    subnet_ids         = local.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      AMBIENTE          = local.environment
      JWT_SECRET_ARN    = aws_secretsmanager_secret.jwt.arn
      DB_SECRET_ARN     = local.db_secret_arn
      DB_HOST           = local.db_address
      DB_PORT           = tostring(local.db_port)
      DB_NAME           = local.db_name
      TOKEN_TTL_SECONDS = tostring(local.cfg.token_ttl_seconds)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.token_vpc,
    aws_cloudwatch_log_group.token,
  ]
}

# ---------------------------------------------------------------------------
# Authorizer - valida o JWT antes das rotas protegidas
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${local.prefixo}-authorizer"
  retention_in_days = local.cfg.log_retention_days
}

# Deliberadamente FORA da VPC: precisa apenas do Secrets Manager. Anexar a VPC
# obrigaria a criar uma ENI por container e somaria cold start no caminho
# critico de toda requisicao protegida.
resource "aws_lambda_function" "authorizer" {
  function_name = "${local.prefixo}-authorizer"
  role          = aws_iam_role.authorizer.arn

  runtime = var.node_runtime
  handler = "src/handlers/authorizer.handler"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  memory_size = 256
  timeout     = 10

  environment {
    variables = {
      AMBIENTE       = local.environment
      JWT_SECRET_ARN = aws_secretsmanager_secret.jwt.arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.authorizer_logs,
    aws_cloudwatch_log_group.authorizer,
  ]
}
