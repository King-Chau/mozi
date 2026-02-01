# 企业微信接入指南

> ⚠️ **注意**：企业微信仅支持 Webhook 回调模式，需要公网可访问地址。此功能尚未完成测试。

企业微信机器人需要通过 HTTP 回调方式接收消息，与 QQ、飞书、钉钉的长连接模式不同。

## 前提条件

- **企业微信管理员权限**：需要拥有企业微信企业的管理员权限
- **公网可访问地址**：未认证企业可用公网 IP，已认证企业需使用已备案且主体一致的域名

## 1. 创建机器人

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/)
2. 导航至「安全与管理 > 管理工具」，点击「创建机器人」
3. 滑到页面底部，选择「API 模式」创建
4. 填写名称、简介、可见范围

## 2. 配置回调 URL

1. 在创建页面配置 URL，格式为：
   ```
   http://your-server:3000/wecom/webhook
   ```
2. 点击「随机获取」生成 **Token** 和 **EncodingAESKey**
3. **先不要点创建**，转去配置 Mozi

## 3. Mozi 配置

配置文件方式（`~/.mozi/config.local.json5`）：

```json5
{
  channels: {
    wecom: {
      corpId: "your_corp_id",         // 企业 ID（在企业信息页面查看）
      corpSecret: "your_corp_secret", // 应用密钥
      agentId: "your_agent_id",       // 应用 ID
      token: "your_token",            // 步骤 2 生成的 Token
      encodingAESKey: "your_aes_key"  // 步骤 2 生成的 EncodingAESKey
    }
  }
}
```

环境变量方式：

```bash
export WECOM_CORP_ID=your_corp_id
export WECOM_CORP_SECRET=your_corp_secret
export WECOM_AGENT_ID=your_agent_id
export WECOM_TOKEN=your_token
export WECOM_ENCODING_AES_KEY=your_aes_key
```

## 4. 启动服务

```bash
mozi start
```

## 5. 完成创建

1. 回到企业微信创建页面，点击「创建」按钮
2. 创建成功后扫描二维码添加机器人
3. 在聊天窗口对话测试
