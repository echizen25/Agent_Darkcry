import { spawn } from 'node:child_process';

const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const allowedExecutables = new Set(['node', 'npm', 'npx', 'dotnet', 'python', 'python3', 'mvn', 'gradle']);
const unsafe = /(?:&&|\|\||[|`]|\$\(|\r|\n)|powershell|cmd(?:\.exe)?\s*\/c|curl|wget|shutdown|reg(?:\.exe)?\s/i;
export class TestCommandRegistry {
  validate(command) {
    if (!command?.id || !allowedExecutables.has(command.executable) || !Array.isArray(command.args) || command.args.some(arg => typeof arg !== 'string' || unsafe.test(arg) || ['-e', '--eval', '-c', '-Command'].includes(arg)) || unsafe.test(command.executable)) throw fail('TEST_COMMAND_NOT_ALLOWED', 'Test command is not allowed.');
    if (!Number.isInteger(command.timeoutMs) || command.timeoutMs < 10 || command.timeoutMs > 600000) throw fail('TEST_COMMAND_NOT_ALLOWED', 'Invalid test timeout.'); return command;
  }
  async run(workspace, commandId, { outputLimit = 20000 } = {}) {
    const command = this.validate(workspace.testCommands.find(item => item.id === commandId)); if (!command) throw fail('TEST_COMMAND_NOT_ALLOWED', 'Test command is not registered.');
    const started = Date.now(); return new Promise(resolve => {
      const child = spawn(command.executable, command.args, { cwd: workspace.canonicalRoot, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', timedOut = false;
      const append = chunk => { if (output.length < outputLimit) output += chunk.toString().slice(0, outputLimit - output.length); }; child.stdout.on('data', append); child.stderr.on('data', append);
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, command.timeoutMs);
      child.on('error', error => { clearTimeout(timer); resolve({ status: 'error', code: 'TEST_FAILED', exitCode: null, durationMs: Date.now() - started, timedOut: false, output: error.message, truncated: false }); });
      child.on('close', code => { clearTimeout(timer); resolve({ status: timedOut ? 'error' : code === 0 ? 'success' : 'error', code: timedOut ? 'TEST_TIMEOUT' : code === 0 ? null : 'TEST_FAILED', exitCode: code, durationMs: Date.now() - started, timedOut, output, truncated: output.length >= outputLimit }); });
    });
  }
}
