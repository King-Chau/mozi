# QQ 接入指南

QQ 使用 WebSocket 长连接模式，无需公网 IP，但需要配置 IP 白名单。

## 1. 注册并创建应用

1. 访问 [QQ 开放平台](https://q.qq.com/#/apps) 并完成注册
2. 点击「创建机器人」，填写机器人信息
   > 个人使用无需企业资质，可选择「指定用户、指定群聊可访问」

## 2. 获取凭证

1. 点击机器人头像进入管理界面
2. 在「开发设置」页面获取 App ID 和 App Secret
   > 管理页面地址：https://q.qq.com/qqbot/#/developer/developer-setting

## 3. 配置 IP 白名单（重要）

1. 在「开发设置」页面找到「IP 白名单」
2. 添加服务器的公网 IP 地址
   ```bash
   # 获取服务器公网 IP
   curl -s ip.sb
   ```
   > 未配置白名单会导致连接失败，提示 "接口访问源IP不在白名单"

## 4. 配置沙箱（可选）

正式上线前，机器人只能在沙箱范围内使用：

1. 访问 [沙箱配置页面](https://q.qq.com/qqbot/#/developer/sandbox)
2. 添加测试用户或测试群

## 5. Mozi 配置

配置文件方式（`~/.mozi/config.local.json5`）：

```json5
{
  channels: {
    qq: {
      appId: "your-app-id",
      clientSecret: "your-app-secret",
      sandbox: false  // 沙箱环境设为 true
    }
  }
}
```

环境变量方式：

```bash
export QQ_APP_ID=your-app-id
export QQ_CLIENT_SECRET=your-app-secret
export QQ_SANDBOX=false  # 可选，默认 false
```

## 6. 添加机器人

1. 在机器人管理页面，扫描「添加成员」旁边的二维码
2. 将机器人添加到聊天界面或拉入群聊

## 7. 启动并测试

```bash
mozi start
```

在 QQ 中找到机器人，发送消息测试。
