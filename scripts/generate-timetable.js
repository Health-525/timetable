#!/usr/bin/env node
// -*- coding: utf-8 -*-

/**
 * 生成课表.md
 * 从 schedule.json 和 adjustments.json 生成 Markdown 格式的课表
 */

const fs = require('fs');
const path = require('path');

// 课程名称缩写映射
const ABBR = {
    '大数据技术基础': '大数据基础',
    'Python数据处理与分析': 'Python数据',
    '数据结构与算法': '数据结构',
    '多元统计分析': '多元统计',
    '数值分析': '数值分析',
    '数学模型与数学软件': '数学模型',
    '毛泽东思想和中国特色社会主义理论体系概论': '毛概',
    '马克思主义基本原理': '马原',
};

/**
 * 获取课程缩写
 * @param {string} title - 课程全称
 * @returns {string} - 缩写
 */
function abbr(title) {
    for (const [k, v] of Object.entries(ABBR)) {
        if (title.includes(k)) return v;
    }
    if (title.includes('体育')) return '体育';
    return title.slice(0, 6);
}

/**
 * 简化地点名称
 * @param {string} loc - 地点全称
 * @returns {string} - 简化后的地点
 */
function shortLoc(loc) {
    return loc.replace(/[（(][^）)]*[）)]/g, '').trim();
}

/**
 * 解析周次规格
 * @param {string} spec - 如 "1-15", "2-17", "1,3,5-7"
 * @returns {Set<number>} - 周次集合
 */
function parseWeekSpec(spec) {
    const weeks = new Set();
    for (const part of String(spec).split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
            const [a, b] = trimmed.split('-', 2).map(x => parseInt(x.trim(), 10));
            const start = Math.min(a, b);
            const end = Math.max(a, b);
            for (let i = start; i <= end; i++) weeks.add(i);
        } else {
            weeks.add(parseInt(trimmed, 10));
        }
    }
    return weeks;
}

/**
 * 检查某周是否在规格中
 * @param {string} spec - 周次规格
 * @param {number} w - 周次
 * @returns {boolean}
 */
function inWeek(spec, w) {
    return parseWeekSpec(spec).has(w);
}

/**
 * 计算日期是第几周
 * @param {Date} d - 日期
 * @param {Date} week1Monday - 第一周周一
 * @returns {number} - 周次
 */
function weekIndex(d, week1Monday) {
    const deltaDays = Math.floor((d - week1Monday) / (1000 * 60 * 60 * 24));
    return Math.floor(deltaDays / 7) + 1;
}

/**
 * 提取开始时间
 * @param {string} s - 时间字符串，如 "08:10-08:55"
 * @returns {string} - 开始时间，如 "08:10"
 */
function startTime(s) {
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : s.trim();
}

/**
 * 应用调课规则
 * @param {Array} courses - 课程列表
 * @param {Array} adjustments - 调课规则
 * @param {number} w - 当前周次
 * @returns {Array} - 应用调课后的课程列表
 */
function applyAdjustments(courses, adjustments, w) {
    const result = [];

    for (const c of courses) {
        if (!inWeek(c.weeks || '', w)) continue;

        const wd = parseInt(c.weekday, 10);
        const periods = Array.isArray(c.periods) ? c.periods.map(Number) : [];
        if (periods.length === 0) continue;

        let hit = null;

        for (const adj of adjustments) {
            const adjTitle = adj.courseTitle || '';
            const cTitle = c.title || '';

            // 检查课程名称匹配
            if (!cTitle.includes(adjTitle) && !adjTitle.includes(cTitle)) continue;

            const mode = adj.mode || 'once';
            const startWeek = adj.startWeek || 0;
            const specificWeek = adj.specificWeek;

            if (mode === 'once' && specificWeek !== w) continue;
            if (mode === 'longterm' && w < startWeek) continue;

            const srcWd = adj.sourceWeekday;
            const srcPeriods = adj.sourcePeriods || [];

            if (srcWd === wd &&
                srcPeriods.slice().sort().join(',') === periods.slice().sort().join(',')) {
                hit = adj;
                break;
            }
        }

        if (hit) {
            result.push({
                ...c,
                weekday: hit.targetWeekday !== undefined ? hit.targetWeekday : wd,
                periods: hit.targetPeriods || periods,
                location: hit.targetLocation || c.location
            });
        } else {
            result.push(c);
        }
    }

    return result;
}

/**
 * 渲染课程表格
 * @param {Array} entries - 课程条目
 * @returns {Array<string>} - Markdown 行
 */
function renderTable(entries) {
    const rows = [
        '| 时间  | 课程       | 地点       |',
        '|-------|------------|------------|'
    ];
    for (const [, t, title, loc] of entries) {
        rows.push(`| ${startTime(t)} | ${abbr(title)} | ${shortLoc(loc)} |`);
    }
    return rows;
}

/**
 * 格式化日期标签
 * @param {Date} d - 日期
 * @returns {string}
 */
function dayLabel(d) {
    const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${DAY_NAMES[d.getDay()]}（${month}-${day}）`;
}

/**
 * 主函数
 */
function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const schedulePath = args[0] || 'data/schedule.json';
    const adjPath = args[1] || 'data/adjustments.json';
    const outputPath = args[2] || '09-日常处理/课表.md';

    // 加载数据
    const data = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
    const adjustments = fs.existsSync(adjPath)
        ? JSON.parse(fs.readFileSync(adjPath, 'utf-8'))
        : [];

    const week1Monday = new Date(data.meta.week1_monday);
    const periodTimes = data.periodTimes || {};
    const courses = data.courses || [];

    // 获取当前时间（北京时间）
    const now = new Date();
    const tzOffset = 8 * 60; // UTC+8 in minutes
    const beijingTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
    const today = new Date(beijingTime.getFullYear(), beijingTime.getMonth(), beijingTime.getDate());

    // 计算本周周一和周日
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const w = weekIndex(monday, week1Monday);

    // 应用调课
    const adjustedCourses = applyAdjustments(courses, adjustments, w);

    // 按星期几分组
    const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

    for (const c of adjustedCourses) {
        const wd = parseInt(c.weekday, 10);
        const periods = Array.isArray(c.periods) ? c.periods.map(Number) : [];
        if (periods.length === 0) continue;

        const ps = Math.min(...periods);
        const timeStr = periodTimes[String(ps)]
            ? periodTimes[String(ps)].slice(0, 5)
            : `第${ps}节`;

        byDay[wd].push([ps, timeStr, c.title, c.location]);
    }

    // 每天内按节次排序
    for (let i = 1; i <= 7; i++) {
        byDay[i].sort((a, b) => a[0] - b[0]);
    }

    // 今天的课程
    const wdToday = today.getDay() === 0 ? 7 : today.getDay();
    const todayEntries = byDay[wdToday];

    const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    // 生成 Markdown
    const lines = [];

    // 头部
    const updateTime = `${beijingTime.getFullYear()}-${String(beijingTime.getMonth() + 1).padStart(2, '0')}-${String(beijingTime.getDate()).padStart(2, '0')} ${String(beijingTime.getHours()).padStart(2, '0')}:${String(beijingTime.getMinutes()).padStart(2, '0')}`;

    lines.push('# 课程表', '');
    lines.push(`> 更新时间：${updateTime}（北京时间）`, '');
    lines.push('---', '');

    // 今日课表
    const todayLabel = `${DAY_NAMES[wdToday - 1]}（${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}）· 第${weekIndex(today, week1Monday)}周`;
    lines.push(`## 今日 · ${todayLabel}`, '');

    if (todayEntries.length === 0) {
        lines.push('> 🎉 今日无课', '');
    } else {
        const first = todayEntries[0];
        lines.push(`> 📌 共 **${todayEntries.length}** 节 · 第一节 **${startTime(first[1])}** ${abbr(first[2])}（${shortLoc(first[3])}）`, '');
        lines.push(...renderTable(todayEntries));
        lines.push('');
    }

    lines.push('---', '');

    // 本周概览
    const has = [];
    for (let i = 0; i < 7; i++) {
        const dayNum = i + 1;
        if (byDay[dayNum].length > 0) {
            has.push(`${['一', '二', '三', '四', '五', '六', '日'][i]}(${byDay[dayNum].length})`);
        }
    }

    const mondayStr = `${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const sundayStr = `${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;

    lines.push(`## 本周 · 第${w}周（${mondayStr} ~ ${sundayStr}）`, '');
    lines.push(`> 📅 有课日：${has.length > 0 ? has.join('　') : '无'}`, '');

    // 每天详情
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const wd = d.getDay() === 0 ? 7 : d.getDay();
        const entries = byDay[wd];

        lines.push('---', '');
        lines.push(`### ${dayLabel(d)}`, '');

        if (entries.length === 0) {
            lines.push('> 无课', '');
        } else {
            lines.push(...renderTable(entries));
            lines.push('');
        }
    }

    // 写入文件
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, lines.join('\n').trim() + '\n', 'utf-8');
    console.log(`课表已生成：${outputPath}`);
}

// 运行
if (require.main === module) {
    try {
        main();
        process.exit(0);
    } catch (err) {
        console.error('生成课表失败:', err.message);
        process.exit(1);
    }
}

module.exports = { parseWeekSpec, applyAdjustments, weekIndex };
