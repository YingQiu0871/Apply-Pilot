# apply-pilot

[![ci](https://github.com/YingQiu0871/apply-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/YingQiu0871/apply-pilot/actions/workflows/ci.yml)

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
git clone https://github.com/YingQiu0871/apply-pilot.git
cd apply-pilot && npm install && npm link   # 之后可以直接用 apply-pilot 命令
npm install playwright exceljs                # 可选：领英扫描、导出 Excel
```

新版 npm 默认禁止 `npm i github:...` 这种安装方式，所以建议用 clone 安装。

需要 Node 20 或以上。

## 快速开始

```bash
export APPLY_PILOT_HOME=~/job-search          # 你的数据目录，不要公开
apply-pilot init --example pharma-m2-europe   # 或 apply-pilot init（通用模板）
# 编辑 profile.json：你的真实经历、评分维度、过滤条件、搜索关键词
apply-pilot ui --open                         # 打开看板和控制面板 http://localhost:4321
apply-pilot shortcut                          # 可选：在桌面生成图标，双击即可打开控制面板
```

控制面板上可以一键运行：扫描企业招聘系统、扫描领英、查看待跟进、自检、导出 Excel，并实时显示输出。面板只跑这些本地任务，不会发邮件，也不会提交申请；它只监听本机，必须带上页面自己的一次性令牌才接受请求。

常用命令：

```bash
apply-pilot add --company "某实验室" --role "M2 实习：脂质纳米颗粒" --url https://...
apply-pilot status 1 Applied --note "用学校邮箱投递，附 CV 和动机信"
apply-pilot followups                         # 列出该跟进的申请
apply-pilot eval prompt jd.txt                # 生成评分提示词，交给 agent 返回 JSON
apply-pilot eval score answer.json --jd jd.txt
DEEPSEEK_API_KEY=... apply-pilot eval run jd.txt --provider deepseek --add
apply-pilot lint letter.txt                   # 检查求职信里的套话和不实说法
apply-pilot scan all --pipeline               # 一键扫描：企业招聘系统（12 种）+ 招聘网站/公共就业接口 + 搜索引擎
apply-pilot scan boards                       # JobTech、Euraxess（免 key），France Travail、Adzuna、Jooble、Careerjet（免费 key，写在 .env）
apply-pilot scan websearch                    # 多语言搜索语句，走 Brave / Mojeek / 自建 SearXNG
apply-pilot jd URL --out jd.txt               # 抓取完整 JD
apply-pilot keywords report.md --cv cv.md     # 检查 CV 覆盖了 JD 的哪些关键词
```

## AI 助手

控制面板的「AI 助手」页可以选择搭配 Claude Code、Codex 或 DeepSeek：一键在终端中打开它（工作目录就是你的数据目录），或让它代跑「评估新岗位」「起草跟进邮件」两项任务。这些任务只把结果写到 `output/`，不会发送或提交任何东西。命令行：`apply-pilot agent claude|codex|deepseek`。

## 导入已有数据

```bash
apply-pilot import ~/Documents/求职                    # macOS：预览这个文件夹里能识别的所有数据
apply-pilot import "C:\Users\我\Documents\申请表.xlsx"   # Windows：单个 Excel 文件
apply-pilot import ~/Documents/求职 --write            # 确认后，只追加申请表里还没有的行
```

支持 applications.md、Markdown 表格、Excel（.xlsx）、CSV/TSV、JSON 和 SQLite（.db，需要 Node 22.5+）。列名中英法德常见写法都能识别（比如"公司 / 岗位 / 状态 / 投递日期 / 链接 / 备注"），状态自动换算。已经在申请表里的岗位会跳过，原文件不会被修改。控制面板的「工具」页也有同样的导入框。

## Windows 和 macOS

Windows 10/11、macOS、Linux 都能用（Node 20 以上），GitHub 上的自动测试三个系统都会跑。桌面图标在 Windows 上是不弹命令行窗口的 `apply-pilot.lnk`，在 macOS 上是桌面上的 `apply-pilot.command`；"打开数据文件夹"分别用资源管理器和 Finder；AI 助手的"在终端中打开"分别打开 cmd 和"终端"。

## 数据来源原则

只用官方接口、公开的数据源和普通公开网页。有反爬保护或要登录的网站（比如目前的 Indeed、Welcome to the Jungle）不绕过它们的保护，交给你自己的浏览器或 agent 在浏览器里查。各平台的 key 放在 `APPLY_PILOT_HOME/.env`（模板见 `config/env.example`），不写进 `profile.json`。

## 安全原则

- 不会自动发邮件，也不会自动提交申请。agent 必须先把内容给你看，得到你的明确同意后才能发送或提交（见 [AGENTS.md](AGENTS.md)）。
- 求职信里能写成优势的，只有 `profile.json` 里列出的真实经历。`forbiddenClaims` 里的内容只能如实写成"还没做过"。
- 每做完一个动作，都要马上记进申请表，看板会自动刷新。
- 个人数据（CV、申请表、邮件、浏览器登录状态、API key）只放在 `APPLY_PILOT_HOME`，不会进这个包。

## 不同 agent 怎么用

见 [docs/harnesses.md](docs/harnesses.md)，里面写了 Claude Code、Codex、DeepSeek/opencode 和 career-ops 的用法。

## 致谢

apply-pilot 使用的申请表格式与 Santiago Fernández de Valderrama 的 **[career-ops](https://github.com/career-ops-hq/career-ops)**（MIT）相同，两者可以共用同一个数据目录。apply-pilot 可以独立运行，不需要安装 career-ops，也不包含它的代码。`scan portals` 用到的招聘系统公开接口最早由 career-ops 的 provider 模块整理，apply-pilot 的实现是独立编写的。详见 [NOTICE.md](NOTICE.md)。

## 许可

MIT © Yuning Gu
