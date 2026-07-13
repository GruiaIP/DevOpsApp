\# AWS EC2 Static Website Deployment



\## Overview



This project demonstrates how to deploy a simple static website on an \*\*Ubuntu EC2 instance\*\* hosted on \*\*Amazon Web Services (AWS)\*\* using \*\*Nginx\*\* as the web server.



The objective is to gain hands-on experience with AWS infrastructure, Linux administration, SSH, and web server configuration.



\---



\## Technologies Used



\- Amazon Web Services (AWS)

\- Amazon EC2

\- Ubuntu Server

\- Nginx

\- HTML5

\- SSH

\- Git \& GitHub



\---



\## Project Requirements



The following tasks were completed:



\- Created an AWS account.

\- Explored the AWS Management Console.

\- Launched an EC2 instance with:

&#x20; - Ubuntu Server AMI

&#x20; - t3.micro instance type (AWS Free Tier)

&#x20; - Default VPC and subnet

&#x20; - Public IPv4 address

\- Configured the Security Group to allow:

&#x20; - TCP Port 22 (SSH)

&#x20; - TCP Port 80 (HTTP)

\- Created and downloaded an SSH key pair.

\- Connected securely to the EC2 instance using SSH.

\- Updated Ubuntu packages.

\- Installed and configured the Nginx web server.

\- Created a custom static HTML webpage.

\- Deployed the website to the EC2 instance.

\- Accessed the website through the EC2 public IP address.



\---



\## Project Structure



```

\Ex2_StaticWebsite/

│

├── README.md

└── index.nginx-debian.html

```



\---



\## Deployment Steps



\### 1. Launch an EC2 Instance



\- Ubuntu Server AMI

\- t3.micro

\- Default VPC

\- Public IP enabled



\### 2. Configure Security Group



Allowed inbound traffic:



| Protocol | Port | Purpose |

|----------|-----:|---------|

| SSH | 22 | Remote access |

| HTTP | 80 | Website access |



\---



\### 3. Connect via SSH



```bash

ssh -i your-key.pem ubuntu@<EC2\_PUBLIC\_IP>

```



\---



\### 4. Update Ubuntu



```bash

sudo apt update

sudo apt upgrade -y

```



\---



\### 5. Install Nginx



```bash

sudo apt install nginx -y

```



Verify installation:



```bash

sudo systemctl status nginx

```



\---



\### 6. Deploy the Website



Replace the default Nginx page:



```bash

cd /var/www/html



sudo rm index.nginx-debian.html



sudo nano index.html

```



Paste the HTML code and save the file.



\---



\### 7. Access the Website



Open a browser and navigate to:



```

http://<EC2\_PUBLIC\_IP>

```



Your custom website should be displayed.



\---



\## Result



The project successfully deployed a static HTML website on an Ubuntu EC2 instance using Nginx.



The website is accessible through the instance's public IP address.



\---



\## Skills Demonstrated



\- AWS EC2 provisioning

\- Linux command line

\- SSH remote administration

\- Nginx installation and configuration

\- Static website deployment

\- Network security groups

\- Git \& GitHub



\## Author



Created as part of my DevOps learning journey.


https://roadmap.sh/projects/ec2-instance

