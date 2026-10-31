# Privacy Policy · 隐私策略

Last updated / 最后更新：2026-10-31 (0.7.0)

Apply-Pilot is free, open-source software that runs on your own computer. It has no server, no account system, no analytics and no telemetry. The author receives no data from you.

Apply-Pilot 是在你自己电脑上运行的免费开源软件。它没有服务器、没有账号系统，也没有任何统计或遥测功能。作者收不到你的任何数据。

## 1. What is stored, and where · 存储哪些数据、存在哪里

Everything Apply-Pilot reads or writes stays in your data folder (`APPLY_PILOT_HOME`) on your own disk:

- `profile.json`: your experience, scoring rubric, filters and search settings;
- `data/applications.md` and `data/pipeline.md`: your applications and candidate postings;
- `inbox/`, `output/`: scan results, evaluations, drafts and exports;
- `browser/`: the browser session you create with `apply-pilot linkedin login`;
- `.env`: API keys you add yourself or enter on the AI or Job sources page, and the mailbox address and app password, stored as plain text;
- `profile.json` also holds the application answers you enter on the Job sources page (name, contact details, nationality, dates, files, consent);
- `mail.json`: the mail service, server name, how many days to look back, and how far the last check got;
- `agent.json`: which AI agent you chose and when its connection test passed;
- `data/review.json`: AI evaluations, draft follow-ups and cover letters waiting for your decision, and your past decisions;
- `output/letters/`: the cover letters you save;
- `browser/`: the separate browser profile with the sign-ins you made, and the list of those sites. It holds login cookies, is added to `.gitignore`, and should not be synced or shared;
- `cv.md`: the CV text you paste during setup, if the file does not exist yet.

One more small file sits outside the data folder: the per-user settings file (`%APPDATA%\Apply-Pilot\settings.json` on Windows, `~/Library/Application Support/Apply-Pilot/settings.json` on macOS, `~/.config/apply-pilot/settings.json` on Linux). It stores only the path of your data folder.

You can read, edit, move or delete any of these files at any time. `apply-pilot init` writes a `.gitignore` so that browser sessions, scans, exports and `.env` are not committed by accident.

Apply-Pilot 读写的所有数据都放在你自己硬盘上的数据目录（`APPLY_PILOT_HOME`）里：

- `profile.json`：你的经历、评分标准、过滤条件和搜索设置；
- `data/applications.md`、`data/pipeline.md`：申请记录和待筛岗位；
- `inbox/`、`output/`：扫描结果、评估、草稿和导出文件；
- `browser/`：你用 `apply-pilot linkedin login` 登录后保存的浏览器状态；
- `.env`：你自己填写或在 AI 助手页、岗位来源页输入的 API key，以及邮箱地址和应用专用密码，以明文保存；
- `profile.json` 还保存你在岗位来源页填写的申请答案（姓名、联系方式、国籍、日期、文件、同意条款）；
- `mail.json`：邮箱服务、服务器名、首次回看天数，以及上次检查到哪里；
- `agent.json`：你选择搭配的 AI 助手，以及连接测试通过的时间；
- `data/review.json`：等待你确认的 AI 评估、跟进草稿和求职信，以及你做过的决定；
- `output/letters/`：你保存的求职信；
- `browser/`：专用浏览器配置，含你登录过的网站及其列表。里面有登录 Cookie，已加入 `.gitignore`，不要同步或分享；
- `cv.md`：设置时粘贴的 CV 全文（文件不存在时才写入）。

数据目录之外只有一个小文件：用户设置文件（Windows 是 `%APPDATA%\Apply-Pilot\settings.json`，macOS 是 `~/Library/Application Support/Apply-Pilot/settings.json`，Linux 是 `~/.config/apply-pilot/settings.json`），里面只记录数据目录的路径。

这些文件你可以随时查看、修改、移动或删除。`apply-pilot init` 会写好 `.gitignore`，防止浏览器登录状态、扫描结果、导出文件和 `.env` 被误提交。

## 2. When data leaves your computer · 数据什么时候会离开你的电脑

Only when you run a command or click a button that needs the network:

| Action / 操作 | Sent to / 发往 | What is sent / 发送内容 |
|---|---|---|
| `scan portals`, `jd` | the career sites you list in `profile.json` (Workday, Greenhouse, SmartRecruiters…) / 你在 `profile.json` 里列出的企业招聘网站 | search keywords and page requests, as a browser would send / 搜索关键词和普通页面请求 |
| `scan boards` | the sources you turn on: JobTech, Euraxess, DAAD, jobRxiv, PhDFinder, Institut Pasteur, France Travail, Adzuna, Jooble, Careerjet / 你开启的来源 | search keywords, location, and your API key for that service / 搜索关键词、地区和该平台的 key |
| `scan websearch` | Brave Search, Mojeek or your SearXNG / 或你自建的 SearXNG | your search queries and API key / 搜索语句和 key |
| `linkedin scan` | LinkedIn, through your own logged-in browser / 通过你自己登录的浏览器 | the same as browsing LinkedIn yourself / 与你手动浏览领英相同 |
| `eval run`, `eval pipeline` | the model provider you choose: DeepSeek, OpenAI, OpenRouter, Anthropic; Ollama stays local / 你选择的模型服务商；Ollama 在本机运行 | the job description, plus the summary, facts, gaps and rubric from your `profile.json` / 岗位描述，以及 `profile.json` 中的目标概述、经历、短板和评分标准 |
| Form prefill / 申请表预填 | the application site, in a visible window on the sign-in profile; the AI you chose / 申请网站（在专用配置的可见窗口中）；你选择的 AI 服务 | your answers go into the form on that site, for you to check and submit. The AI receives the field labels and options and the names of your answers, never the values / 你的答案被填入该网站的表单，由你检查和提交。AI 只收到字段标签、选项和答案名称，不会收到答案内容 |
| Mailbox check / 邮箱检查 | your mail server over IMAP (read-only), then the AI you chose / 你的邮件服务器（IMAP 只读），然后是你选择的 AI 服务 | your address and app password go to the mail server only. Only a message matched to a tracked application reaches the AI: sender, subject, date and up to 5000 characters of its text, with your profile facts. Unmatched mail is read on this computer and discarded. Mail is never marked read, moved, deleted or sent / 地址和应用专用密码只发给邮件服务器。只有匹配到申请的邮件会发给 AI：发件人、主题、日期和最多 5000 字的正文，以及你的经历。未匹配的邮件只在本机读取后丢弃。邮件不会被标记已读、移动、删除或发送 |
| Reading a site you signed in to / 读取你登录过的网站 | that site, then the AI you chose / 该网站，然后是你选择的 AI 服务 | your sign-in cookies go to that site only; the text of the page, which can include your name and applications, goes to the AI / 登录 Cookie 只发给该网站；页面文字（可能含姓名和申请记录）会发给 AI |
| Reading a posting in the local browser / 用本机浏览器读取岗位 | that posting's website / 该岗位所在网站 | a normal page visit from an empty temporary browser profile, with none of your sign-ins or cookies; the profile is deleted afterwards / 一次普通网页访问，使用空白临时配置，不含你的登录状态和 Cookie，用完即删 |
| Today page, `today`: evaluate, draft follow-ups and letters / 今日工作页、`today`：评估、起草跟进和求职信 | the AI you chose / 你选择的 AI 服务 | each job description, your profile summary, facts, gaps and rubric, and for a follow-up that application's tracker notes / 每个岗位描述，`profile.json` 中的目标概述、经历、短板和评分标准；起草跟进时还有该申请的备注 |
| First-run CV step / 首次设置的 CV 步骤 | the AI you chose / 你选择的 AI 服务 | the full CV text you paste / 你粘贴的 CV 全文 |
| Job sources page: test / 岗位来源页：测试 | that source's official API / 对应来源的官方接口 | your key for that source and one search term / 该来源的 Key 和一个搜索词 |
| AI page: test connection / AI 助手页：测试连接 | the AI you chose / 你选择的 AI 服务 | a short fixed test message / 一条固定的简短测试消息 |
| AI page: open in terminal / AI 助手页：在终端中打开 | that agent's own service / 对应 agent 自己的服务 | whatever the agent reads in your data folder while it works / agent 工作时读取的数据目录内容 |

Each of these services handles the data under its own privacy policy. Read them before you add a key or log in. If you do not want your profile sent to a model provider, score postings with your own agent (`eval prompt` / `eval score`) or a local Ollama model.

这些服务按各自的隐私政策处理数据，填写 key 或登录前请先阅读。如果不希望把个人经历发给模型服务商，可以用 `eval prompt` / `eval score` 交给你自己的 agent 打分，或使用本机运行的 Ollama。

## 3. What Apply-Pilot never does · Apply-Pilot 绝不会做的事

- It never sends email, submits applications, fills forms or messages anyone. Those actions stay with you.
- It never uploads your data to the author or to any service you did not choose.
- It never stores passwords. You sign in to websites yourself, in your own browser.
- It never works around a website's bot protection.

- 不发邮件、不提交申请、不填表单、不给任何人发消息，这些操作始终由你本人完成。
- 不把你的数据上传给作者，也不上传给任何你没有选择的服务。
- 不保存密码。网站登录由你自己在浏览器里完成。
- 不绕过任何网站的反爬保护。

## 4. The control panel · 控制面板

The panel (`apply-pilot ui`) listens only on `127.0.0.1`, so other computers on your network cannot reach it. Each run creates a one-time token, and requests without it are refused. It loads no external scripts, fonts or trackers.

控制面板（`apply-pilot ui`）只监听本机地址 `127.0.0.1`，局域网内其他电脑无法访问。每次启动都会生成一次性令牌，没有令牌的请求一律拒绝。面板不加载任何外部脚本、字体或追踪代码。

## 5. The desktop app · 桌面应用

The app shows the same panel in its own window. It listens on `127.0.0.1` as described above, using port 4321 or a free port if that is taken. The page has no access to your files or to Node.js, and links to other sites open in your normal browser. The window keeps its own small browser data (panel settings such as language and theme, and cache) in the app-data folder of your system. It collects nothing and does not check for updates.

应用在独立窗口中显示同一个面板。它按上文所述只监听 `127.0.0.1`，使用 4321 端口；端口被占用时改用空闲端口。页面无法访问你的文件和 Node.js，指向其他网站的链接会在你平时的浏览器中打开。窗口的少量浏览器数据（语言、主题等面板设置和缓存）保存在系统的应用数据目录中。它不收集任何信息，也不检查更新。

The Windows MSI installs program files into your user profile (`%LOCALAPPDATA%\Programs\Apply-Pilot`) and adds Start-menu and desktop shortcuts. It does not change environment variables other than adding its folder to your `PATH`. It collects nothing and does not check for updates. Uninstalling removes the program files but keeps your data folder and the settings file, so your records are not lost. Delete them yourself if you want everything gone.

Windows 的 MSI 安装包把程序文件装在你的用户目录（`%LOCALAPPDATA%\Programs\Apply-Pilot`），并添加开始菜单和桌面快捷方式。除了把程序目录加入 `PATH`，它不修改任何环境变量。它不收集任何信息，也不检查更新。卸载时会删除程序文件，但保留你的数据目录和设置文件，以免记录丢失。如需彻底清除，请自行删除它们。

## 6. Your data, your responsibility · 你的数据由你掌控

Because all data is local, you decide who can see it. Do not put your data folder in a public repository or a shared drive. Back it up the way you back up other personal files.

因为所有数据都在本地，谁能看到它由你决定。请不要把数据目录放进公开仓库或共享网盘，并像备份其他个人文件一样备份它。

## 7. Changes and contact · 变更与联系

Changes to this policy are recorded in this file's history and in [CHANGELOG.md](CHANGELOG.md). Questions: open an issue at https://github.com/YingQiu0871/Apply-Pilot/issues.

本策略的修改会记录在本文件的历史和 [CHANGELOG.md](CHANGELOG.md) 中。如有问题，请在 https://github.com/YingQiu0871/Apply-Pilot/issues 提交 issue。
