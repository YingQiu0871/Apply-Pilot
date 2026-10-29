// Desktop launcher for the control panel: double-click starts the server
// without a console window and opens the panel in the default browser. If
// the panel is already running, it just opens the browser.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function desktopDir() {
  if (process.platform === 'win32') {
    // Handles Desktop folders redirected to OneDrive.
    return execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
  }
  return join(homedir(), 'Desktop');
}

const vbsString = (s) => `"${String(s).replace(/"/g, '""')}"`;

export function createShortcut({ home, cli, port = 4321, dir }) {
  const target = dir || desktopDir();
  mkdirSync(target, { recursive: true });
  const node = process.execPath;

  if (process.platform === 'win32') {
    // A small VBScript runs node hidden (window style 0); the .lnk points at it.
    const vbs = join(home, 'apply-pilot-panel.vbs');
    mkdirSync(home, { recursive: true });
    writeFileSync(vbs, [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.Environment("Process")("APPLY_PILOT_HOME") = ${vbsString(home)}`,
      `sh.Run ${vbsString(`"${node}" "${cli}" ui --open --port ${port}`)}, 0, False`,
      '',
    ].join('\r\n'));
    const lnk = join(target, 'Apply-Pilot.lnk');
    const ps = [
      '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:AP_LNK)',
      "$s.TargetPath = \"$env:WINDIR\\System32\\wscript.exe\"",
      '$s.Arguments = \'"\' + $env:AP_VBS + \'"\'',
      '$s.WorkingDirectory = $env:AP_HOME',
      "$s.IconLocation = \"$env:WINDIR\\System32\\imageres.dll,109\"",
      "$s.Description = 'Apply-Pilot control panel'",
      '$s.Save()',
    ].join('; ');
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, AP_LNK: lnk, AP_VBS: vbs, AP_HOME: home } });
    return lnk;
  }

  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  if (process.platform === 'darwin') {
    const file = join(target, 'Apply-Pilot.command');
    writeFileSync(file, `#!/bin/sh\nexport APPLY_PILOT_HOME=${q(home)}\nnohup ${q(node)} ${q(cli)} ui --open --port ${port} >/dev/null 2>&1 &\n`);
    chmodSync(file, 0o755);
    return file;
  }
  const file = join(target, 'Apply-Pilot.desktop');
  writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Apply-Pilot\nComment=Apply-Pilot control panel\nExec=env APPLY_PILOT_HOME=${home} ${node} ${cli} ui --open --port ${port}\nTerminal=false\n`);
  chmodSync(file, 0o755);
  return file;
}
