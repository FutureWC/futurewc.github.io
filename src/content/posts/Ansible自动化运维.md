---
title: Ansible 自动化运维
directoryTitle: 目录名称  # 侧栏目录中显示的自定义名称（可选）
published: 2026-09-07    # 发布日期
description: 从零开始掌握 Ansible 自动化运维     # 显示在列表页的摘要
cover: ./cover/ansible.jpg    # 文章封面图（可选）
tags: ["linux", "ansible"]      # 标签
category: "运维"   # 分类
draft: false             # 是否为草稿
---
# 1. 什么是 Ansible？
Ansible 是一款开源的自动化工具，广泛应用于配置管理、应用部署、任务自动化以及多节点管理等领域。  
Ansible 使用称为 playbook（剧本）的简单且易读的脚本来自动化您的任务。您在 playbook 中声明本地或远程系统的期望状态，Ansible 则确保系统保持在该状态。  
>__Ansible 的核心特点__
>- 无代理架构 (Agent-less architecture)：通过避免在 IT 基础设施中安装额外的软件，降低维护开销。
>- 简单性：自动化 playbook 使用简单的 YAML 语法，使得代码读起来像文档一样。Ansible 同样是去中心化的，使用现有的 操作系统凭据通过 SSH 访问远程机器。
>- 可扩展性与灵活性：通过支持广泛的操作系统、云平台和网络设备的模块化设计，轻松快速地扩展您自动化的系统。
>- 幂等性与可预测性：当系统处于 playbook 所描述的状态时，即使多次运行 playbook，Ansible 也不会对系统做任何更改。  

# 2. Ansible 的安装
2.1 在控制节点安装并运行 Absible （被控节点是被 Ansible 管理的主机，无需安装任何额外软件，仅需确保 SSH 服务正常运行，并具备必要的访问权限。）   
```shell
dnf install ansible-core
```
2.2 控制节点与被控节点做免密登录  
```shell
# 生成 SSH 密钥
ssh-keygen

# 复制本机公钥到其它被控节点
ssh-copy-id root@被控节点IP
```
# 3. 主机清单
清单（Inventory）定义 Ansible 将要管理的一批主机。这些主机也可以分配到组中，以进行集中管理。组可以包含子组，主机也可以是多个组的成员。清单还可以设置应用到它所定义的主机和组的变量。  
3.1 清单配置示例  
```shell
[web1servers] #组名
192.168.66.11
n1 ansible_host=192.168.66.12   #ansible_host：主机的实际 IP 或域名（默认为清单中定义的主机名）

[web2servers]
n2 ansible_user=root #ansible_user：用于连接主机的用户（默认为当前用户）

[all:vars] #组变量使用 [组名:vars] 定义
ansible_ssh_common_args=-o StrictHostKeyChecking=no #跳过主机密钥验证

[web:children] #嵌套组
web1servers
web2servers #表示 web 组包含 web1servers 和 web2servers 两个子组。
```
3.2 主机清单常用命令
```shell
# 1. 查看主机清单结构
ansible-inventoy -i inventory.ini  --list

# 2. 检查主机是否可用
ansible all -i inventory.ini -m ping
```
# 4. ad-hoc (临时命令) 与四大模块
```shell
# 1. command 模块：在被控节点上执行简单命令（不带 shell 解析），由控制节点下发指令。
ansible all -i inventory.ini -m command -a "date"
ansible all -i inventory.ini -m command -a "df -h /"

# 2. copy 模块：先在控制节点准备文件，再下发到所有web
echo "hello world!" >> /tmp/test.txt
ansible all -i inventory.ini -m copy -a "src=/tmp/test.txt dest=/tmp/helloworld.txt"

# 3. dnf 模块：在被控节点安装软件包
ansible all -i inventory.ini -m dnf -a "name=nginx state=present"

# 4. service 模块：管理被控节点上的服务（启动并设置开机自启）
ansible all -i inventory.ini -m service -a "name=nginx state=started enabled=yes"
```
>ad-hoc 的局限：每次手敲一长串，换个环境又来一遍。因此，可以使用 Playbook 把命令写成文件，可复用。

# 5. Palybook
```shell
# 1. 配置 Playbook 文件（yaml）。
---
- name: 部署 Nginx 到 web 服务器
  hosts: web
  tasks: 
    - name: 安装 nginx
      dnf: 
        name: nginx
        state: present
        
    - name: 启动 nginx 并设置开机自启
      service: 
        name: nginx
        state: started
        enabled: yes

# 2. 运行 playbook
ansible-playbook -i inventory.ini playbook.yaml
```
# 6. 变量与 register
变量（vars） 用于定义可复用的参数，而 register 则用于捕获任务的执行结果。  
> 本示例通过 vars 定义应用名称与端口，并使用 register 获取 nginx -v 的输出，结合 debug 模块实现信息的结构化展示与调试。同时，--limit 参数用于将执行范围限制在指定主机组，便于灰度验证。  

```shell
# 1. 配置 Playbook 文件（yaml）。
---
- name: 变量与 register 演示
  hosts: web
  vars:                      #变量
    app_name: "我的第一个网站"
    web_port: 80
  tasks: 
    - name: 打印变量
      debug: 
        msg: "应用名：{{ app_name }}，端口：{{ web_port }}"
    
    - name: 查看 nginx 版本
      command: nginx -v
      register: nginx_ver    # register 接住命令结果
      changed_when: false
        
    - name: 打印 register 的完整结构
      debug: 
        var: nginx_ver
        
    - name: 只打印版本号
      debug: 
        msg: "{{ inventory_hostname }} 的版本是：{{ nginx_ver.stderr}}"

# 2. 运行 playbook
ansible-playbook -i inventory.ini vars.yaml --limit web1servers  #--limit 用于限制 Playbook 实际执行的目标主机范围
```
# 7. Jinjia2 模板与 handlers
为实现配置的模板化管理，并保证修改后的配置能自动生效，本例采用 Jinja2 渲染动态内容，配合 handlers 监听变更事件，替代逐台手动编辑与重启。  
```shell
# index.html.j2
<h1>{{ app_name }}</h1>
<p>本机是：{{ inventory_hostname }}</p>
<p>IP 地址：{{ ansible_default_ipv4.address }}</p>

# site.conf.j2
server {
    listen 80 default_server;
    server_name {{ inventory_hostname }};
    root /usr/share/nginx/html;
}

# template.yaml
---
- name: 模板下发差异化配置
  hosts: web
  vars: 
    app_name: "我的第一个网站"
  tasks:
    - name: 下发首页（每台内容不同）
      template:
        src: template/index.html.j2
        dest: /usr/share/nginx/html/index.html
        
    - name: 下发 nginx 站点配置
      template:           #template 模块比 copy 模块强大。它会在控制节点上把模板里的变量计算/替换好，再把最终结果传过去。
        src: template/site.conf.j2
        dest: /etc/nginx/conf.d/site.conf
      notify: 重载 nginx   #它像一个“监控哨兵”。只有当这个 template 任务真正改变了目标机器上的文件内容（比如第一次下发，或者修改了模板），它才会发出“通知”。如果没有改变文件（幂等），就不会通知。
      
  handlers:               #专门接收 notify 发来的信号。
    - name: 重载 nginx
      service: 
        name: nginx
        state: reloaded

# 运行
ansible-playbook -i inventory.ini template.yaml
```







