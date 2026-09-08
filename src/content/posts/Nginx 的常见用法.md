---
title: Nginx 的常见用法
directoryTitle: 目录名称  # 侧栏目录中显示的自定义名称（可选）
published: 2026-09-08    # 发布日期
description: Nginx 酱 你怎么这么厉害~     # 显示在列表页的摘要
cover: ./cover/nginx.jpg    # 文章封面图（可选）
tags: ["linux", "nginx"]      # 标签
category: "运维"   # 分类
draft: false             # 是否为草稿
---
Nginx 是一款高性能、开源的轻量级 Web 服务器和反向代理 服务器，同时也支持邮件代理和负载均衡等功能。 具有高性能、高并发、低资源消耗、功能灵活扩展的特点。   

# 一. Nginx 反向代理
在开发和部署Web应用时，反向代理是实现负载均衡、SSL证书管理和域名访问的关键技术。
## 1. 问题背景与核心需求
- 场景：后端服务运行在服务器3000端口，通过your-domain.com:3000可正常访问，但直接输入your-domain.com（默认80端口）时无法加载页面。
- 目标：配置Nginx反向代理，让域名（不带端口）直接指向后端服务，并启用HTTPS加密。

## 2. Nginx 反向代理核心配置流程
### 2.1 环境准备
为了便于后续维护，可以手动创建 sites-available 目录，用于集中管理单个站点的配置文件
```shell
mkdir -p /etc/nginx/sites-available
```
### 2.2 修改主配置文件（nginx.conf）：引入自定义配置
Nginx 主配置文件位于 /etc/nginx/nginx.conf，关键是在http块内添加 include 指令，让 Nginx 能读取 sites-available 目录下的配置：
```shell
# 编辑主配置文件
vi /etc/nginx/nginx.conf
# 在http块内添加以下内容（示例核心结构）
http {
    # 原有默认配置（如log_format、sendfile、include mime.types等，保留不变）
    # 关键：引入sites-available目录下的所有.conf配置文件
    include /etc/nginx/sites-available/*.conf;
}
```
### 2.3 编写反向代理配置文件
在 sites-available 目录下创建当前域名的配置文件（如your-domain.com.conf），内容包含“HTTP自动跳HTTPS”和“HTTPS反向代理”两部分：
```shell
# 1. 创建并编辑反向代理配置文件
vim /etc/nginx/sites-available/web1.com.conf

# 2. 配置文件内容：
# 2.1 HTTP请求（80端口）自动跳转HTTPS（强制加密访问）
server {
    listen 80;                  # 监听默认HTTP端口
    server_name web1.com; # 绑定你的域名
    # 所有HTTP请求301重定向到HTTPS
    return 301 https://$server_name$request_uri;
}
# 2.2 HTTPS请求（443端口）反向代理到后端3000端口
server {
    listen 443 ssl;             # 监听HTTPS默认端口
    server_name web1.com; # 绑定你的域名
    # SSL证书配置（替换为实际证书路径）
    ssl_certificate /etc/nginx/ssl/web1.com.pem;   # 公钥（PEM格式）
    ssl_certificate_key /etc/nginx/ssl/web1.com.key; # 私钥
    # 核心：反向代理到后端服务（3000端口）
    location / {
        proxy_pass http://127.0.0.1:3000;  # 转发到本地3000端口
        # 传递客户端真实IP和请求信息（后端服务可获取真实访问来源）
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme; # 告诉后端当前是HTTPS协议
    }
}
```
> __CA 创建__
> ```shell
> # 生成证书（有效期 365 天）
> openssl req -x509 -newkey rsa:4096 -keyout /etc/nginx/ssl/web1.com.key -out /etc/nginx/ssl/web1.com.pem -days 365 -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=MyOrg/OU=IT/CN=web1.com"
> ```

### 2.4 验证配置并生效
配置写完后，必须检查语法是否正确，再重新加载Nginx服务：
```shell
# 1. 检查Nginx配置语法（关键！避免配置错误导致服务无法启动）
nginx -t
# 若输出以下内容，说明语法正确：
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
# 2. 重新加载配置（不中断现有连接，平滑生效）
nginx -s reload
```

# 二. Nginx 负载均衡
## 1. 配置步骤
### 1.1 配置文件
Nginx 的负载均衡配置主要在 http 块内的 upstream 指令和 server 块内的 proxy_pass 指令中完成。
```shell
# 在任意一台机器上配置负载均衡器
# 创建 /etc/nginx/conf.d/web.conf 文件
upstream backend_servers {   # 后端服务器组
    # 负载均衡策略默认是轮询（round-robin）
    server 192.168.66.12:80;
    server 192.168.66.13:80;
}

server {
    listen 80;
    server_name web.com;   # 可以是域名或直接IP访问

    location / {
        proxy_pass http://backend_servers;   # 将客户端的请求转发到指定的后端服务器组
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;    # 设置请求头信息，确保后端服务器能获取客户端的真实信息。
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
### 1.2 验证配置并生效
```shell
nginx -t
nginx -s reload
```
## 2. Nginx 负载均衡策略
### 2.1 轮询（默认策略）
Nginx 按照顺序依次将请求分发到后端服务器，每个服务器轮流处理请求。
```shell
upstream backend_servers {   
    server 192.168.66.12:80;
    server 192.168.66.13:80;
}
```
### 2.2 加权轮询
为每个后端服务器分配一个权重，权重越高的服务器处理的请求越多。
```shell
upstream backend_servers {   
    server 192.168.66.12:80 weight=2;
    server 192.168.66.13:80 weight=1;
}
```
### 2.3 IP 哈希
根据客户端的 IP 地址进行哈希计算，将相同 IP 地址的请求总是发送到同一台后端服务器。
```shell
upstream backend_servers {   
    ip_hash;
    server 192.168.66.12:80;
    server 192.168.66.13:80;
}
```
### 2.4 最少连接
将请求发送到当前连接数最少的后端服务器，以确保各服务器的负载相对均衡。
```shell
upstream backend_servers {   
    least_conn;
    server 192.168.66.12:80;
    server 192.168.66.13:80;
}
```

## 3. 其他配置
### 3.1 健康检查
可以通过 server 指令的 max_fails 和 fail_timeout 参数进行健康检查。当后端服务器在 fail_timeout 时间内出现 max_fails 次失败请求时，Nginx 会认为该服务器不可用，暂时不再向其发送请求。
```shell
upstream backend_servers {   
    server 192.168.66.12:80 max_fails=3 fail_timeout=10s;
    server 192.168.66.13:80 max_fails=3 fail_timeout=10s;
}
```
### 3.2 超时设置
可以通过 proxy_connect_timeout、proxy_send_timeout 和 proxy_read_timeout 等指令设置连接超时、发送超时和读取超时时间，避免长时间等待无响应的后端服务器。
```shell
server {
    listen 80;
    server_name web.com;

    location / {
        proxy_pass http://backend_servers;

        proxy_connect_timeout 5s;  # Nginx 尝试与后端建立 TCP 连接的最长等待时间。
        proxy_send_timeout    10s;  # Nginx 向后端传输请求数据的最长间隔时间。
        proxy_read_timeout    10s;  # Nginx 等待后端返回响应数据的最长时间。
    }
}
```