terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Find the latest Ubuntu 24.04 image in the selected AWS region.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Dedicated security group shared by the K3s control plane and worker.
resource "aws_security_group" "k3s_cluster" {
  name        = "k3s-cluster"
  description = "Security group for K3s control plane and worker"
  vpc_id      = var.vpc_id

  tags = {
    Name = "k3s-cluster"
  }
}

# Allow communication between instances that have this security group.
resource "aws_vpc_security_group_ingress_rule" "k3s_internal" {
  security_group_id            = aws_security_group.k3s_cluster.id
  referenced_security_group_id = aws_security_group.k3s_cluster.id
  ip_protocol                  = "-1"

  description = "Allow private communication between K3s nodes"
}

# Allow SSH only from your current public IP.
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.k3s_cluster.id
  cidr_ipv4         = var.admin_ip_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"

  description = "SSH from administrator IP"
}

# Allow access to Kubernetes NodePort services.
resource "aws_vpc_security_group_ingress_rule" "node_app" {
  security_group_id = aws_security_group.k3s_cluster.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 30000
  to_port           = 32767
  ip_protocol       = "tcp"

  description = "Kubernetes NodePort services"
}

# Allow the instances to reach package repositories, Docker registries, etc.
resource "aws_vpc_security_group_egress_rule" "all_outbound" {
  security_group_id = aws_security_group.k3s_cluster.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  description = "Allow outbound traffic"
}

# The new K3s worker EC2 instance.
resource "aws_instance" "k3s_worker" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t3.small"
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.k3s_cluster.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = {
    Name = "k3s-worker"
    Role = "k3s-worker"
  }

  depends_on = [
    aws_vpc_security_group_ingress_rule.k3s_internal,
    aws_vpc_security_group_ingress_rule.ssh,
    aws_vpc_security_group_egress_rule.all_outbound
  ]
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.k3s_cluster.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"

  description = "Public HTTP access"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.k3s_cluster.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"

  description = "Public HTTPS access"
}

output "worker_instance_id" {
  value = aws_instance.k3s_worker.id
}

output "worker_private_ip" {
  value = aws_instance.k3s_worker.private_ip
}

output "worker_public_ip" {
  value = aws_instance.k3s_worker.public_ip
}

output "k3s_security_group_id" {
  value = aws_security_group.k3s_cluster.id
}