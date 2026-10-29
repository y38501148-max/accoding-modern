# 核查功能维护

继承工作区根目录 AGENTS.md。修改 AI 核查、查重、名单筛选、人工结论协议或规则展示前，完整通读相邻后端项目的：

- `/Users/muzermat/Desktop/buaa/oj-review/docs/rules/README.md`
- `/Users/muzermat/Desktop/buaa/oj-review/docs/rules/current.md`
- `/Users/muzermat/Desktop/buaa/oj-review/docs/rules/maintenance.md`
- `/Users/muzermat/Desktop/buaa/oj-review/docs/rules/changes.md`

按 `catalog.json` 核对受影响的后端判据和回归测试。规则的唯一现行定义在后端 `current.md`；本项目 `docs/ai-review.md` 负责用户界面和协议说明，不另设一套判据。每次相关更新同步规则文档、变更记录和前端说明，运行后端文档校验及本项目 `npm run check`。保留原有过滤、三态、源码身份验证、写入权限、冲突检查与修订历史，除非用户明确要求改变。
