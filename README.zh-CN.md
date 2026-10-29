# apply-pilot

一个在本地运行的求职 / 实习申请流水线，不绑定任何一种 agent。它能做这些事：
- 扫描岗位，去掉重复；
- 按你自己定的权重打分；
- 把所有申请记在一张 Markdown 表里；
- 提醒哪些该跟进；
- 检查求职信里的套话和编造的经历；
- 在一个实时看板上统一展示。

Claude Code、Codex、DeepSeek 或任何兼容 OpenAI 接口的模型都能驱动它。

[English](README.md)

## 为什么做这个

找实习到后期，手上往往有几百个岗位、几十封邮件、好几个招聘系统。真正难的不是写信，而是：

- 记清楚投过哪些，不重复投，也不漏掉换了标题重新发布的岗位；
- 每次都按同一套标准打分，用你定的权重，而不是看模型当天的状态；
- 在合适的时候、在原来那封邮件里跟进一次；
- 让 AI 写的初稿保持真实、朴素。

这些记账的活交给 apply-pilot，判断留给你和你的 agent。

## 安装

```bash
npm i -g github:YingQiu0871/apply-pilot
npm i -g playwright exceljs   # 可选：领英扫描、导出 Excel
```

需要 Node 20 或以上。

## 快速开始

```bash
export APPLY_PILOT_HOME=~/job-search          # 你的数据目录，不要公开
apply-pilot init --example pharma-m2-europe   # 或 apply-pilot init（通用模板）
# 编辑 profile.json：你的真实经历、评分维度、过滤条件、搜索关键词
apply-pilot ui                                # 打开 http://localhost:4321
```

常用命令：

```bash
apply-pilot add --company "某实验室" --role "M2 实习：脂质纳米颗粒" --url https://...
apply-pilot status 1 Applied --note "用学校邮箱投递，附 CV 和动机信"
apply-pilot followups                         # 列出该跟进的申请
apply-pilot eval prompt jd.txt                # 生成评分提示词，交给 agent 返回 JSON
apply-pilot eval score answer.json --jd jd.txt
DEEPSEEK_API_KEY=... apply-pilot eval run jd.txt --provider deepseek --add
apply-pilot lint letter.txt                   # 检查求职信里的套话和不实说法
```

## 安全原则

- 不会自动发邮件，也不会自动提交申请。agent 必须先把内容给你看，得到你的明确同意后才能发送或提交（见 [AGENTS.md](AGENTS.md)）。
- 求职信里能写成优势的，只有 `profile.json` 里列出的真实经历。`forbiddenClaims` 里的内容只能如实写成"还没做过"。
- 每做完一个动作，都要马上记进申请表，看板会自动刷新。
- 个人数据（CV、申请表、邮件、浏览器登录状态、API key）只放在 `APPLY_PILOT_HOME`，不会进这个包。

## 不同 agent 怎么用

见 [docs/harnesses.md](docs/harnesses.md)，里面写了 Claude Code、Codex、DeepSeek/opencode 和 career-ops 的用法。

## 致谢

apply-pilot 使用的申请表格式与 Santiago Fernández de Valderrama 的 **[career-ops](https://github.com/career-ops-hq/career-ops)**（MIT）相同，两者可以共用同一个数据目录。career-ops 是可选的配套工具：本包不依赖它，也不包含它的代码。详见 [NOTICE.md](NOTICE.md)。

## 许可

MIT © Yuning Gu
