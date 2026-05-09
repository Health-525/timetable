#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd, options = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, ...options });
}

function quote(value) {
  return JSON.stringify(String(value));
}

const token = process.env.STUDY_PUSH_TOKEN;
const repo = process.env.STUDY_REPO || 'https://github.com/Health-525/jiangshu-study.git';
const studyDir = process.env.STUDY_DIR || '_study';
const gitUserName = process.env.GIT_USER_NAME || 'timetable-bot';
const gitUserEmail = process.env.GIT_USER_EMAIL || 'timetable-bot@users.noreply.github.com';

if (!token) {
  console.error('[clone-study] missing STUDY_PUSH_TOKEN');
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), studyDir);
const authedRepo = repo.replace('https://', `https://x-access-token:${token}@`);

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

run(`git clone ${quote(authedRepo)} ${quote(targetDir)}`);
run(`git config user.name ${quote(gitUserName)}`, { cwd: targetDir });
run(`git config user.email ${quote(gitUserEmail)}`, { cwd: targetDir });

console.log(`[clone-study] ready: ${targetDir}`);
