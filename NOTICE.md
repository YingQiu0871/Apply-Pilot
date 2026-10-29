# Notices

## career-ops

apply-pilot is designed to work alongside **career-ops**:

- Repository: https://github.com/career-ops-hq/career-ops
- Author: Santiago Fernández de Valderrama
- License: MIT

apply-pilot reads and writes the same `data/applications.md` tracker table (columns `# | Date | Company | Role | Score | Status | PDF | Report | Notes | URL`) and uses compatible status names, so the two tools can share one data directory. `apply-pilot careerops <script>` runs a locally installed copy of career-ops; it is not bundled. This package contains no career-ops source code. apply-pilot does not need career-ops to run.

The public career-site endpoints used by `apply-pilot scan portals` (Workday CXS, Phenom widgets, Eightfold apply API, SuccessFactors tile search and CSB API, SmartRecruiters postings API, Personio XML feed) are documented in career-ops' `providers/` modules, which the author consulted; apply-pilot's implementations in `src/scan/portals.mjs` are written independently.

The author of apply-pilot used career-ops for their own search, and its tracker format and idea of a local, agent-driven job search shaped this package.

## Dependencies

- [JSZip](https://github.com/Stuk/jszip): MIT or GPLv3 (used under MIT)
- Optional: [Playwright](https://github.com/microsoft/playwright) (Apache-2.0), [ExcelJS](https://github.com/exceljs/exceljs) (MIT)
