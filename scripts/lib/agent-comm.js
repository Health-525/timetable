#!/usr/bin/env node
/**
 * Agent 通信库 · MyDigitalCrew A2A
 *
 * 这是一个轻量状态/通知层：必要链路可通过文件系统共享状态与消息，
 * 独立 Agent 也可以只使用 preflight/postflight 上报运行状态。
 * 不依赖长连接服务器，适配 GitHub Actions 无状态运行环境。
 *
 * 用法：
 *   const comm = require('../lib/agent-comm');
 *   const ctx = comm.preflight('knowledge-analyzer', { timetableDir: '.' });
 *   // ... agent logic ...
 *   comm.postflight('knowledge-analyzer', { success: true, summary: {...} }, { timetableDir: '.' });
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 内部工具
// ═══════════════════════════════════════════════════════════════

function hasConflictMarkers(text) {
  return /^(<{7}|={7}|>{7})/m.test(text);
}

function readJsonSafe(filePath, opts = {}) {
  const validate = typeof opts.validate === 'function' ? opts.validate : null;

  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: 'missing' };
  }

  let text = '';
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ok: false, reason: 'read_error', error: e.message };
  }

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  if (!text.trim()) {
    return { ok: false, reason: 'empty' };
  }

  if (hasConflictMarkers(text)) {
    return { ok: false, reason: 'conflict_markers' };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'parse_error', error: e.message };
  }

  if (validate) {
    const validation = validate(value);
    if (validation !== true) {
      return {
        ok: false,
        reason: 'invalid_shape',
        error: typeof validation === 'string' ? validation : undefined,
      };
    }
  }

  return { ok: true, value, text };
}

function writeJsonAtomic(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function loadJSON(filePath) {
  const result = readJsonSafe(filePath);
  return result.ok ? result.value : null;
}

function saveJSON(filePath, obj) {
  writeJsonAtomic(filePath, obj);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════
// preflight — Agent 启动时调用，读取上下文
// ═══════════════════════════════════════════════════════════════

function preflight(agentId, opts = {}) {
  const timetableDir = opts.timetableDir || process.cwd();
  const stateDir = path.join(timetableDir, '_state');
  const registryPath = path.join(stateDir, 'agents.json');
  const msgDir = path.join(stateDir, 'messages');

  const registry = loadJSON(registryPath);
  const myself = registry ? (registry.agents || []).find(a => a.id === agentId) : null;

  if (!myself) {
    console.log(`[comm] ⚠️ 未在 agents.json 中找到 ${agentId}，跳过通信`);
    return { agentId, dependencies: {}, messages: [] };
  }

  console.log(`[comm] ${myself.name} 启动`);

  // 1. 检查前置依赖的状态
  const depStates = {};
  for (const depId of (myself.dependsOn || [])) {
    const depFile = path.join(stateDir, 'agents', `${depId}.json`);
    const st = loadJSON(depFile);
    if (st) {
      const ago = ((Date.now() - new Date(st.lastRun).getTime()) / 3600000).toFixed(1);
      console.log(`[comm]   前置 ${depId}: ${st.status} (${ago}h 前)`);
      if (st.status === 'failed') {
        console.log(`[comm]   ⚠️ ${depId} 上次失败，需注意`);
      }
      depStates[depId] = st;
    } else {
      console.log(`[comm]   前置 ${depId}: 尚未运行过`);
      depStates[depId] = { status: 'never_run' };
    }
  }

  // 2. 消费发给自己的消息
  const myMessages = [];
  if (fs.existsSync(msgDir)) {
    const files = fs.readdirSync(msgDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const msg = loadJSON(path.join(msgDir, f));
      if (msg && (msg.to || []).includes(agentId) && !msg.consumed) {
        msg.consumed = true;
        saveJSON(path.join(msgDir, f), msg);
        myMessages.push(msg);
      }
    }
    if (myMessages.length > 0) {
      console.log(`[comm]   收到 ${myMessages.length} 条新消息`);
    }
  }

  return {
    agentId,
    agentName: myself.name,
    capabilities: myself.capabilities || [],
    dependencies: depStates,
    messages: myMessages,
    consumes: myself.consumes || [],
    produces: myself.produces || [],
  };
}

// ═══════════════════════════════════════════════════════════════
// postflight — Agent 结束时调用，写入状态 + 通知下游
// ═══════════════════════════════════════════════════════════════

function postflight(agentId, result, opts = {}) {
  const timetableDir = opts.timetableDir || process.cwd();
  const stateDir = path.join(timetableDir, '_state');
  const registryPath = path.join(stateDir, 'agents.json');
  const agentFile = path.join(stateDir, 'agents', `${agentId}.json`);

  const registry = loadJSON(registryPath);
  const myself = registry ? (registry.agents || []).find(a => a.id === agentId) : null;

  // 写入自己的状态
  const state = {
    agentId,
    name: myself ? myself.name : agentId,
    lastRun: new Date().toISOString(),
    status: result.success ? 'success' : 'failed',
    summary: result.summary || {},
    errors: result.errors || [],
  };
  saveJSON(agentFile, state);

  const emoji = result.success ? '✓' : '✗';
  console.log(`[comm] ${myself ? myself.name : agentId} 完成 ${emoji}`);

  // 通知下游
  if (myself && (myself.notifyOnComplete || []).length > 0) {
    const msgDir = path.join(stateDir, 'messages');
    ensureDir(msgDir);

    const msgId = `msg-${new Date().toISOString().slice(0, 10)}-${agentId}-${Date.now()}`;
    const msg = {
      id: msgId,
      from: agentId,
      to: myself.notifyOnComplete,
      type: result.success ? 'task-complete' : 'task-failed',
      timestamp: new Date().toISOString(),
      payload: result.summary || {},
      consumed: false,
    };

    const msgFile = path.join(msgDir, `${msgId}.json`);
    saveJSON(msgFile, msg);
    console.log(`[comm]   通知下游: ${myself.notifyOnComplete.join(', ')}`);
  }

  return state;
}

// ═══════════════════════════════════════════════════════════════
// sendMessage — 手动发送消息给其他 Agent
// ═══════════════════════════════════════════════════════════════

function sendMessage(from, to, type, payload, opts = {}) {
  const timetableDir = opts.timetableDir || process.cwd();
  const msgDir = path.join(timetableDir, '_state', 'messages');
  ensureDir(msgDir);

  const toList = Array.isArray(to) ? to : [to];
  const msgId = `msg-${new Date().toISOString().slice(0, 10)}-${from}-${Date.now()}`;
  const msg = {
    id: msgId,
    from,
    to: toList,
    type,
    timestamp: new Date().toISOString(),
    payload,
    consumed: false,
  };

  const msgFile = path.join(msgDir, `${msgId}.json`);
  saveJSON(msgFile, msg);
  console.log(`[comm] ${from} → ${toList.join(', ')}: ${type}`);
  return msg;
}

// ═══════════════════════════════════════════════════════════════
// getStatus — 查询所有 Agent 的状态摘要
// ═══════════════════════════════════════════════════════════════

function getStatus(opts = {}) {
  const timetableDir = opts.timetableDir || process.cwd();
  const stateDir = path.join(timetableDir, '_state');
  const registryPath = path.join(stateDir, 'agents.json');

  const registry = loadJSON(registryPath);
  if (!registry) return { error: 'agents.json 不存在' };

  const statuses = [];
  for (const agent of (registry.agents || [])) {
    const agentFile = path.join(stateDir, 'agents', `${agent.id}.json`);
    const st = loadJSON(agentFile);
    statuses.push({
      id: agent.id,
      name: agent.name,
      schedule: agent.schedule,
      lastRun: st ? st.lastRun : null,
      status: st ? st.status : 'unknown',
      summary: st ? st.summary : null,
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    agents: statuses,
  };
}

module.exports = {
  preflight,
  postflight,
  sendMessage,
  getStatus,
  readJsonSafe,
  writeJsonAtomic,
};
