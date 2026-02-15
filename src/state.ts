// 插件全局状态管理
import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';
import type { PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { NetworkAdapterConfig } from 'napcat-types/napcat-onebot/config/config';
import type { PluginConfig, VerifySession, GroupGuardSettings, ActivityRecord } from './types';
import { DEFAULT_PLUGIN_CONFIG } from './config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

// 运行时从 package.json 读取版本号
function getPluginVersion (): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '1.0.0';
    }
  } catch { /* 读取失败使用默认版本 */ }
  return '1.0.0';
}

interface LogEntry {
  time: number;
  level: string;
  msg: string;
}

class PluginState {
  /** 插件版本（运行时从 package.json 读取） */
  version: string = getPluginVersion();
  logger: PluginLogger | null = null;
  actions: ActionMap | undefined;
  adapterName = '';
  networkConfig: NetworkAdapterConfig | null = null;
  config: PluginConfig = JSON.parse(JSON.stringify(DEFAULT_PLUGIN_CONFIG));
  sessions: Map<string, VerifySession> = new Map();
  pendingComments: Map<string, string> = new Map();
  botId = '';  // 机器人自身QQ号
  /** 防撤回消息缓存 key: messageId */
  msgCache: Map<string, { userId: string; groupId: string; raw: string; time: number; }> = new Map();
  /** 刷屏检测缓存 key: `${groupId}:${userId}`, value: 时间戳数组 */
  spamCache: Map<string, number[]> = new Map();
  /** 调试日志缓冲区 */
  logBuffer: LogEntry[] = [];
  private readonly maxLogEntries = 500;

  /** 活跃统计数据（独立持久化）嵌套结构: { groupId: { userId: ActivityRecord } } */
  activityStats: Record<string, Record<string, ActivityRecord>> = {};
  /** 活跃统计文件路径 */
  activityPath = '';
  /** 活跃数据是否有变更（脏标记） */
  private activityDirty = false;

  private pushLog (level: string, msg: string): void {
    this.logBuffer.push({ time: Date.now(), level, msg });
    if (this.logBuffer.length > this.maxLogEntries) this.logBuffer.splice(0, this.logBuffer.length - this.maxLogEntries);
  }

  log (level: 'info' | 'warn' | 'error', msg: string): void {
    this.logger?.[level](`[GroupGuard] ${msg}`);
    this.pushLog(level, msg);
  }
  debug (msg: string): void {
    if (this.config.debug) {
      this.logger?.info(`[GroupGuard] [DEBUG] ${msg}`);
      this.pushLog('debug', msg);
    }
  }
  clearLogs (): void { this.logBuffer = []; }
  getGroupSettings (groupId: string): GroupGuardSettings {
    const groupCfg = this.config.groups[groupId];
    if (groupCfg && !groupCfg.useGlobal) return groupCfg;
    return this.config.global;
  }
  isOwner (userId: string): boolean {
    return this.config.ownerQQs.split(',').map(s => s.trim()).filter(Boolean).includes(userId);
  }
  isWhitelisted (userId: string): boolean {
    return (this.config.whitelist || []).includes(userId);
  }
  isBlacklisted (userId: string): boolean {
    return (this.config.blacklist || []).includes(userId);
  }

  /** 不返回数据也视为成功的 API 列表 */
  private readonly noDataActions = new Set([
    'set_group_card', 'set_group_ban', 'set_group_whole_ban', 'set_group_kick',
    'set_group_special_title', 'set_group_add_request', 'delete_msg', 'set_msg_emoji_like',
  ]);

  /** 调用 API */
  async callApi (action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.actions || !this.networkConfig) return null;
    return this.actions.call(action as never, params as never, this.adapterName, this.networkConfig).catch(e => {
      const errStr = String(e);
      if (this.noDataActions.has(action) && errStr.includes('No data returned')) {
        this.debug(`API ${action} 执行完成（无返回数据）`);
        return null;
      }
      this.log('error', `API调用失败 ${action}: ${e}`);
      return null;
    });
  }
  async sendGroupMsg (groupId: string, message: unknown): Promise<void> {
    await this.callApi('send_group_msg', { group_id: groupId, message });
  }
  async sendGroupText (groupId: string, text: string): Promise<void> {
    await this.sendGroupMsg(groupId, [{ type: 'text', data: { text } }]);
  }

  /** 检查机器人是否是群管理员或群主 */
  async isBotAdmin (groupId: string): Promise<boolean> {
    if (!this.botId) return false;
    try {
      const info = await this.callApi('get_group_member_info', { group_id: groupId, user_id: this.botId }) as { role?: string; } | null;
      return info?.role === 'admin' || info?.role === 'owner';
    } catch { return false; }
  }

  /** 加载活跃统计数据 */
  loadActivity (): void {
    if (!this.activityPath) return;
    try {
      if (fs.existsSync(this.activityPath)) {
        const raw = JSON.parse(fs.readFileSync(this.activityPath, 'utf-8'));
        // 检测是否为旧扁平格式 "groupId:userId" -> record
        const keys = Object.keys(raw);
        if (keys.length > 0 && keys[0].includes(':')) {
          // 旧格式迁移
          this.activityStats = {};
          for (const [k, v] of Object.entries(raw)) {
            const [gid, uid] = k.split(':');
            if (!gid || !uid) continue;
            if (!this.activityStats[gid]) this.activityStats[gid] = {};
            this.activityStats[gid][uid] = v as ActivityRecord;
          }
          this.activityDirty = true;
          this.log('info', `活跃统计已从旧格式迁移: ${keys.length} 条记录`);
        } else {
          this.activityStats = raw;
          let total = 0;
          for (const g of Object.values(this.activityStats)) total += Object.keys(g).length;
          this.log('info', `活跃统计已加载: ${Object.keys(this.activityStats).length} 个群, ${total} 条记录`);
        }
      }
      // 迁移：如果旧配置里还有 activityStats，搬过来
      const legacy = (this.config as any).activityStats;
      if (legacy && Object.keys(legacy).length > 0) {
        for (const [k, v] of Object.entries(legacy)) {
          if (k.includes(':')) {
            const [gid, uid] = k.split(':');
            if (!gid || !uid) continue;
            if (!this.activityStats[gid]) this.activityStats[gid] = {};
            if (!this.activityStats[gid][uid]) this.activityStats[gid][uid] = v as ActivityRecord;
          }
        }
        delete (this.config as any).activityStats;
        this.activityDirty = true;
        this.log('info', '已从旧配置迁移活跃统计数据');
      }
    } catch { /* ignore */ }
  }

  /** 保存活跃统计数据 */
  saveActivity (): void {
    if (!this.activityPath || !this.activityDirty) return;
    try {
      const dir = path.dirname(this.activityPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.activityPath, JSON.stringify(this.activityStats, null, 2), 'utf-8');
      this.activityDirty = false;
    } catch (e) {
      this.log('error', `保存活跃统计失败: ${e}`);
    }
  }

  /** 记录活跃统计 */
  recordActivity (groupId: string, userId: string): void {
    if (!this.activityStats[groupId]) this.activityStats[groupId] = {};
    const today = new Date().toISOString().slice(0, 10);
    const record = this.activityStats[groupId][userId] || { msgCount: 0, lastActive: 0, todayCount: 0, todayDate: today };
    if (record.todayDate !== today) { record.todayCount = 0; record.todayDate = today; }
    record.msgCount++;
    record.todayCount++;
    record.lastActive = Date.now();
    this.activityStats[groupId][userId] = record;
    this.activityDirty = true;
  }
}

export const pluginState = new PluginState();
