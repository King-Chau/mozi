# 钉钉接入指南

钉钉使用 Stream 长连接模式，无需公网 IP，启动即可接收消息。

## 1. 创建应用

1. 前往 [钉钉开放平台](https://open-dev.dingtalk.com/fe/app)（需管理员权限）
2. 点击「创建应用」，选择「机器人」类型
3. 填写应用名称等必要信息，完成创建

## 2. 获取凭证

1. 在应用详情页面，点击「凭证与基础信息」
2. 保存 **Client ID** 和 **Client Secret**

## 3. 发布应用

1. 点击「版本管理与发布」，点击「创建新版本」
2. 填写版本描述，点击「保存」
3. 点击「发布」，在弹窗中确认发布

## 4. Mozi 配置

配置文件方式（`~/.mozi/config.local.json5`）：

```json5
{
  channels: {
    dingtalk: {
      appKey: "your_client_id",
      appSecret: "your_client_secret"
    }
  }
}
```

环境变量方式：

```bash
export DINGTALK_APP_KEY=your_client_id
export DINGTALK_APP_SECRET=your_client_secret
```

## 5. 启动并测试

```bash
mozi start
```

在钉钉中搜索机器人名称，发送消息测试。
