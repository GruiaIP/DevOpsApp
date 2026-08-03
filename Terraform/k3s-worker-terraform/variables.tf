variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "Existing VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "Existing subnet ID"
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key-pair name"
  type        = string
}

variable "admin_ip_cidr" {
  description = "Administrator public IP in CIDR format"
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_ip_cidr, 0))
    error_message = "Use valid CIDR notation, such as 203.0.113.10/32."
  }
}