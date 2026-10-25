## Why

前端开发者需要生成的 MCP 功能在指定 Coding Agent 中真实可用，而仅通过 JSON Schema 检查无法发现消费者会省略工具。已有本地对照显示 Claude Code SDK CLI 2.1.293 会跳过含顶层 `oneOf` 的工具；首轮应把这一个失败机制做成可运行产品切片，并保留服务端参数约束。

## What Changes

- 提供一个脱敏的 MCP 消费者契约切片：用户通过文本输入或已有本地素材两种合法方式生成本地预览；Agent 先检查现有 schema 与 handler，只有不能满足请求时才改兼容表达。
- 使用实施前锁定的真实 Claude Code CLI，让工具经过 MCP 发现后进入该 CLI 发出的实际模型请求，再由本地确定性模型响应触发一次真实 `tools/call`，得到本地结果。无需真实模型、凭据或外部网络。
- 在同一入口保留顶层 `oneOf` 的失败对照，并验证兼容表达仍在实际服务 handler 拒绝非法输入组合，且拒绝前没有生成副作用。
- 复用当前 Node ESM、`node:test`、快照、预检及隔离约束；只为本 case 增加受信任的消费者运行入口，不放宽现有三个 tracer 的执行权限。
- 记录最小的消费者版本/二进制 hash、case/source hash、Skill 获取方式及结果边界；公开文档给出可复现命令，区分本地消费者兼容通过与 Coding Agent 行为效果尚未验证。

## Capabilities

### New Capabilities

- `real-consumer-contract-slice`: 锁定真实消费者的 MCP 发现、调用、合法输入保持和实际服务拒绝路径，以及对应的隔离、依赖失败与证据契约。

### Modified Capabilities

无。当前 `openspec/specs/` 没有已定义能力；不改变现有 tracer 的要求。

## Impact

预计涉及一个新 development case、对应的 Node ESM seed/本地 MCP 服务及 acceptance、一个窄的受信任 consumer 控制入口及其必要测试，以及现有产品验证说明。具体入口以实施预检确认的现有复用能力为准；既有 snapshot、preflight、隔离和 receipt 要求不得削弱。

真实消费者依赖为 Claude Code SDK CLI：历史可核对版本为 2.1.293，实施时必须确认该版本的可合法使用二进制及 hash；不将当前最新版自动视作同一复现条件。二进制不入仓库，不复制私有业务源码、配置或日志。既有 release、默认 Skill 核心、安装副本、共享数据库兼容迭代 F2、付费模型/供应商调用、通用评估平台及跨 Host 扩展均不在本 change 范围。
