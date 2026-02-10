// 群管插件配置
import type { PluginConfig, GroupGuardSettings, MsgFilterSettings } from './types';

export const DEFAULT_MSG_FILTER: MsgFilterSettings = {
  blockVideo: false,
  blockImage: false,
  blockRecord: false,
  blockForward: false,
  blockLightApp: false,
  blockContact: false,
  blockUrl: false,
};

export const DEFAULT_GROUP_SETTINGS: GroupGuardSettings = {
  useGlobal: true,
  autoApprove: true,
  enableVerify: true,
  verifyTimeout: 300,
  maxAttempts: 5,
  mathMin: 1,
  mathMax: 100,
  targetUsers: [],
  groupBlacklist: [],
  leaveBlacklist: false,
};

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  debug: false,
  ownerQQs: '',
  global: { ...DEFAULT_GROUP_SETTINGS, useGlobal: false },
  groups: {},
  antiRecallGroups: [],
  globalAntiRecall: false,
  globalEmojiReact: false,
  emojiReactGroups: {},
  cardLocks: {},
  blacklist: [],
  whitelist: [],
  filterKeywords: [],
  filterPunishLevel: 1,
  filterBanMinutes: 10,
  welcomeMessage: '欢迎 {user} 加入本群！',
  spamWindow: 10,
  spamThreshold: 10,
  spamDetect: false,
  spamBanMinutes: 5,
  leaveBlacklist: false,
  msgFilter: { ...DEFAULT_MSG_FILTER },
  qaList: [],
  presets: [],
};

// 帮助菜单
export const GROUP_ADMIN_MENU = `群管功能（需管理员权限）
【禁言@某人 分钟】禁言成员
【禁言QQ号 分钟】禁言成员
【解禁@某人】解除禁言
【解禁QQ号】解除禁言
【全体禁言】开启全体禁言
【全体解禁】关闭全体禁言
【踢出@某人】踢出成员
【踢出QQ号】踢出成员
【授予头衔@某人 内容】设置头衔(群主)
【清除头衔@某人】清除头衔(群主)
【锁定名片@某人】锁定群名片
【解锁名片@某人】解锁群名片
【名片锁定列表】查看锁定列表`;

export const ANTI_RECALL_MENU = `防撤回功能
【开启防撤回】当前群开启
【关闭防撤回】当前群关闭
【防撤回列表】查看已开启的群`;

export const EMOJI_REACT_MENU = `回应表情功能
【开启回应表情】当前群开启
【关闭回应表情】当前群关闭`;

export const TARGET_MENU = `针对功能（自动撤回）
【针对@某人】针对被@的用户
【针对+QQ号】针对指定QQ
【取消针对@某人】取消针对
【取消针对+QQ号】取消指定QQ
【针对列表】查看当前群针对列表
【清除针对】清除当前群所有针对`;

export const BLACKWHITE_MENU = `黑白名单功能（主人权限）
【拉黑@某人】加入全局黑名单
【拉黑QQ号】加入全局黑名单
【取消拉黑@某人】移出黑名单
【取消拉黑QQ号】移出黑名单
【黑名单列表】查看全局黑名单
【白名单@某人】加入白名单
【白名单QQ号】加入白名单
【取消白名单@某人】移出白名单
【取消白名单QQ号】移出白名单
【白名单列表】查看白名单
【群拉黑@某人】加入本群黑名单
【群拉黑QQ号】加入本群黑名单
【群取消拉黑@某人】移出本群黑名单
【群取消拉黑QQ号】移出本群黑名单
【群黑名单列表】查看本群黑名单`;

export const FILTER_MENU = `违禁词功能（主人权限）
【添加违禁词 词语】添加违禁词
【删除违禁词 词语】删除违禁词
【违禁词列表】查看违禁词列表`;

export const QA_MENU = `问答功能（主人/管理员）
【问答列表】查看当前问答
【添加问答 关键词|回复】添加精确匹配
【添加模糊问答 关键词|回复】添加包含匹配
【添加正则问答 正则|回复】添加正则匹配
【删除问答 关键词】删除指定问答
支持变量: {user}=QQ号 {group}=群号`;
