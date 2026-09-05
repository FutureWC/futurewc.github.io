---
title: k8s自动补全
directoryTitle: 目录名称  # 侧栏目录中显示的自定义名称（可选）
published: 2026-09-05    # 发布日期
description: k8s TAB 补全命令     # 显示在列表页的摘要
cover: ./cover/k8s.jpg    # 文章封面图（可选）
tags: ["kubernetes"]      # 标签
category: "运维"   # 分类
draft: false             # 是否为草稿
---
# 1.安装 bash-completion

```shell
dnf install bash-completion
```

# 2.重新加载 bash-completion
```shell
#安装完成后，需要让当前会话加载它。最简单的方法是重新登录（退出 SSH 再重连），或者手动 source 配置文件：
source /usr/share/bash-completion/bash_completion
```

# 3.启用 kubectl 自动补全
```shell
source <(kubectl completion bash)
```

# 4.永久生效
```shell
echo "source <(kubectl completion bash)" >> ~/.bashrc
source ~/.bashrc
```