# Security group da funcao de token, que roda DENTRO da VPC para alcancar o
# RDS. O authorizer nao entra na VPC (ver lambda.tf) - so precisa do Secrets
# Manager, e uma ENI por container de authorizer so somaria cold start.

resource "aws_security_group" "lambda" {
  name_prefix = "${local.prefixo}-lambda-"
  description = "Funcao de token: saida para o RDS e para os endpoints da AWS"
  vpc_id      = local.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

# Saida liberada: a funcao precisa alcancar o Secrets Manager (via NAT) e o
# PostgreSQL. O controle de quem entra fica no security group do RDS, abaixo.
resource "aws_vpc_security_group_egress_rule" "lambda_saida" {
  security_group_id = aws_security_group.lambda.id
  description       = "Saida para RDS e endpoints AWS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Abre a porta 5432 do RDS para esta funcao. A regra vive AQUI, e nao no repo
# do banco, porque e este repositorio que conhece o proprio security group -
# o repo do banco nao pode depender de quem o consome sem inverter a cadeia
# de dependencias entre os states.
resource "aws_vpc_security_group_ingress_rule" "rds_from_lambda" {
  security_group_id            = local.db_security_group_id
  description                  = "PostgreSQL a partir da Lambda de autenticacao (${local.environment})"
  referenced_security_group_id = aws_security_group.lambda.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
