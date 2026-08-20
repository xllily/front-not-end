# front-not-end

让 AI 编程 Agent 主动承担完整的后端工程。

现在，生成后端代码已经很容易。真正交付一个生产服务，还要处理架构、数据系统、中间件、云和平台能力、安全、监控、部署、恢复，以及企业已有的技术标准。前端开发者可以把产品讲清楚，却未必知道哪些后端问题应该进入讨论。

front-not-end 是一个 backend agency activation adapter。它让 AI 编程 Agent 根据产品目标、负载、数据特点、约束和可获得的运行环境，先形成系统画像，再去相关的开发生态里寻找方案，完成选型、实现和验证。用户提供产品目标、业务事实，以及不可逆现实操作的许可。在已经验证的覆盖范围内，后端技术决策由 Agent 承担。

目标是交付一个具备生产形态的结果，而不只是写完 API、跑通 smoke test。后者只能证明一部分事实，无法单独证明系统符合部署环境、选对了数据路径、可以监控和恢复，也无法证明它遵循了企业约束。

## 工作方式

```text
产品目标 + 仓库 + 可获得的运行环境
  -> 系统画像与相关工程面
  -> 生态搜索与现有能力发现
  -> 架构、技术栈、Risk Tier 与技术决策
  -> 实现与复核
  -> 检查与证据
  -> IN_PROGRESS | PASS | FAIL | BLOCKED
```

## 首个版本

首个版本只评测 Codex、TypeScript、NestJS 和 PostgreSQL 这一条路径。这是评测边界，不是推荐技术栈。跨技术栈选型要等后续版本覆盖后才能声称已经验证。

front-not-end 使用现有的 AI Coding Host，不替代它，也不增加另一套 Agent Runtime。它使用 Host 已有的模型、工具和仓库访问能力。

v0.1 的评测结果只适用于 Codex。Claude Code 等其他 Host 需要单独验证。

front-not-end 没有固定的技术菜单。零到一项目里，编程语言、框架、数据架构、运行方式，以及使用托管服务还是自行运维，都可以是技术决策。已有项目则要把当前技术栈和运维体系当作强约束，只有收益足以覆盖迁移和长期维护成本时才切换。如果更合适的方案超出已验证范围，就明确报告边界，不把参考技术栈硬套到项目上。

只有当前任务的检查实际通过，才能报告 PASS。Prompt、旧测试结果和模型自述都不算证据。

## 文档

- [产品契约](docs/product-contract.md)
- [架构](docs/architecture.md)
- [保证等级与完成语义](docs/assurance-and-completion.md)
- [可执行 Skill 包](docs/executable-skill-packages.md)
- [评测协议](docs/evaluation.md)
- [评测工作区](evals/README.md)
- [English](README.md)

## 许可证

Apache License 2.0，见 [LICENSE](LICENSE)。
