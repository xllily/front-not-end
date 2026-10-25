## 1. 锁定范围与复用条件

- [x] 1.1 核对当前 workspace、现有 tracer/Skill 契约和未提交修改；确定只增加本地预览 MCP case，复用现有 Node ESM、快照、preflight、资源和 receipt 能力，保留默认 case 及既有修改。
- [x] 1.2 核对合法可用的 Claude Code SDK CLI 2.1.293，记录版本、二进制 SHA256/来源和精简配置；验证其能在固定运行镜像、只读挂载及 `--network=none` 的容器内运行。缺失时明确该消费者验收的 SKIP/具体阻塞，不自动下载、换版本、放宽隔离或暂停可独立完成的 handler 工作。

## 2. 先完成可运行产品切片

- [x] 2.1 在现有 development case/fixture 结构增加脱敏产品请求、组织上下文与原生 ESM seed：文字/allowlisted 本地素材生成预览；已有 handler 和生成回调可运行，MCP baseline 暴露顶层 `oneOf` 的消费者兼容缺口。
- [x] 2.2 基于实际能力检查完成最小兼容 schema/必要接线，保留真实 handler 的模式、分支、额外字段与素材约束；两类合法输入可运行，非法组合在回调前拒绝，不复制 handler、不另开能力发现迭代、不默认改 Skill 核心。

## 3. 接通真实消费者的最小控制入口

- [x] 3.1 增加仅供本 case 的受信任固定控制入口：在同一个无外网 disposable 容器内部启动本地假模型、独立受限 workspace MCP handler 与只读固定 CLI；各自环境/读取域分离，CLI 使用临时 HOME/config、虚构 token 和固定工具白名单，预检内部 loopback、外部隔离与有界执行/清理。
- [x] 3.2 复用有界快照、控制侧随机 challenge/完成 receipt、资源与超时/清理约束；把捕获真实 CLI 请求、驱动预定 tool-use 和验证实际 tools/call/结果关联接在该入口，避免 workspace 通过自报输出或伪造模型请求构造成功。

## 4. 验证与交付

- [x] 4.1 使用同一真实 CLI/配置执行 schema A/B：baseline 实际模型请求缺少工具，兼容表达含工具；若 baseline 未复现或请求缺失，保留原因并报告未满足条件，不宣称已修复历史问题。
- [x] 4.2 以本地确定性模型响应驱动真实 CLI，分别验证文字与素材输入都经过实际 MCP handler 生成本地结果并关联 tool result；直接经同一服务入口验证错配模式、缺失参数、双分支、未知素材及额外字段全部拒绝且无副作用。
- [x] 4.3 只补新增入口必要的依赖缺失/版本不符、超时清理、伪造请求/输出、不完整 receipt 负例，验证既有三个 tracer 的隔离/default/receipt 不退化，并运行项目要求的 `npm test`。
- [x] 4.4 在现有产品说明记录 opt-in 复现命令、最小消费者/case/Skill 来源信息和分层结果；将本地消费者/dispatch/handler 证据与真实模型质量/Skill 增益未验证分开，不新增平行报告、保存私有原始日志或提交二进制。真实 Coding Agent 行为实验仅在另有明确模型/预算授权后执行，不能把未执行写成 PASS。
