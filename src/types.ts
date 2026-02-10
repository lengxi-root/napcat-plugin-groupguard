// 群管插件类型定义

/** 消息类型检测过滤配置 */
export interface MsgFilterSettings {
  /** 自动撤回视频 */
  blockVideo: boolean;
  /** 自动撤回图片 */
  blockImage: boolean;
  /** 自动撤回语音 */
  blockRecord: boolean;
  /** 自动撤回合并转发 */
  blockForward: boolean;
  /** 自动撤回小程序卡片 */
  blockLightApp: boolean;
  /** 自动撤回名片分享 */
  blockContact: boolean;
  /** 自动撤回含链接消息 */
  blockUrl: boolean;
}

export interface PluginConfig {
  debug: boolean;
  ownerQQs: string;
  global: GroupGuardSettings;
  groups: Record<string, GroupGuardSettings>;
  antiRecallGroups: string[];
  globalAntiRecall: boolean;
  globalEmojiReact: boolean;
  emojiReactGroups: Record<string, string[]>;
  cardLocks: Record<string, string>;
  blacklist: string[];
  whitelist: string[];
  filterKeywords: string[];
  filterPunishLevel: number;
  filterBanMinutes: number;
  welcomeMessage: string;
  spamWindow: number;
  spamThreshold: number;
  spamDetect: boolean;
  spamBanMinutes: number;
  /** 退群自动拉黑 */
  leaveBlacklist: boolean;
  /** 全局消息类型过滤 */
  msgFilter: MsgFilterSettings;
  /** 全局问答列表 */
  qaList: QAEntry[];
  /** 预设配置列表 */
  presets: PresetConfig[];
}

export interface GroupGuardSettings {
  useGlobal?: boolean;
  autoApprove: boolean;
  enableVerify: boolean;
  verifyTimeout: number;
  maxAttempts: number;
  mathMin: number;
  mathMax: number;
  targetUsers: string[];
  /** 群独立黑名单 */
  groupBlacklist: string[];
  /** 退群自动拉黑（群级别） */
  leaveBlacklist: boolean;
  /** 欢迎词（群级别，空则用全局） */
  welcomeMessage?: string;
  /** 违禁词列表（群级别，空则用全局） */
  filterKeywords?: string[];
  /** 违禁词惩罚等级 */
  filterPunishLevel?: number;
  /** 违禁词禁言时长（分钟） */
  filterBanMinutes?: number;
  /** 刷屏检测开关 */
  spamDetect?: boolean;
  /** 刷屏时间窗口（秒） */
  spamWindow?: number;
  /** 刷屏消息阈值 */
  spamThreshold?: number;
  /** 刷屏禁言时长（分钟） */
  spamBanMinutes?: number;
  /** 群独立消息类型过滤 */
  msgFilter?: MsgFilterSettings;
  /** 群独立问答列表 */
  qaList?: QAEntry[];
}

export interface VerifySession {
  userId: string;
  groupId: string;
  answer: number;
  expression: string;
  attempts: number;
  maxAttempts: number;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

export interface ActivityRecord {
  msgCount: number;
  lastActive: number;
  todayCount: number;
  todayDate: string;
}

/** 问答条目 */
export interface QAEntry {
  /** 触发关键词 */
  keyword: string;
  /** 回复内容，支持 {user} {group} */
  reply: string;
  /** 匹配模式: exact=精确 contains=包含 regex=正则 */
  mode: 'exact' | 'contains' | 'regex';
}

/** 预设配置模板 */
export interface PresetConfig {
  /** 预设名称 */
  name: string;
  /** 保存的设置快照 */
  settings: GroupGuardSettings;
  /** 全局级别的字段快照 */
  globalFields?: {
    filterKeywords?: string[];
    filterPunishLevel?: number;
    filterBanMinutes?: number;
    blacklist?: string[];
    whitelist?: string[];
    leaveBlacklist?: boolean;
    spamDetect?: boolean;
    spamWindow?: number;
    spamThreshold?: number;
    spamBanMinutes?: number;
    msgFilter?: MsgFilterSettings;
    welcomeMessage?: string;
    qaList?: QAEntry[];
  };
}
