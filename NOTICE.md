# Notices

## career-ops

Apply-Pilot is designed to work alongside **career-ops**:

- Repository: https://github.com/career-ops-hq/career-ops
- Author: Santiago Fernández de Valderrama
- License: MIT

Apply-Pilot reads and writes the same `data/applications.md` tracker table (columns `# | Date | Company | Role | Score | Status | PDF | Report | Notes | URL`) and uses compatible status names, so the two tools can share one data directory. `apply-pilot careerops <script>` runs a locally installed copy of career-ops; it is not bundled. This package contains no career-ops source code. Apply-Pilot does not need career-ops to run.

The public career-site endpoints used by `apply-pilot scan portals` (Workday CXS, Phenom widgets, Eightfold apply API, SuccessFactors tile search and CSB API, SmartRecruiters postings API, Personio XML feed) are documented in career-ops' `providers/` modules, which the author consulted; Apply-Pilot's implementations in `src/scan/portals.mjs` are written independently.

The author of Apply-Pilot used career-ops for their own search, and its tracker format and idea of a local, agent-driven job search shaped this package.

## Dependencies

- [JSZip](https://github.com/Stuk/jszip): MIT or GPLv3 (used under MIT)
- Optional: [Playwright](https://github.com/microsoft/playwright) (Apache-2.0), [ExcelJS](https://github.com/exceljs/exceljs) (MIT)

The Windows installer (MSI) also bundles [Node.js](https://nodejs.org) (MIT; full licence at https://github.com/nodejs/node/blob/main/LICENSE), JSZip, ExcelJS and their dependencies, each under its own licence in `app\node_modules`. The installer is built with the [WiX Toolset](https://wixtoolset.org) (MS-RL); no WiX code is shipped in it.
