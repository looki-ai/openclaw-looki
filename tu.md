# 转发机制改造对比：`outbound.loadAdapter` → `deliverOutboundPayloads` + `sessionKey`

## 改造前：走 `outbound.loadAdapter`

```mermaid
flowchart TD
    A["Looki event 到达<br/>monitor.processLookiEvent"] --> B["forwardAgentOutput text, deps"]
    B --> C{"遍历 forwardTo<br/>channel / to / accountId"}
    C --> D["runtime.outbound.loadAdapter channel"]
    D -->|未暴露| E1["报错: upgrade OpenClaw ≥ 2026.4.24"]
    D -->|已加载| F{"adapter.sendText 存在?"}
    F -->|否| E2["报错: 对应 plugin 未安装/未启用<br/>附带 INSTALL_HINTS 安装提示"]
    F -->|是| G["adapter.sendText<br/>cfg / to / text / accountId"]
    G --> H["下游 channel plugin 自己<br/>调 API 发消息"]
    H --> I["完成单个 target<br/>try/catch 隔离"]

    style D fill:#fde7e7,stroke:#c0392b
    style G fill:#fde7e7,stroke:#c0392b
    style H fill:#fde7e7,stroke:#c0392b
```

关键点：

- 依赖每个 channel 插件暴露 `outbound.sendText` 适配器
- 只有"发出去"，**不会**写回 OpenClaw 会话 transcript
- 无幂等 key，同一 Looki 事件重投会产生重复消息
- `forwardTo` 仅 `{channel, accountId?, to}`，不知道要发到哪个 OpenClaw session

---

## 改造后：走 `deliverOutboundPayloads` + `sessionKey`

```mermaid
flowchart TD
    A["Looki event 到达<br/>monitor.processLookiEvent"] --> A2["带上 event.id<br/>作 idempotencyKey"]
    A2 --> B["forwardAgentOutput text, deps"]
    B --> C{"遍历 forwardTo<br/>channel / to / accountId / sessionKey"}
    C --> D["parseSessionKey<br/>agent:AID:channel:direct/group:ID"]
    D -->|解析失败| E1["报错: invalid sessionKey"]
    D -->|拿到 agentId + peerKind| F["runtime.routing.resolveAgentRoute<br/>补全 agentId / mainSessionKey"]
    F --> G["buildOutboundSessionContext<br/>cfg / agentId / sessionKey / conversationType"]
    G --> H["deliverOutboundPayloads"]
    H --> H1["① outbound 实发到下游 channel"]
    H --> H2["② mirror 写回 OpenClaw 会话 transcript<br/>用 idempotencyKey 去重"]
    H1 --> I["完成单个 target<br/>try/catch 隔离"]
    H2 --> I

    style D fill:#e6f4ea,stroke:#2e7d32
    style F fill:#e6f4ea,stroke:#2e7d32
    style H fill:#e6f4ea,stroke:#2e7d32
    style H2 fill:#e6f4ea,stroke:#2e7d32
```

关键点：

- `sessionKey` 在 CLI wizard 阶段就从 OpenClaw 已存在的会话里选好（format: `agent:<agentId>:<channel>:<direct|group|channel>:<peerId>`），`direct/group` 路由完全从它推导
- 统一走 `openclaw/plugin-sdk/outbound-runtime`，不再关心各个 channel 插件自己暴露什么适配器
- 自带 **mirror**：转发内容也会出现在目标 session 的聊天历史里
- 用 `event.id` 构造 `idempotencyKey`，重投不会重复发

---

## 字段 / 调用对照

| 维度 | 改造前 | 改造后 |
|---|---|---|
| 入口 | `runtime.outbound.loadAdapter(channel)` | `deliverOutboundPayloads({...})` |
| 路由推导 | 无 | `parseSessionKey` + `routing.resolveAgentRoute` |
| `forwardTo` 字段 | `channel, to, accountId?` | `channel, to, accountId?, **sessionKey**` |
| direct vs group | 下游 adapter 自己判断 | 从 `sessionKey` 第 4 段推导 |
| 会话 transcript | 不写入 | `mirror` 同步写入目标 session |
| 幂等 | 无 | `openclaw-looki:forward:<channel>:<acct>:<to>:<event.id>` |
| 失败隔离 | `Promise.all` + try/catch | 保持不变 |
| CLI 交互 | 手填 `to` / `accountId` | 从已有 OpenClaw 会话里选 |
| 依赖版本约束 | OpenClaw ≥ 2026.4.24（暴露 loadAdapter） | 依赖新的 `outbound-runtime` 导出 |
