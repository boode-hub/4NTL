/**
 * What normal looks like for core Windows processes: the expected parent, path,
 * number of instances and account. These are the classic "hunt evil" checks
 * (a fake lsass.exe started by something other than wininit.exe, or running
 * from anywhere but System32). 4NTL's own data, stable across Windows 10 and 11.
 */

export interface BaselineEntry {
  /** Who normally starts it. "(exits)" means that parent exits, so it usually shows none. */
  readonly parent: string;
  readonly path: string;
  readonly instances: string;
  readonly user: string;
  readonly about: string;
}

const SYS32 = 'C:\\Windows\\System32';

export const WINDOWS_BASELINE: Readonly<Record<string, BaselineEntry>> = {
  'smss.exe': {
    parent: 'System (PID 4)',
    path: SYS32,
    instances: 'One master; a copy per session that exits',
    user: 'SYSTEM',
    about: 'Session Manager: the first user-mode process, starts each session.',
  },
  'csrss.exe': {
    parent: 'smss.exe (exits)',
    path: SYS32,
    instances: 'One per session (two or more)',
    user: 'SYSTEM',
    about: 'Client/Server Runtime: manages the Win32 subsystem for a session.',
  },
  'wininit.exe': {
    parent: 'smss.exe (exits)',
    path: SYS32,
    instances: 'One',
    user: 'SYSTEM',
    about: 'Windows Start-Up: starts services.exe, lsass.exe and lsaiso.exe in session 0.',
  },
  'winlogon.exe': {
    parent: 'smss.exe (exits)',
    path: SYS32,
    instances: 'One per interactive session',
    user: 'SYSTEM',
    about: 'Handles interactive logon and logoff; starts LogonUI and userinit.',
  },
  'services.exe': {
    parent: 'wininit.exe',
    path: SYS32,
    instances: 'One',
    user: 'SYSTEM',
    about: 'Service Control Manager: starts and stops services.',
  },
  'lsass.exe': {
    parent: 'wininit.exe',
    path: SYS32,
    instances: 'One',
    user: 'SYSTEM',
    about:
      'Local Security Authority: authentication, tokens, password changes. A credential-theft target.',
  },
  'lsaiso.exe': {
    parent: 'wininit.exe',
    path: SYS32,
    instances: 'None, or one with Credential Guard',
    user: 'SYSTEM',
    about: 'Credential Guard’s isolated LSA, inside virtualization-based security.',
  },
  'svchost.exe': {
    parent: 'services.exe',
    path: `${SYS32} (SysWOW64 for 32-bit)`,
    instances: 'Many',
    user: 'SYSTEM, LOCAL SERVICE, NETWORK SERVICE or the user',
    about: 'Hosts Windows services; its command line names a service group with -k.',
  },
  'userinit.exe': {
    parent: 'winlogon.exe',
    path: SYS32,
    instances: 'Exits after starting explorer.exe',
    user: 'The logged-on user',
    about: 'Runs logon scripts and starts the shell, then exits.',
  },
  'explorer.exe': {
    parent: 'userinit.exe (exits)',
    path: 'C:\\Windows',
    instances: 'One per logged-on user',
    user: 'The logged-on user',
    about: 'The Windows shell: desktop, taskbar and File Explorer.',
  },
  'logonui.exe': {
    parent: 'winlogon.exe',
    path: SYS32,
    instances: 'While the logon or lock screen shows',
    user: 'SYSTEM',
    about: 'Draws the logon and lock screens.',
  },
  'dwm.exe': {
    parent: 'winlogon.exe',
    path: SYS32,
    instances: 'One per interactive session',
    user: 'DWM-<session>',
    about: 'Desktop Window Manager: composes what is on screen.',
  },
  'fontdrvhost.exe': {
    parent: 'wininit.exe or winlogon.exe',
    path: SYS32,
    instances: 'One per session',
    user: 'UMFD-<session>',
    about: 'User-mode font driver host.',
  },
  'spoolsv.exe': {
    parent: 'services.exe',
    path: SYS32,
    instances: 'One',
    user: 'SYSTEM',
    about: 'Print Spooler service.',
  },
  'taskhostw.exe': {
    parent: 'svchost.exe',
    path: SYS32,
    instances: 'One or more',
    user: 'The user or SYSTEM',
    about: 'Hosts scheduled tasks that run as DLLs.',
  },
  'runtimebroker.exe': {
    parent: 'svchost.exe',
    path: SYS32,
    instances: 'Several',
    user: 'The logged-on user',
    about: 'Checks the permissions of Microsoft Store apps.',
  },
  'sihost.exe': {
    parent: 'svchost.exe',
    path: SYS32,
    instances: 'One per user',
    user: 'The logged-on user',
    about: 'Shell Infrastructure Host.',
  },
  'dllhost.exe': {
    parent: 'svchost.exe',
    path: `${SYS32} (SysWOW64 for 32-bit)`,
    instances: 'Several',
    user: 'Varies',
    about: 'COM Surrogate: runs COM objects outside the calling process.',
  },
  'wmiprvse.exe': {
    parent: 'svchost.exe',
    path: `${SYS32}\\wbem`,
    instances: 'One or more',
    user: 'SYSTEM, LOCAL SERVICE or NETWORK SERVICE',
    about: 'WMI Provider Host. A parent of cmd or powershell here can mean remote WMI execution.',
  },
  'conhost.exe': {
    parent: 'The console program it serves',
    path: SYS32,
    instances: 'One per console window',
    user: 'Same as its parent',
    about: 'Console Window Host for command-line programs.',
  },
  'audiodg.exe': {
    parent: 'svchost.exe',
    path: SYS32,
    instances: 'One',
    user: 'LOCAL SERVICE',
    about: 'Windows Audio Device Graph Isolation.',
  },
  'searchindexer.exe': {
    parent: 'services.exe',
    path: SYS32,
    instances: 'One',
    user: 'SYSTEM',
    about: 'Windows Search indexer service.',
  },
};
