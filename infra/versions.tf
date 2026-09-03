terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Backend parcial: bucket e region vem de backend.hcl (nao versionado).
  #   terraform init -backend-config=backend.hcl
  #
  # Como no repo do banco, os ambientes sao WORKSPACES (hml e prd).
  backend "s3" {
    key          = "oficina/lambda-auth.tfstate"
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Layer       = "auth"
      Environment = local.environment
      ManagedBy   = "terraform"
      Repo        = "oficina-lambda-auth"
    }
  }
}
