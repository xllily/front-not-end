# front-not-end — 为前端主导的产品需求补齐后端技术完整性

front-not-end 是一个采用 Apache-2.0 许可证、面向 Codex 的 Agent Skill。
它让具备前端经验的人只描述产品需求，由 Coding Agent 负责可用于生产的后端实现。

它是一个可安装的 Agent Skill，不替代 Agent，也不创建新的 Runtime。Skill
会要求 Agent 先检查仓库和可用的运行上下文，只激活与当前任务相关的后端问题，
自主选择安全的技术方案，完成实现，并验证最终交付状态。

用户负责产品意图、Agent 无法推断的事实、真实约束，以及不可逆或外部操作的授权。
Agent 负责技术完整性。

当一个前端或产品需求涉及 API、服务端数据、登录鉴权、权限、持久化、后台任务、
外部集成、部署或其他生产后端行为时，适合使用 front-not-end。Agent 的权威指令在
[`skills/front-not-end/SKILL.md`](skills/front-not-end/SKILL.md)，简明的 Agent 可读入口
在 [`llms.txt`](llms.txt)。

**状态：** 实验性 `0.x`。当前证据覆盖两条可运行的 Codex Tracer，不代表已经覆盖
所有技术栈、Agent Host 或后端场景。

## 安装

仓库发布后：

```sh
npx skills add xllily/front-not-end --skill front-not-end -g -a codex -y
```

从当前 checkout 安装：

```sh
npx skills add . --skill front-not-end -g -a codex -y
```

也可以使用 Codex 内置安装器：

```text
$skill-installer 安装 https://github.com/xllily/front-not-end/tree/master/skills/front-not-end
```

安装后开启一个新的 Agent 任务。后端相关工作可以自动激活 Skill，也可以显式使用
`$front-not-end`。

## 用产品语言提需求

例如：

> 项目列表页只显示当前登录用户所在工作区的项目，支持关键词搜索和“加载更多”；
> 已有项目详情功能不能受影响。

用户不需要指定 cursor、鉴权中间件、数据访问模式或测试方案。只要这些问题与当前
项目有关，就由 Agent 主动发现并负责。

这个例子明确存在工作区边界，所以需要范围隔离；front-not-end 不会假设每个后台
系统都是多租户。单组织后台只应激活它真实存在的登录、角色和数据访问边界。

## 可运行 Tracer

仓库包含两个现有项目场景：`existing-list-search-reuse` 验证范围化搜索与稳定分页；
`project-create-authorization` 验证有权限、按工作区隔离、可安全重试且未授权时无副作用
的创建操作。两者都验证 Skill 能否把纯产品需求转化为贴合仓库、复用现有平台能力的
实现。

准备干净工作区：

```sh
export FNE_REPO=/path/to/front-not-end
export FNE_WORKSPACE="$(mktemp -d)"
export FNE_CASE=project-create-authorization
cp -R "$FNE_REPO/evals/fixtures/$FNE_CASE/seed/." "$FNE_WORKSPACE"
cp "$FNE_REPO/evals/cases/development/$FNE_CASE/task.md" "$FNE_WORKSPACE/PRODUCT_REQUEST.md"
cp "$FNE_REPO/evals/cases/development/$FNE_CASE/organization-context.md" "$FNE_WORKSPACE/ORGANIZATION_CONTEXT.md"
cd "$FNE_WORKSPACE"
```

在该目录启动 Codex，只输入：

```text
$front-not-end 完成 PRODUCT_REQUEST.md 中的产品需求。
ORGANIZATION_CONTEXT.md 是当前项目可用的组织上下文。
```

验收命令需要可用的 Docker 兼容运行时。首次运行前显式拉取固定摘要镜像：

```sh
npm run tracer:pull-image
```

Agent 完成后运行：

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" --workspace "$PWD" --case "$FNE_CASE"
```

验收器只复制受限的普通文件快照，并在一次性非 root 容器中执行 Agent 产物：容器
不能访问宿主机或外部网络，挂载只读，资源有上限，超时后由宿主机强制终止并清理；
只有全部控制测试完成并返回匹配凭证才算通过。根据所选 case，它验证稳定分页或有
权限且可安全重试的创建操作，并共同验证请求上下文范围、输入边界、真实经过现有
平台能力、项目详情不回归，以及没有新增依赖。详见
[Harness 安全边界](evals/harness/README.md)。

Docker daemon、固定摘要镜像内容、宿主内核或 Docker Desktop 虚拟机，以及容器
运行时仍属于受信任边界；镜像摘要只防止标签漂移，不代表镜像内容天然安全。
当前 fixture 要求 workspace 使用原生 ESM；CommonJS 不在这两条 Tracer 的验收
边界内。

## 当前边界

当前产品只有一个 Skill 和两条可运行 Tracer。它还不能证明对所有技术栈、
所有 Host 或所有后端场景都有效。只有多个真实产品任务重复暴露同一缺口时，才增加
通用抽象。

仓库已经记录一次 List/Search 的真实 Codex 开发对照：bare Codex 通过了自己的测试，
但没有通过控制侧契约；front-not-end arm 同时通过两者。Mutation/authorization 还记录
了一次通过的 front-not-end 运行，但没有 bare 对照。这些是开发证据，不是统计性评测。

- [产品契约](docs/product-contract.md)
- [架构](docs/architecture.md)
- [当前 Tracer 验证](docs/evaluation.md)
- [实际 Tracer 结果](docs/tracer-result.md)
- [Skill 包](docs/executable-skill-packages.md)
- [English](README.md)

## 许可证

Apache License 2.0，见 [LICENSE](LICENSE)。
