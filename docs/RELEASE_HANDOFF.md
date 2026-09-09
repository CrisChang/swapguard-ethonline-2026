# SwapGuard 发布交接 — 2026-09-09

当前是通过本地发布检查的第一版，**还没有公开仓库或公网部署成功证明，也没有完成最终参赛提交**。只改动独立的 SwapGuard 项目。

## 已完成

- 真实 Uniswap v3 双费率报价、Chainlink 价格参考与只读风险说明。
- Worker 共享实时请求限流、异常时停止查询、样例不受影响。
- CSP 等静态安全响应头；字体本地打包。
- 74 项单元/API 测试、9 项构建版 Worker 浏览器测试全部通过；包含实际主网只读请求。
- 独立真实 Git 历史、AI 使用说明、提交文案与约 3 分钟英文演示脚本。

## 需要完成的两个账号侧步骤

### 1. Cloudflare 重新登录

已有 CLI 登录过期。在自己的终端执行：

```sh
cd /Users/chrischang/Documents/Codex/2026-07-28/kan-y/work/swapguard
npx wrangler login
```

在打开的 Cloudflare 官方页面核对账号和请求权限后自行批准。不要把密码、API Token、授权回调地址或助记词发到聊天里。此步骤只登录，不会发布 Worker。

完成后可以告诉助手“Cloudflare 登录好了”。助手应先运行 `wrangler whoami` 确认，再检查目标 Worker 名称未占用（或确属本项目），并确保 rate-limit namespace 不与已有策略冲突，才部署 `swapguard-ethonline-2026`。不得覆盖旧的 Arc / Keeper / OKX 服务。

### 2. GitHub 创建独立空仓库

登录 **CrisChang**，在 GitHub 的 New repository 页面创建建议名称 **swapguard-ethonline-2026**，选择 Public。若已存在同名仓库，先确认用途，不覆盖它。

不要自动初始化 README、.gitignore 或许可证，这些应从本地真实历史统一提交。创建后把仓库链接发给助手；不要把访问 Token 发来。现有 GitHub 连接可读取账号资料，但没有创建仓库工具。浏览器自动操作目前也没有权限。

助手应复核即将公开的文件、许可证选择和敏感信息，保留全部真实开发提交，通过正常 Git 认证推送。若本地 Git 认证缺失，应由本人完成官方认证，不使用聊天里曾出现的 Token，也不绕过验证。

## 账号步骤完成后的发布顺序

1. 选择项目开源许可证并保留字体/依赖授权说明；检查提交文件与历史。
2. 发布独立 GitHub 仓库并验证匿名访问。
3. 部署独立 Worker；默认只用公共 RPC，付费服务需另外确认。
4. 对真实公网地址运行 `npm run check:deployment -- <实际 HTTPS origin> --live`，并复查桌面/手机浏览器。只有验证后才填入参赛表。
5. 用真实链接更新 `docs/SUBMISSION_DRAFT.md`，再处理赞助商反馈表。
6. 本人审阅代码并录制真人讲解视频；脚本在 `docs/DEMO_SCRIPT.md`。最后检查参赛信息并提交，确认成功状态。

## 待本人确认

- ETHOnline Check-in 是否已完成；不要将报名、押金确认或领取 Hacker Pack 当作 Check-in。
- 人工理解并能解释代码；AI 使用说明必须保留，不能把生成工作表述成人工编写。
- 视频须按当届官方规则录制。当前计划为 2–4 分钟、至少 720p、正常速度真人声音。

以上待办均不代表已完成。账号登录前，仍可在本地演示和准备视频。
