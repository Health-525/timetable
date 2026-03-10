/**
 * 提醒功能工具
 */
export interface ReminderData {
  startAt: number;
  remindAt: number;
  courseTitle?: string;
}
const STORAGE_KEY = "zaoz8_reminder";
/**
 * 从 localStorage 加载提醒
 */
export function loadReminder(): ReminderData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReminderData;
    if (parsed?.remindAt && parsed.remindAt > Date.now()) {
      return parsed;
    }
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}
/**
 * 保存提醒到 localStorage
 */
export function saveReminder(data: ReminderData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略存储错误
  }
}
/**
 * 清除提醒
 */
export function clearReminder(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}
/**
 * 检查通知权限状态
 */
export function checkNotificationPermission(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}
/**
 * 发送通知
 */
export function sendNotification(title: string, body?: string): void {
  try {
    new Notification(title, body ? { body } : undefined);
  } catch {
    // 忽略通知错误
  }
}
/**
 * 计算提醒时间（默认提前 10 分钟）
 */
export function calculateReminderTime(startTime: Date, minutesBefore = 10): number {
  return startTime.getTime() - minutesBefore * 60 * 1000;
}
/**
 * 检查是否可以设置提醒（至少提前 1 分钟）
 */
export function canSetReminder(startTime: Date, minutesBefore = 1): boolean {
  const remindAt = calculateReminderTime(startTime, minutesBefore);
  return remindAt > Date.now();
}