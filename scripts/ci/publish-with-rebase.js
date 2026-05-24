#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

function run(cmd, options = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, ...options });
}

function read(cmd, options = {}) {
  return execSync(cmd, { encoding: 'utf8', shell: true, ...options }).trim();
}

function quote(value) {
  return JSON.stringify(String(value));
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

const mode = env('PUBLISH_MODE');
const repoDir = path.resolve(process.cwd(), env('PUBLISH_REPO_DIR', '.'));
const addPath = env('PUBLISH_ADD_PATH');
const message = env('PUBLISH_COMMIT_MESSAGE');
const remoteBranch = env('PUBLISH_REMOTE_BRANCH', 'main');
const retries = Number(env('PUBLISH_RETRIES', '3'));
const gitUserName = env('GIT_USER_NAME', 'timetable-bot');
const gitUserEmail = env('GIT_USER_EMAIL', 'timetable-bot@users.noreply.github.com');

if (!mode || !['origin', 'study'].includes(mode)) {
  console.error('[publish] PUBLISH_MODE must be origin or study');
  process.exit(1);
}
if (!addPath) {
  console.error('[publish] missing PUBLISH_ADD_PATH');
  process.exit(1);
}
if (!message) {
  console.error('[publish] missing PUBLISH_COMMIT_MESSAGE');
  process.exit(1);
}

// 确定推送目标 remote URL
let pushRemote;
if (mode === 'study') {
  const token = env('STUDY_PUSH_TOKEN');
  const repo = env('STUDY_REPO', 'https://github.com/Health-525/jiangshu-study.git');
  if (!token) {
    console.error('[publish] missing STUDY_PUSH_TOKEN for study mode');
    process.exit(1);
  }
  pushRemote = repo.replace('https://', `https://x-access-token:${token}@`);
} else {
  pushRemote = env('PUBLISH_REMOTE_NAME', 'origin');
}

// 提交
run(`git config user.name ${quote(gitUserName)}`, { cwd: repoDir });
run(`git config user.email ${quote(gitUserEmail)}`, { cwd: repoDir });
try {
  run(`git add ${addPath}`, { cwd: repoDir });
} catch {
  console.log('[publish] git add did not stage anything');
}

const hasChanges = read('git diff --cached --name-only', { cwd: repoDir }).length > 0;
if (!hasChanges) {
  console.log('[publish] no staged changes, skip');
  process.exit(0);
}

run(`git commit -m ${quote(message)}`, { cwd: repoDir });

// 推送（带 retry）
for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    run(`git fetch ${quote(pushRemote)} ${quote(remoteBranch)}`, { cwd: repoDir });
    run('git rebase --autostash FETCH_HEAD', { cwd: repoDir });
    run(`git push ${quote(pushRemote)} HEAD:${remoteBranch}`, { cwd: repoDir });
    console.log(`[publish] pushed ${mode} on attempt ${attempt}`);
    process.exit(0);
  } catch (error) {
    if (attempt === retries) {
      console.error(`[publish] ${mode} push failed after ${retries} attempts`);
      throw error;
    }
    console.log(`[publish] ${mode} push attempt ${attempt} failed, retrying...`);
  }
}
