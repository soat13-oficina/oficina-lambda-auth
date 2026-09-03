data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# Funcao de token: escreve log, cria ENI na VPC e le dois segredos.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "token" {
  name               = "${local.prefixo}-token"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Permissoes de rede (ec2:CreateNetworkInterface e afins) exigidas por qualquer
# Lambda anexada a uma VPC.
resource "aws_iam_role_policy_attachment" "token_vpc" {
  role       = aws_iam_role.token.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "token_segredos" {
  statement {
    sid     = "LeSegredosDoAmbiente"
    actions = ["secretsmanager:GetSecretValue"]
    # Apenas os dois segredos deste ambiente - nada de "*". A funcao de hml nao
    # consegue ler a credencial do banco de producao.
    resources = [
      aws_secretsmanager_secret.jwt.arn,
      local.db_secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "token_segredos" {
  name   = "${local.prefixo}-token-segredos"
  role   = aws_iam_role.token.id
  policy = data.aws_iam_policy_document.token_segredos.json
}

# ---------------------------------------------------------------------------
# Authorizer: so escreve log e le o segredo do JWT. Sem VPC, sem acesso ao banco.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "authorizer" {
  name               = "${local.prefixo}-authorizer"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "authorizer_logs" {
  role       = aws_iam_role.authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "authorizer_segredos" {
  statement {
    sid       = "LeApenasOSegredoDoJwt"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.jwt.arn]
  }
}

resource "aws_iam_role_policy" "authorizer_segredos" {
  name   = "${local.prefixo}-authorizer-segredos"
  role   = aws_iam_role.authorizer.id
  policy = data.aws_iam_policy_document.authorizer_segredos.json
}
