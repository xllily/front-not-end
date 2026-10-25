## Context

现有三个 tracer 使用原生 Node ESM、`node:test` 和受限 Docker runner。`createTracerSnapshot` 只复制有界的 `package.json` 与 `src/`；`runTracerSandbox` 禁子进程并使用 `--network=none`；preflight 验证本地 daemon、固定 Node 22.23.2 镜像、只读挂载和资源限制；host 仅接受完整控制测试后的随机 receipt。它们没有运行真实 Coding Agent CLI 的能力。

历史消费者对照实际执行 `/cli/claude`，调试日志标识 `claude-code/2.1.293 (sdk-cli)`。含顶层 `oneOf` 时真实 `/v1/messages` 请求没有目标 MCP 工具；仅移除该顶层结构后，工具进入请求。历史探针在生成前返回错误，因此只证明发现/请求构造，不证明实际调用、生成质量或当前版本仍复现。

本 change 把机制抽象为公开的本地预览工具，不复制 AICloud/OpenDesign 私有实现。使用前端可理解的产品请求：用户以文字或提供的本地素材生成预览卡片，两种方式均可用，错误组合有明确反馈。

## Goals / Non-Goals

**Goals:**

- 先提供能运行的产品切片：Agent 检查已有契约、修正消费者表达并保留服务端语义，真实 CLI 可发现并调用该工具。
- 同一消费者/配置下复现原失败机制，并验证最小修复使发现、实际本地调用及合法/非法业务路径满足契约。
- 保留现有三种 tracer 的执行边界，只有本 case 的受信任控制入口能启动固定消费者。
- 用最少来源与结果记录支撑复现，明确本地模拟模型的证据上限。

**Non-Goals:**

- 不修改 Claude Code、不重写其 schema 解析器、不以模型 shim 代替消费者，不推导其他 Host/版本也有该问题。
- 不默认修改 Skill 核心、不同步安装缓存、不引入新通用 runner/评分平台、自动学习或遥测。
- 不增加真实媒体生产、数据库迁移/版本混跑、供应商集成、付费模型调用或跨 Host 矩阵。

## Decisions

### 1. 把现有能力检查和修正合成一条产品路径

case 放入现有 `evals/cases/development/` 和对应 `evals/fixtures/` 结构，遵守 Node ESM 与原生测试风格。seed 提供一个本地 MCP 服务和 `preview_card` handler，既有文本与素材两种业务输入能力已存在，缺陷只在向消费者暴露的 schema 表达。

输入约定为 `mode=text` 配合非空 `text`，或 `mode=asset` 配合 allowlisted `assetId`；两者都返回一个确定的本地预览结果。服务 handler 对不匹配 mode、缺失分支参数、同时提交两类参数、未知素材及额外字段作拒绝。合法路径通过可观察的本地生成回调；非法路径在调用回调之前返回清楚的工具错误。

Agent 先运行已有服务/测试并判断缺口；仅改变工具发现所需表达及必要接线。不另建“发现能力”项目，也不复制业务 handler 到验收代码。没有消费者兼容缺口就保留已有行为，并如实报告该消费者条件无法复现。拒绝把某 CLI 的限制写成全产品 schema 禁令。

独立本地切片以 `src/mcp-server.mjs` 的 stdio 入口提供初始化、工具发现与调用，默认使用扁平对象 schema，`--baseline` 只恢复顶层 `oneOf`。两种表达共享实际 handler；预览返回内嵌素材或转义文字的自包含 HTML，不读取任意路径或调用模型。此入口是可运行的本地产品结果，不是受信任消费者验收；后续容器内 loopback 传输仍须复用同一 dispatcher/handler 并独立证明下述隔离条件，不能以本机 stdio 测试代替。

### 2. 用真实 CLI，加一个该 case 专用的受信任控制入口

保留现有 `run-tracer-acceptance.mjs` 默认行为和全部隔离策略。新入口复用确实适用的快照、preflight、资源上限、错误/清理与 receipt 机制；仅为这个 case 定义固定命令、受控依赖挂载和控制测试，不添加任意脚本执行或网络开关。

执行拓扑是**同一 disposable `--network=none` 容器内部**的三个进程角色：

1. 受信任控制进程启动假模型 HTTP 服务并捕获请求；它持有随机 endpoint challenge、控制断言与完成 receipt。
2. 独立 Node 子进程运行完成后的 workspace MCP handler，仅有必要只读源码权限、最小环境和有界资源，不能启动子进程、读取控制材料/其他进程信息或继承 CLI 环境。
3. 固定的真实 CLI 进程使用只读挂载的核对后二进制，连接容器自己的 loopback MCP 服务及假模型。它只有独立临时 HOME/config、虚构测试 token、固定工具白名单和禁非必要流量/更新配置；不开启用户配置、历史会话或本机工具。

`--network=none` 留下的是容器自己的 loopback；不使用也不假设可访问 host 的 `127.0.0.1`。外部出网由容器网络边界阻断，不能仅凭绑定 loopback 声称隔离。CLI 和 handler 分离环境与读权限，workspace 不得获取假模型 endpoint challenge 并伪造消费者请求；验收需要受信任捕获与挑战绑定，不能信 workspace 自报“已发现”。Node 控制进程能 spawn 固定 CLI，不等于给 Agent 代码开放 spawn 权限。

实施预检必须确认 CLI 在既有固定镜像及约束内可以运行，并证明 loopback 可达、外部路由不可用及清理有效。若不兼容，停止该消费者路径并报告具体缺失，不换成 host 上直接跑 CLI、放宽现有 runner、自动下载/升级镜像或增加通用执行环境。只在已证明的最小本地方案上继续实施；其余本地 handler 测试可独立完成。

### 3. 固定复现条件后做两个最小对照

实施先记录消费者自报版本、二进制 SHA256/来源、固定 runtime/image、case/source hash 和精简配置；历史目标是 2.1.293，其可用性与授权尚未在本提案阶段验证。不得把未来版本替代该版本后仍宣称复现原问题。

发现对照中，输入、工具名、分支语义、consumer 二进制和配置完全相同，唯一被比较的差异是顶层 `oneOf` 与兼容的扁平对象表达。baseline 应在实际模型请求的 tools 中缺少目标工具，修复应出现。没有复现时标明 `UNVERIFIED`/不符合复现条件，而非令验收自动通过。

调用对照中，受信任假模型根据捕获请求发出预定 `tool_use`，真实 CLI 必须发送 MCP `tools/call` 并提交对应 tool result；handler 必须确实执行本地合法业务回调。假模型只用于驱动协议，不实现或模拟 CLI 的工具发现规则。合法两分支和非法组合经实际 MCP handler 验证，其中非法输入即使消费者本地已拒绝，也须直接对实际服务入口补一次拒绝检查。

### 4. 完成条件服务于当前切片

控制测试覆盖 baseline 工具遗漏、兼容后发现、真实 dispatch/结果关联、两类合法输入、非法组合无副作用，以及新增入口的依赖缺失/超时/不完整 receipt/伪造请求拒绝。仅测试新增或受影响边界，并运行仓库要求的 `npm test`；既有三种 tracer 无需额外付费重放。

结果区分 `PASS`、`FAIL`、`SKIP`、`UNVERIFIED`。CLI 缺失或版本/hash 不符时命令非成功，具体依赖标 `SKIP`；执行后断言失败为 `FAIL`，不得因测试未启动或 CLI 退出码非零但未捕获有效证据而产生 `PASS`。既有预检/隔离错误继续 fail closed。

来源记录只包括本次实际使用的 Skill 获取方式（file/injected/inherited/none/unknown）与可核对版本或 hash，不把“读取了 Skill”当效果证明。真实 Coding Agent 修复能力的增益另需获得预算与调用授权后做固定 baseline/candidate 重放；本 change 的必交付是零费用消费者/handler 契约，不因尚未授权模型实验而阻断本地可运行切片，也不声称已证实行为提效。

## Risks / Trade-offs

- [历史二进制目前可能不可用或不能在固定镜像中运行] → 第一个实施任务核对来源/hash/运行约束；缺失时报告具体条件，不用替代消费者制造通过。
- [受信任 CLI 需要 spawn/loopback，现有通用入口刻意禁止这些能力] → 使用仅服务本 case 的受信任控制进程；Agent handler 继续独立受限，既有 runner 不放宽。
- [workspace 可伪造消费者请求或完成输出] → 控制端独占随机请求 challenge 与 receipt，隔离 workspace 的环境/读取权限，加入一次针对性伪造路径负例。
- [扁平 schema 失去分支约束] → 约束保留在实际 handler，合法两分支与非法交叉组合均经该 handler；不以 schema-only 检查代替业务验收。
- [模拟模型成功被误认为真实模型能力] → 明确记录“消费者发现/本地协议/handler 通过”；模型质量和 Skill 增益保持未验证。

## Migration Plan

新增一个 opt-in case 与专用命令，不改变当前默认 case、已有 release 或用户安装。回退时移除该 case 及其独有控制入口即可；现有三个 tracer 和 Skill 核心保持兼容。生成运行产物留在临时目录并清理，不将私有日志、二进制或运行输出入仓。

## Open Questions

- 官方 2.1.293 Linux arm64-musl Release 归档及校验文件已按发布的 SHA256 核对；解包后二进制 SHA256 为 `00755ae106b6925c1adb2b17e4c6d9b0c41eb4cc55bcad3581345b0aa3176c85`。固定镜像内已确认自报版本、内部 loopback 与外部隔离，并通过本地 stub 驱动的真实发现与调用。专用入口在每次运行重复这些约束检查；OpenPGP 签名未独立验证，不扩展为其他平台、版本或真实模型效果的保证。
- 如未来单独请求真实 Coding Agent 行为对照，需要另行确定模型、预算、加载源和重放条件；本提案不代替该授权。
