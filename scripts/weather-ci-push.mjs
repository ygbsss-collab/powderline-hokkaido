// CI commit + push for weather-update.yml (no force push, ever).
//   - commits the already-staged data in ONE commit; nothing staged / no diff -> no commit, exit 0, changed=false
//   - push to <remote> <branch>; on rejection: fetch + rebase onto the remote branch and retry (max --attempts)
//   - a rebase conflict aborts the rebase, keeps the remote history untouched and fails (exit 1)
// Usage: node scripts/weather-ci-push.mjs [--remote=origin] [--branch=main] [--attempts=3] [--message=...] [--cwd=DIR]
// Writes $GITHUB_OUTPUT pushed=true|false, sha=<commit>.
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function pushData({cwd, remote = 'origin', branch = 'main', attempts = 3, message, log = () => {}}) {
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const ok = (...args) => { try { git(...args); return true; } catch { return false; } };
  if (ok('diff', '--cached', '--quiet')) { log('no staged changes: no commit'); return {pushed: false, committed: false, sha: null, reason: 'no_changes'}; }
  git('commit', '-m', message || `chore(weather): update forecasts ${new Date().toISOString()}`);
  for (let i = 1; i <= attempts; i++) {
    if (ok('push', remote, `HEAD:${branch}`)) { const sha = git('rev-parse', 'HEAD'); log(`pushed ${sha} (attempt ${i})`); return {pushed: true, committed: true, sha, attempts: i}; }
    log(`push rejected (attempt ${i}); fetching ${remote}/${branch} and rebasing`);
    git('fetch', remote, branch);
    if (!ok('rebase', `${remote}/${branch}`)) {
      ok('rebase', '--abort');
      log('rebase conflict: aborted, remote history untouched');
      return {pushed: false, committed: true, sha: null, reason: 'rebase_conflict'};
    }
  }
  return {pushed: false, committed: true, sha: null, reason: 'push_rejected'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const r = pushData({cwd: path.resolve(arg('cwd', '.')), remote: arg('remote', 'origin'), branch: arg('branch', 'main'),
    attempts: Number(arg('attempts', 3)), message: arg('message'), log: m => console.log(m)});
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pushed=${r.pushed}\nsha=${r.sha ?? ''}\n`);
  console.log(JSON.stringify(r));
  if (r.committed && !r.pushed) process.exitCode = 1;
}
