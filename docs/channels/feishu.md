# 飞书接入指南

飞书使用 WebSocket 长连接模式，无需公网 IP，启动即可接收消息。

## 1. 创建应用

1. 登录 [飞书开放平台](https://open.feishu.cn/)，创建企业自建应用
2. 获取 App ID 和 App Secret
3. 在应用管理页左侧导航栏，找到「应用能力」，启用「机器人」能力

## 2. 事件配置

1. 在应用管理页左侧导航栏，找到「事件与回调」，点击进入
2. 订阅方式选择「长连接」，点击「保存」
   > ⚠️ 如果提示"未建立长连接"，需要先完成「Mozi 配置」并启动服务（`mozi start`），再回来保存长连接
3. 点击「添加事件」，在弹出列表中选择「消息与群组」分类，勾选「接收消息」（`im.message.receive_v1`），点击「确定」

## 3. 权限配置

1. 在应用管理页左侧导航栏，找到「权限管理」，点击进入
2. 点击「批量导入权限」按钮，将以下 JSON 粘贴到输入框中，点击「导入」：

```json
{
  "scopes": {
    "tenant": [
      "contact:user.base:readonly",
      "im:chat",
      "im:chat:read",
      "im:chat:update",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:send_as_bot",
      "im:resource"
    ],
    "user": []
  }
}
```

3. 页面显示「导入成功」即为完成

## 4. 发布应用

1. 在应用管理页左侧导航栏，找到「版本管理与发布」
2. 点击右上角「新建版本」，填写版本号与描述
3. 保存并发布，等待审核通过

## 5. Mozi 配置

配置文件方式（`~/.mozi/config.local.json5`）：

```json5
{
  channels: {
    feishu: {
      appId: "cli_xxx",
      appSecret: "xxx"
    }
  }
}
```

环境变量方式：

```bash
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
```

## 6. 启动并测试

```bash
mozi start
```

在飞书中搜索机器人名称，发送消息测试。
