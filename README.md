<p align="center"><img src="assets/icon.svg" width="96" alt="Apply-Pilot icon"></p>

# Apply-Pilot

[![ci](https://github.com/YingQiu0871/Apply-Pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/YingQiu0871/Apply-Pilot/actions/workflows/ci.yml)

A local, agent-agnostic pipeline for job and internship applications. It scans postings, removes duplicates, scores them against your own rubric, tracks every application in one Markdown table, tells you what is due a follow-up, checks letters for stock phrases and invented claims, and shows it all on a live dashboard. Claude Code, Codex, DeepSeek or any OpenAI-compatible model can drive it.

一个在本地运行的求职 / 实习申请流水线，不绑定任何一种 agent。它负责扫描岗位、去重、按你自己的权重打分、把所有申请记在一张 Markdown 表里、提醒哪些该跟进、检查求职信里的套话和编造的经历，并在实时看板上统一展示。Claude Code、Codex、DeepSeek 或任何兼容 OpenAI 接口的模型都能驱动它。

> **For AI agents / 给 AI agent：** follow [INSTALL_FOR_AI.md](INSTALL_FOR_AI.md) to install and set it up, and [AGENTS.md](AGENTS.md) for the rules. 安装步骤见 [INSTALL_FOR_AI.md](INSTALL_FOR_AI.md)，行为规则见 [AGENTS.md](AGENTS.md)。

The command, the npm package and file names are lowercase `apply-pilot`. Apply-Pilot is the project name.

命令、npm 包名和文件名都是小写的 `apply-pilot`，Apply-Pilot 是项目名。

## Why · 为什么做这个

A serious search quickly reaches hundreds of postings, dozens of emails and several application portals. The hard parts are not writing letters. They are:

- knowing what you already applied to, so you don't apply twice or miss a reposted offer;
- scoring postings the same way every time, with your weights rather than a model's mood;
- following up once, at the right time, in the right thread;
- keeping letters honest and plain when an assistant writes the first draft.

Apply-Pilot does that bookkeeping. You and your agent do the judgement.

找实习到后期，手上往往有几百个岗位、几十封邮件、好几个招聘系统。真正难的不是写信，而是：

- 记清楚投过哪些，不重复投，也不漏掉换了标题重新发布的岗位；
- 每次都按同一套标准打分，用你定的权重，而不是看模型当天的状态；
- 在合适的时候、在原来那封邮件里跟进一次；
- 让 AI 写的初稿保持真实、朴素。

这些记账的活交给 Apply-Pilot，判断留给你和你的 agent。

## Install · 安装

### Windows installer · Windows 安装包

Download `Apply-Pilot-VERSION-x64-zh-CN.msi` (中文界面) or `...-en-US.msi` from the [Releases](https://github.com/YingQiu0871/Apply-Pilot/releases) page and double-click it. It needs no administrator rights and no separate Node.js: the runtime is included. It adds Start-menu and desktop icons and the `apply-pilot` command. On first launch the panel asks where to keep your data: create a new folder, or pick one you already use. Uninstalling from Settings → Apps keeps your data folder.

从 [Releases](https://github.com/YingQiu0871/Apply-Pilot/releases) 页面下载 `Apply-Pilot-版本号-x64-zh-CN.msi`（中文界面）或 `en-US` 版，双击安装即可。不需要管理员权限，也不需要另装 Node.js（已内置）。安装后会添加开始菜单和桌面图标以及 `apply-pilot` 命令。第一次打开时，面板会让你选择数据目录：新建一个，或者选择已有的目录。在"设置 → 应用"中卸载时会保留数据目录。

The installer includes Node.js, JSZip and ExcelJS. LinkedIn scanning needs Playwright and is only available in the source install below. 安装包内置 Node.js、JSZip 和 ExcelJS；领英扫描需要 Playwright，只能用下面的源码安装方式。

### From source (Windows, macOS, Linux) · 源码安装

```bash
git clone https://github.com/YingQiu0871/Apply-Pilot.git
cd Apply-Pilot
npm install
npm link                          # puts `apply-pilot` on your PATH / 之后可以直接用 apply-pilot 命令
npm install playwright exceljs    # optional: LinkedIn scan, Excel export / 可选：领英扫描、导出 Excel
```

Node 20 or later on Windows, macOS or Linux. Recent npm versions refuse `npm i github:...` by default, so cloning is the reliable route.

需要 Node 20 或以上，Windows、macOS、Linux 均可。新版 npm 默认禁止 `npm i github:...`，所以请用 clone 安装。

## Quick start · 快速开始

```bash
export APPLY_PILOT_HOME=~/job-search            # your data folder, keep it private / 你的数据目录，不要公开
apply-pilot init --example pharma-m2-europe     # or / 或：apply-pilot init
# edit ~/job-search/profile.json: facts, rubric, filters, search queries
# 编辑 profile.json：真实经历、评分维度、过滤条件、搜索关键词
apply-pilot ui --open                           # dashboard + control panel / 看板和控制面板 http://localhost:4321
apply-pilot shortcut                            # optional desktop icon / 可选：桌面双击图标
```

On Windows PowerShell, set the folder with `$env:APPLY_PILOT_HOME = "$HOME\job-search"`.

Windows PowerShell 中用 `$env:APPLY_PILOT_HOME = "$HOME\job-search"` 设置数据目录。

### Data folder · 数据目录

Apply-Pilot looks for your data folder in this order:

1. the `APPLY_PILOT_HOME` environment variable;
2. the folder you chose in the panel (Tools → Data folder) or with `apply-pilot home PATH`, saved in a small settings file: `%APPDATA%\Apply-Pilot\settings.json` on Windows, `~/Library/Application Support/Apply-Pilot/settings.json` on macOS, `~/.config/apply-pilot/settings.json` on Linux;
3. `./apply-data` in the current directory.

If the folder holds no data yet, the panel opens a first-run screen to create one or point to an existing one.

数据目录按以下顺序查找：

1. 环境变量 `APPLY_PILOT_HOME`；
2. 在面板（工具 → 数据目录）或用 `apply-pilot home 路径` 选定的目录，保存在一个小的设置文件里：Windows 是 `%APPDATA%\Apply-Pilot\settings.json`，macOS 是 `~/Library/Application Support/Apply-Pilot/settings.json`，Linux 是 `~/.config/apply-pilot/settings.json`；
3. 当前目录下的 `./apply-data`。

如果目录里还没有数据，面板会显示首次设置界面，让你新建或选择已有目录。

```bash
apply-pilot home                                 # show the folder and where it came from / 查看当前数据目录及来源
apply-pilot home ~/job-search --init             # save it as the default, create it if empty / 设为默认，空目录则新建
```

The control panel runs today's work, scans, the follow-up check, the setup check, imports and the Excel export, with live output. Nothing in it sends email or submits applications. It listens on 127.0.0.1 and accepts requests only with a per-run token from its own page.

控制面板可以一键运行今日工作、扫描、待跟进检查、自检、导入和 Excel 导出，并实时显示输出。它不会发邮件，也不会提交申请；只监听本机，并且只接受带有本次运行令牌的请求。

### Track and score · 记录与打分

```bash
apply-pilot add --company "Example Lab" --role "M2 internship, lipid nanoparticles" --url https://...
apply-pilot status 1 Applied --note "2026-10-29: submitted with CV + letter"
apply-pilot followups                            # due follow-ups / 该跟进的申请

apply-pilot eval prompt jd.txt > prompt.txt      # your agent answers with JSON / 交给 agent 返回 JSON
apply-pilot eval score answer.json --jd jd.txt
DEEPSEEK_API_KEY=... apply-pilot eval run jd.txt --provider deepseek --add   # or score through an API / 或直接调用模型 API
```

## Commands · 命令一览

| Command / 命令 | What it does | 作用 |
|---|---|---|
| `init`, `doctor` | create and check the data folder | 创建、检查数据目录 |
| `ui`, `shortcut` | live dashboard and control panel; desktop launcher (Windows `.lnk`, macOS `.command`, Linux `.desktop`) | 实时看板和控制面板；桌面双击图标 |
| `agent` | choose and test the AI agent: Claude Code, Codex CLI, DeepSeek, DeepSeek Harness | 选择并测试搭配的 AI 助手 |
| `today`, `review` | scan, evaluate and draft in one run; decide what comes back | 一次完成扫描、评估和起草；审核结果 |
| `import PATH` | read an existing database from a file or folder; preview first, `--write` appends new rows only | 从文件或文件夹读取已有数据；先预览，`--write` 只追加新行 |
| `add`, `status`, `note`, `list` | the tracker `data/applications.md`, with duplicate detection | 申请表，自动查重 |
| `followups` | rows due a follow-up, split by email and portal | 该跟进的申请，按邮件 / 招聘系统分组 |
| `eval prompt / score / run / pipeline` | rubric scoring with hard filters, by your agent or a model API | 按评分表打分，含硬性过滤；agent 或模型 API 均可 |
| `lint` | flags stock phrases, forbidden claims, semicolons, long lists | 检查套话、禁止写的经历、分号、过长的列举 |
| `docx list / build` | fill a Word template paragraph by paragraph, the rest byte-identical | 按段落填 Word 模板，其余部分（照片、样式）不变 |
| `scan portals` | 12 career-site systems: Workday, SuccessFactors, Phenom, Eightfold, SmartRecruiters, Personio, Greenhouse, Lever, Ashby, Teamtailor, Recruitee, Workable | 扫描 12 种企业招聘系统 |
| `scan boards` | JobTech and Euraxess with no key; France Travail, Adzuna, Jooble, Careerjet with free keys | 招聘网站和公共就业接口 |
| `scan websearch` | your multilingual queries through Brave, Mojeek or a self-hosted SearXNG | 多语言搜索语句，走搜索引擎 API |
| `scan all` | all three, deduplicated; `--pipeline` appends to `data/pipeline.md` | 三者合一并去重 |
| `linkedin login / scan`, `triage` | LinkedIn jobs and posts with your own logged-in browser profile | 用你自己登录的浏览器扫描领英 |
| `jd`, `keywords` | fetch a full job description; CV keyword coverage | 抓取完整 JD；检查 CV 关键词覆盖 |
| `merge-additions` | merge batch TSV tracker additions | 合并批量评估产生的新增行 |
| `export xlsx` | tracker to a fresh spreadsheet | 导出 Excel |
| `careerops` | optional: run a [career-ops](https://github.com/career-ops-hq/career-ops) script on the same data | 可选：在同一数据上运行 career-ops 脚本 |

Run `apply-pilot help` for every option. 全部参数见 `apply-pilot help`。

## Bring your existing data · 导入已有数据

```bash
apply-pilot import ~/Documents/job-search              # macOS / Linux: preview a folder / 预览整个文件夹
apply-pilot import "C:\Users\me\Documents\jobs.xlsx"   # Windows: one workbook / 单个 Excel 文件
apply-pilot import ~/Documents/job-search --write      # append rows not tracked yet / 只追加还没有的行
```

Supported: `applications.md`, other Markdown tables, Excel `.xlsx`, CSV/TSV, JSON and SQLite `.db` (Node 22.5+). Column names are recognised in English, French, German and Chinese, and statuses are mapped to the tracker states. Rows that match a tracked posting (same link, or same company and a similar role) are skipped. Source files are never changed. The panel's Tools page has the same import box.

支持 `applications.md`、其他 Markdown 表格、Excel `.xlsx`、CSV/TSV、JSON 和 SQLite `.db`（需要 Node 22.5+）。列名的中英法德常见写法都能识别（如"公司 / 岗位 / 状态 / 投递日期 / 链接 / 备注"），状态会自动换算。已在申请表里的岗位（链接相同，或公司相同且岗位相近）会跳过，原文件不会被修改。控制面板的「工具」页也有同样的导入框。

## Windows and macOS · Windows 与 macOS

Everything runs on Windows 10/11, macOS and Linux with Node 20 or later, and CI tests all three.

Windows 10/11、macOS、Linux 都能用（Node 20 以上），CI 在三个系统上都会测试。

| | Windows | macOS |
|---|---|---|
| Installer / 安装包 | `.msi`, per user, Node.js included / 按用户安装，内置 Node.js | source install / 源码安装 |
| Desktop launcher / 桌面图标 | `Apply-Pilot.lnk`, no console window / 不弹命令行窗口 | `Apply-Pilot.command` |
| Open data folder / 打开数据文件夹 | Explorer / 资源管理器 | Finder |
| Agent "Open in terminal" / 在终端中打开 | new `cmd` window | new Terminal window / 新的"终端"窗口 |
| Paths / 路径 | `C:\Users\me\...` | `~/...` is expanded / 自动展开 |
| SQLite import / SQLite 导入 | Node 22.5+ | Node 22.5+ |

## AI agents · AI 助手

Choose Claude Code, Codex, DeepSeek or DeepSeek Harness once on the panel's AI page and pass the connection test. No prompts are needed after that: the Today page scans, evaluates postings, drafts follow-ups and cover letters for your best matches, and every result waits in a review queue for your decision. A saved letter becomes .txt, .docx and, with Word or LibreOffice, .pdf. The AI runs without tools and only returns text, so Apply-Pilot does all reading and writing. Follow-ups are never sent for you: copy one or open it in your mail app, then log it. From the command line: `apply-pilot agent claude|codex|deepseek|dsh --test`, `apply-pilot today`, `apply-pilot review`.

在控制面板的「AI 助手」页选好 Claude Code、Codex、DeepSeek 或 DeepSeek Harness，并通过连接测试，之后就不用再写提示词：「今日工作」页会扫描岗位、评估匹配度、起草跟进，并为高分岗位起草求职信，所有结果都先进入审核队列，由你决定。保存求职信时会生成 .txt 和 .docx；装有 Word 或 LibreOffice 时还会生成 .pdf。AI 没有任何工具，只返回文字，读写文件都由 Apply-Pilot 完成。跟进邮件不会替你发送：你可以复制或在邮件软件中打开，发完再记录。命令行：`apply-pilot agent claude|codex|deepseek|dsh --test`、`apply-pilot today`、`apply-pilot review`。

- [INSTALL_FOR_AI.md](INSTALL_FOR_AI.md): step-by-step setup for an agent / 给 agent 的分步安装指引
- [AGENTS.md](AGENTS.md): rules for every agent / 所有 agent 必须遵守的规则
- [CLAUDE.md](CLAUDE.md), [`skills/apply-pilot`](skills/apply-pilot/SKILL.md): Claude Code
- [docs/harnesses.md](docs/harnesses.md): Claude Code, Codex, DeepSeek/opencode, career-ops

## Your profile · 个人配置

`profile.json` holds everything personal and is never part of this package. 个人信息全部在 `profile.json` 里，不会进入这个包。

| Key / 字段 | Meaning | 含义 |
|---|---|---|
| `candidate.facts` | the only experience an evaluator may count as a strength | 唯一可以写成优势的真实经历 |
| `scoring.dimensions`, `thresholds` | your rubric, weights in any unit | 评分维度和权重 |
| `filters` | excluded companies and keywords, applied before any score | 排除的公司和关键词，先于打分 |
| `followUp` | when a follow-up becomes due | 何时需要跟进 |
| `writing.bannedPhrases`, `forbiddenClaims` | what letters must not say | 求职信里不能出现的说法 |
| `sources` | career sites, boards, search queries, LinkedIn | 招聘系统、招聘网站、搜索语句、领英 |

See `config/profile.example.json` and `examples/pharma-m2-europe/profile.json`. 参考模板：`config/profile.example.json` 和 `examples/pharma-m2-europe/profile.json`。

## Sources and access · 数据来源原则

Apply-Pilot only uses official APIs, documented public feeds and plain public pages. Sites that block automated access (bot protection, login walls; at the time of writing, sites such as Indeed and Welcome to the Jungle) are not scraped around their protections. Open them in your own browser, or let your agent do it there. Keys live in `APPLY_PILOT_HOME/.env` (template: `config/env.example`), never in `profile.json`.

只用官方接口、公开数据源和普通公开网页。有反爬保护或需要登录的网站（比如目前的 Indeed、Welcome to the Jungle）不绕过保护，交给你自己的浏览器或 agent 在浏览器里查。各平台的 key 放在 `APPLY_PILOT_HOME/.env`（模板见 `config/env.example`），不写进 `profile.json`。

## Privacy and safety · 隐私与安全

Full policy / 完整隐私策略：[PRIVACY.md](PRIVACY.md).

- Nothing in the CLI sends email or submits forms. An agent must show you the draft and get your approval first.
- Letters may only claim experience listed in `profile.json`.
- CVs, trackers, emails, browser sessions and API keys stay in `APPLY_PILOT_HOME`. `apply-pilot init` writes a `.gitignore` there. The package contains no personal data and needs none to run its tests.

- 命令行里没有任何发邮件或提交表单的功能。agent 必须先把内容给你看，得到你的同意才能发送或提交。
- 求职信里只能写 `profile.json` 列出的真实经历。
- CV、申请表、邮件、浏览器登录状态和 API key 都只放在 `APPLY_PILOT_HOME`，`apply-pilot init` 会在那里写好 `.gitignore`。这个包不含任何个人数据，测试也不需要个人数据。

## Acknowledgements · 致谢

Apply-Pilot reads and writes the same tracker format as **[career-ops](https://github.com/career-ops-hq/career-ops)** by Santiago Fernández de Valderrama (MIT). Apply-Pilot runs on its own: career-ops is not required, and no career-ops code is included. The public career-site endpoints used by `scan portals` were first documented by career-ops' provider modules, and Apply-Pilot's implementations are written independently. See [NOTICE.md](NOTICE.md).

Apply-Pilot 使用的申请表格式与 Santiago Fernández de Valderrama 的 **[career-ops](https://github.com/career-ops-hq/career-ops)**（MIT）相同。Apply-Pilot 可以独立运行，不需要 career-ops，也不包含它的代码。`scan portals` 用到的招聘系统公开接口最早由 career-ops 的 provider 模块整理，Apply-Pilot 的实现是独立编写的。详见 [NOTICE.md](NOTICE.md)。

## License · 许可

MIT © Yuning Gu
