const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let lastPlayedAt = 0;
/** @type {vscode.OutputChannel | undefined} */
let outputChannel;

/**
 * Lazily create and return an output channel for diagnostics.
 */
function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Faaalty');
  }
  return outputChannel;
}

/**
 * Resolve which audio file to play.
 * Priority: bundled assets/faaa.mp3 > system fallback (null).
 */
function resolveAudioFile(extensionPath) {
  const bundled = path.join(extensionPath, 'assets', 'faaa.mp3');
  return fs.existsSync(bundled) ? bundled : null;
}

/**
 * Build a platform-appropriate shell command to play the given file (or a system sound).
 */
function buildPlayCommand(filePath) {
  if (filePath) {
    const safe = filePath.replace(/"/g, '\\"');
    switch (process.platform) {
      case 'darwin':  return `afplay "${safe}"`;
      case 'win32':   return `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()"`;
      default:        return `paplay "${safe}" 2>/dev/null || aplay "${safe}" 2>/dev/null`;
    }
  }
  // No file available – use a built-in system sound.
  switch (process.platform) {
    case 'darwin':  return 'afplay /System/Library/Sounds/Glass.aiff';
    case 'win32':   return 'powershell -NoProfile -Command "[console]::beep(900,200)"';
    default:        return 'paplay /usr/share/sounds/freedesktop/stereo/dialog-error.oga 2>/dev/null || aplay /usr/share/sounds/alsa/Front_Center.wav 2>/dev/null';
  }
}

/**
 * Play the error sound, respecting the cooldown window.
 */
function playSound(extensionPath) {
  const config = vscode.workspace.getConfiguration('faaalty');
  const cooldown = config.get('cooldownMs', 2000);
  const now = Date.now();
  if (now - lastPlayedAt < cooldown) return;
  lastPlayedAt = now;

  const cmd = buildPlayCommand(resolveAudioFile(extensionPath));
  exec(cmd, { windowsHide: true }, (err, _stdout, stderr) => {
    if (err) {
      getOutputChannel().appendLine(`[faaalty] playback failed: ${err.message}`);
    } else if (stderr) {
      getOutputChannel().appendLine(`[faaalty] playback stderr: ${stderr}`);
    }
  });
}

// ── Extension lifecycle ─────────────────────────────────────────────

function activate(context) {
  const { extensionPath } = context;

  // Listen for failed terminal commands (requires shell integration).
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((e) => {
      const config = vscode.workspace.getConfiguration('faaalty');
      if (!config.get('enabled', true)) return;
      if (typeof e.exitCode === 'number' && e.exitCode !== 0) {
        playSound(extensionPath);
      }
    })
  );

  // Manual test command.
  context.subscriptions.push(
    vscode.commands.registerCommand('faaalty.testSound', () => {
      playSound(extensionPath);
    })
  );
}

function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = undefined;
  }
}

module.exports = { activate, deactivate };
