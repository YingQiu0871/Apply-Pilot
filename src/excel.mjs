// Export the tracker to a fresh .xlsx (exceljs is optional). This writes a new
// file each time; it never edits a workbook you maintain by hand.
import { lastActivity, parseScore } from './tracker.mjs';

export async function exportXlsx(rows, file) {
  let ExcelJS;
  try { ExcelJS = (await import('exceljs')).default; } catch { throw new Error('exceljs is not installed: run `npm i exceljs`'); }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tracker', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '#', key: 'num', width: 6 }, { header: 'Date', key: 'date', width: 11 },
    { header: 'Company', key: 'company', width: 32 }, { header: 'Role', key: 'role', width: 48 },
    { header: 'Score', key: 'score', width: 7 }, { header: 'Status', key: 'status', width: 11 },
    { header: 'Last activity', key: 'last', width: 12 }, { header: 'URL', key: 'url', width: 40 },
    { header: 'Notes', key: 'notes', width: 90 },
  ];
  for (const r of rows) ws.addRow({ ...r, score: parseScore(r.score), last: lastActivity(r) });
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: 'A1', to: 'I1' };
  await wb.xlsx.writeFile(file);
  return file;
}
