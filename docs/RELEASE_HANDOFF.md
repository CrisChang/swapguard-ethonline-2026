# SwapGuard 发布交接 — 2026-09-09

**独立公开仓库和第一版公网 Demo 均已发布并验证。之前的登录、创建空仓库步骤不必重复。ETHGlobal 最终提交仍未完成。**

## 可直接用于参赛表的链接

- Demo：https://swapguard-ethonline-2026.swapguard.workers.dev
- GitHub：https://github.com/CrisChang/swapguard-ethonline-2026
- 赞助商反馈文档：https://github.com/CrisChang/swapguard-ethonline-2026/blob/main/FEEDBACK.md
- 完整提交文案：[SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md)
- 英文真人演示脚本：[DEMO_SCRIPT.md](DEMO_SCRIPT.md)

## 已验证

- 新建仓库公开可匿名访问，MIT 许可证，保留真实连续 Git 历史。
- 新建 Cloudflare Worker，未覆盖其他项目。真实 Uniswap 双费率报价和 Chainlink 参考正常返回。
- 74 项单元/API 测试通过；GitHub 自动测试通过；公网 9 项浏览器测试通过。
- 页面 CSP 等安全响应头、样例标记、真实查询、手机布局、过期提示与 JSON 导出均已检查。
- 无钱包连接、签名、审批或链上交易。

本机直连 workers.dev 曾出现解析/网络错误；通过电脑现有代理完成了公网检查，未修改系统设置，也未关闭 TLS 校验。国内或受限网络可能同样需要已有代理，不能承诺所有网络都直连可用。

完整验证与依赖审计记录见 [VALIDATION.md](VALIDATION.md)。生产依赖审计 0 个已知漏洞；开发工具链仍有 5 项审计告警，详见该记录，不应误称整个依赖树已无风险。

## 尚需完成的参赛步骤

1. 本人审阅并能解释代码和实际能力；保留 [AI 使用说明](AI_USAGE.md)，不要把生成工作描述为人工编写。
2. 完成 Uniswap 外部反馈表；仓库内 FEEDBACK.md 不是已提交证明。
3. 按当届官方要求录制正常速度的真人讲解视频，当前计划为 2–4 分钟、至少 720p。准备字幕和画面不等于已经录音。
4. 把已验证链接、文案和视频填入 ETHGlobal，选择确实符合要求的奖项，再最终 Submit 并确认成功。此步骤尚未代办。
5. 核实本人 Check-in 状态；报名、押金确认和领取 Hacker Pack 不等于 Check-in。

不要声称已完成主网交换、审计、融资、付费用户、反馈表或比赛最终提交。第一版仍是只读辅助检查，不是交易安全保证。
