// 群管指令处理
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from './state';
import { GROUP_ADMIN_MENU, ANTI_RECALL_MENU, EMOJI_REACT_MENU, TARGET_MENU, BLACKWHITE_MENU, FILTER_MENU, QA_MENU } from './config';
import fs from 'fs';
import path from 'path';

/** 从消息中提取 @的QQ号 */
function extractAt (raw: string): string | null {
  const m = raw.match(/\[CQ:at,qq=(\d+)\]/);
  return m ? m[1] : null;
}

/** 从文本中提取QQ号 */
function extractQQ (text: string): string | null {
  const m = text.match(/(\d{5,12})/);
  return m ? m[1] : null;
}

/** 提取目标QQ（优先@，其次纯数字） */
function getTarget (raw: string, textAfterCmd: string): string | null {
  return extractAt(raw) || extractQQ(textAfterCmd);
}

/** 检查是否是管理员或主人 */
async function isAdminOrOwner (groupId: string, userId: string): Promise<boolean> {
  if (pluginState.isOwner(userId)) return true;
  const info = await pluginState.callApi('get_group_member_info', { group_id: groupId, user_id: userId }) as any;
  return info?.role === 'admin' || info?.role === 'owner';
}

/** 保存配置到文件 */
export function saveConfig (ctx: NapCatPluginContext): void {
  try {
    if (ctx?.configPath) {
      const dir = path.dirname(ctx.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ctx.configPath, JSON.stringify(pluginState.config, null, 2), 'utf-8');
    }
  } catch { /* ignore */ }
}

/** 处理群管指令，返回 true 表示已处理 */
export async function handleCommand (event: OB11Message, ctx: NapCatPluginContext): Promise<boolean> {
  const raw = event.raw_message || '';
  const text = raw.replace(/\[CQ:[^\]]+\]/g, '').trim();
  const groupId = String(event.group_id);
  const userId = String(event.user_id);

  // ===== 帮助 =====
  if (text === '群管帮助' || text === '群管菜单') {
    const selfId = String((event as any).self_id || '');
    const nodes = [
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: GROUP_ADMIN_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: TARGET_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: BLACKWHITE_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: FILTER_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: ANTI_RECALL_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: EMOJI_REACT_MENU } }] } },
      { type: 'node', data: { nickname: '🛡️ 群管插件', user_id: selfId, content: [{ type: 'text', data: { text: QA_MENU } }] } },
    ];
    await pluginState.callApi('send_group_forward_msg', { group_id: groupId, messages: nodes });
    return true;
  }

  // ===== 踢出 =====
  if (text.startsWith('踢出')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(2).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：踢出@某人 或 踢出QQ号'); return true; }
    await pluginState.callApi('set_group_kick', { group_id: groupId, user_id: target, reject_add_request: false });
    await pluginState.sendGroupText(groupId, `已踢出 ${target}`);
    return true;
  }

  // ===== 禁言 =====
  if (text.startsWith('禁言') && !text.startsWith('禁言列表')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(2).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：禁言@某人 分钟 或 禁言QQ号 分钟'); return true; }
    const durationMatch = rest.replace(/\d{5,}/, '').match(/(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 10;
    await pluginState.callApi('set_group_ban', { group_id: groupId, user_id: target, duration: duration * 60 });
    await pluginState.sendGroupText(groupId, `已禁言 ${target}，时长 ${duration} 分钟`);
    return true;
  }

  // ===== 解禁 =====
  if (text.startsWith('解禁')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(2).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：解禁@某人 或 解禁QQ号'); return true; }
    await pluginState.callApi('set_group_ban', { group_id: groupId, user_id: target, duration: 0 });
    await pluginState.sendGroupText(groupId, `已解禁 ${target}`);
    return true;
  }

  // ===== 全体禁言/解禁 =====
  if (text === '全体禁言') {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    await pluginState.callApi('set_group_whole_ban', { group_id: groupId, enable: true });
    await pluginState.sendGroupText(groupId, '已开启全体禁言');
    return true;
  }
  if (text === '全体解禁') {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    await pluginState.callApi('set_group_whole_ban', { group_id: groupId, enable: false });
    await pluginState.sendGroupText(groupId, '已关闭全体禁言');
    return true;
  }

  // ===== 授予头衔 =====
  if (text.startsWith('授予头衔')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要群主权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：授予头衔@某人 内容'); return true; }
    const title = rest.replace(/\[CQ:[^\]]+\]/g, '').replace(/\d{5,12}/, '').trim();
    await pluginState.callApi('set_group_special_title', { group_id: groupId, user_id: target, special_title: title });
    await pluginState.sendGroupText(groupId, `已为 ${target} 设置头衔：${title || '(空)'}`);
    return true;
  }

  // ===== 清除头衔 =====
  if (text.startsWith('清除头衔')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要群主权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    await pluginState.callApi('set_group_special_title', { group_id: groupId, user_id: target, special_title: '' });
    await pluginState.sendGroupText(groupId, `已清除 ${target} 的头衔`);
    return true;
  }

  // ===== 锁定名片 =====
  if (text.startsWith('锁定名片')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    const info = await pluginState.callApi('get_group_member_info', { group_id: groupId, user_id: target }) as any;
    const card = info?.card || info?.nickname || '';
    pluginState.config.cardLocks[`${groupId}:${target}`] = card;
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已锁定 ${target} 的名片为：${card || '(空)'}`);
    return true;
  }

  // ===== 解锁名片 =====
  if (text.startsWith('解锁名片')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    delete pluginState.config.cardLocks[`${groupId}:${target}`];
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已解锁 ${target} 的名片`);
    return true;
  }

  // ===== 名片锁定列表 =====
  if (text === '名片锁定列表') {
    const locks = pluginState.config.cardLocks;
    const entries = Object.entries(locks).filter(([k]) => k.startsWith(groupId + ':'));
    if (!entries.length) { await pluginState.sendGroupText(groupId, '当前群没有锁定的名片'); return true; }
    const list = entries.map(([k, v]) => `${k.split(':')[1]} → ${v}`).join('\n');
    await pluginState.sendGroupText(groupId, `名片锁定列表：\n${list}`);
    return true;
  }

  // ===== 防撤回 =====
  if (text === '开启防撤回') {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    if (!pluginState.config.antiRecallGroups.includes(groupId)) { pluginState.config.antiRecallGroups.push(groupId); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, '已开启防撤回');
    return true;
  }
  if (text === '关闭防撤回') {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    pluginState.config.antiRecallGroups = pluginState.config.antiRecallGroups.filter(g => g !== groupId);
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, '已关闭防撤回');
    return true;
  }
  if (text === '防撤回列表') {
    const list = pluginState.config.antiRecallGroups;
    await pluginState.sendGroupText(groupId, list.length ? `防撤回已开启的群：\n${list.join('\n')}` : '没有开启防撤回的群');
    return true;
  }

  // ===== 回应表情 =====
  if (text === '开启回应表情') {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    if (!pluginState.config.emojiReactGroups[groupId]) pluginState.config.emojiReactGroups[groupId] = [];
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, '已开启回应表情');
    return true;
  }
  if (text === '关闭回应表情') {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    delete pluginState.config.emojiReactGroups[groupId];
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, '已关闭回应表情');
    return true;
  }

  // ===== 针对（自动撤回） =====
  if (text.startsWith('针对') && text !== '针对列表') {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(2).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：针对@某人 或 针对+QQ号'); return true; }
    const cfg = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal ? pluginState.config.groups[groupId] : pluginState.config.global;
    if (!cfg.targetUsers) cfg.targetUsers = [];
    if (!cfg.targetUsers.includes(target)) { cfg.targetUsers.push(target); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已针对 ${target}，其消息将被自动撤回`);
    return true;
  }
  if (text.startsWith('取消针对')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    const cfg = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal ? pluginState.config.groups[groupId] : pluginState.config.global;
    if (cfg.targetUsers) { cfg.targetUsers = cfg.targetUsers.filter(t => t !== target); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已取消针对 ${target}`);
    return true;
  }
  if (text === '针对列表') {
    const settings = pluginState.getGroupSettings(groupId);
    const list = settings.targetUsers || [];
    await pluginState.sendGroupText(groupId, list.length ? `当前群针对列表：\n${list.join('\n')}` : '当前群没有针对的用户');
    return true;
  }
  if (text === '清除针对') {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const cfg = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal ? pluginState.config.groups[groupId] : pluginState.config.global;
    cfg.targetUsers = [];
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, '已清除当前群所有针对');
    return true;
  }

  // ===== 黑名单 =====
  if (text.startsWith('拉黑')) {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const rest = text.slice(2).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：拉黑@某人 或 拉黑QQ号'); return true; }
    if (!pluginState.config.blacklist) pluginState.config.blacklist = [];
    if (!pluginState.config.blacklist.includes(target)) { pluginState.config.blacklist.push(target); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已将 ${target} 加入全局黑名单`);
    return true;
  }
  if (text.startsWith('取消拉黑')) {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const rest = text.slice(4).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    pluginState.config.blacklist = (pluginState.config.blacklist || []).filter(q => q !== target);
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已将 ${target} 移出黑名单`);
    return true;
  }
  if (text === '黑名单列表') {
    const list = pluginState.config.blacklist || [];
    await pluginState.sendGroupText(groupId, list.length ? `全局黑名单：\n${list.join('\n')}` : '黑名单为空');
    return true;
  }

  // ===== 群独立黑名单 =====
  if (text.startsWith('群拉黑')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(3).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：群拉黑@某人 或 群拉黑QQ号'); return true; }
    if (!pluginState.config.groups[groupId]) pluginState.config.groups[groupId] = { ...pluginState.getGroupSettings(groupId) };
    const gs = pluginState.config.groups[groupId];
    if (!gs.groupBlacklist) gs.groupBlacklist = [];
    if (!gs.groupBlacklist.includes(target)) { gs.groupBlacklist.push(target); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已将 ${target} 加入本群黑名单`);
    return true;
  }
  if (text.startsWith('群取消拉黑')) {
    if (!await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const rest = text.slice(5).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    if (pluginState.config.groups[groupId]) {
      const gs = pluginState.config.groups[groupId];
      gs.groupBlacklist = (gs.groupBlacklist || []).filter(q => q !== target);
      saveConfig(ctx);
    }
    await pluginState.sendGroupText(groupId, `已将 ${target} 移出本群黑名单`);
    return true;
  }
  if (text === '群黑名单列表') {
    const settings = pluginState.getGroupSettings(groupId);
    const list = settings.groupBlacklist || [];
    await pluginState.sendGroupText(groupId, list.length ? `本群黑名单：\n${list.join('\n')}` : '本群黑名单为空');
    return true;
  }

  // ===== 白名单 =====
  if (text.startsWith('白名单') && text !== '白名单列表') {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const rest = text.slice(3).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标：白名单@某人 或 白名单QQ号'); return true; }
    if (!pluginState.config.whitelist) pluginState.config.whitelist = [];
    if (!pluginState.config.whitelist.includes(target)) { pluginState.config.whitelist.push(target); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已将 ${target} 加入白名单`);
    return true;
  }
  if (text.startsWith('取消白名单')) {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const rest = text.slice(5).trim();
    const target = getTarget(raw, rest);
    if (!target) { await pluginState.sendGroupText(groupId, '请指定目标'); return true; }
    pluginState.config.whitelist = (pluginState.config.whitelist || []).filter(q => q !== target);
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已将 ${target} 移出白名单`);
    return true;
  }
  if (text === '白名单列表') {
    const list = pluginState.config.whitelist || [];
    await pluginState.sendGroupText(groupId, list.length ? `全局白名单：\n${list.join('\n')}` : '白名单为空');
    return true;
  }

  // ===== 违禁词管理 =====
  if (text.startsWith('添加违禁词')) {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const word = text.slice(5).trim();
    if (!word) { await pluginState.sendGroupText(groupId, '请指定违禁词：添加违禁词 词语'); return true; }
    if (!pluginState.config.filterKeywords) pluginState.config.filterKeywords = [];
    if (!pluginState.config.filterKeywords.includes(word)) { pluginState.config.filterKeywords.push(word); saveConfig(ctx); }
    await pluginState.sendGroupText(groupId, `已添加违禁词：${word}`);
    return true;
  }
  if (text.startsWith('删除违禁词')) {
    if (!pluginState.isOwner(userId)) { await pluginState.sendGroupText(groupId, '需要主人权限'); return true; }
    const word = text.slice(5).trim();
    if (!word) { await pluginState.sendGroupText(groupId, '请指定违禁词'); return true; }
    pluginState.config.filterKeywords = (pluginState.config.filterKeywords || []).filter(w => w !== word);
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已删除违禁词：${word}`);
    return true;
  }
  if (text === '违禁词列表') {
    const list = pluginState.config.filterKeywords || [];
    await pluginState.sendGroupText(groupId, list.length ? `违禁词列表：\n${list.join('、')}` : '违禁词列表为空');
    return true;
  }

  // ===== 问答管理 =====
  if (text === '问答列表') {
    const settings = pluginState.getGroupSettings(groupId);
    const groupQa = settings.qaList || [];
    const globalQa = pluginState.config.qaList || [];
    const isGroupCustom = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal;
    const list = isGroupCustom ? groupQa : globalQa;
    const label = isGroupCustom ? '本群' : '全局';
    if (!list.length) { await pluginState.sendGroupText(groupId, `${label}问答列表为空`); return true; }
    const modeMap: Record<string, string> = { exact: '精确', contains: '模糊', regex: '正则' };
    const txt = list.map((q, i) => `${i + 1}. [${modeMap[q.mode] || q.mode}] ${q.keyword} → ${q.reply}`).join('\n');
    await pluginState.sendGroupText(groupId, `${label}问答列表：\n${txt}`);
    return true;
  }
  if (text.startsWith('添加问答 ') || text.startsWith('添加模糊问答 ') || text.startsWith('添加正则问答 ')) {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    let mode: 'exact' | 'contains' | 'regex' = 'exact';
    let rest = '';
    if (text.startsWith('添加正则问答 ')) { mode = 'regex'; rest = text.slice(7).trim(); }
    else if (text.startsWith('添加模糊问答 ')) { mode = 'contains'; rest = text.slice(7).trim(); }
    else { rest = text.slice(5).trim(); }
    const sep = rest.indexOf('|');
    if (sep < 1) { await pluginState.sendGroupText(groupId, '格式：添加问答 关键词|回复内容'); return true; }
    const keyword = rest.slice(0, sep).trim();
    const reply = rest.slice(sep + 1).trim();
    if (!keyword || !reply) { await pluginState.sendGroupText(groupId, '关键词和回复不能为空'); return true; }
    // 判断当前编辑的是群级还是全局
    const isGroupCustom = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal;
    if (isGroupCustom) {
      const gs = pluginState.config.groups[groupId];
      if (!gs.qaList) gs.qaList = [];
      gs.qaList.push({ keyword, reply, mode });
    } else {
      if (!pluginState.config.qaList) pluginState.config.qaList = [];
      pluginState.config.qaList.push({ keyword, reply, mode });
    }
    saveConfig(ctx);
    const modeMap: Record<string, string> = { exact: '精确', contains: '模糊', regex: '正则' };
    await pluginState.sendGroupText(groupId, `已添加${modeMap[mode]}问答：${keyword} → ${reply}`);
    return true;
  }
  if (text.startsWith('删除问答 ')) {
    if (!pluginState.isOwner(userId) && !await isAdminOrOwner(groupId, userId)) { await pluginState.sendGroupText(groupId, '需要管理员权限'); return true; }
    const keyword = text.slice(5).trim();
    if (!keyword) { await pluginState.sendGroupText(groupId, '请指定关键词：删除问答 关键词'); return true; }
    const isGroupCustom = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal;
    if (isGroupCustom) {
      const gs = pluginState.config.groups[groupId];
      const before = (gs.qaList || []).length;
      gs.qaList = (gs.qaList || []).filter(q => q.keyword !== keyword);
      if (gs.qaList.length === before) { await pluginState.sendGroupText(groupId, `未找到问答：${keyword}`); return true; }
    } else {
      const before = (pluginState.config.qaList || []).length;
      pluginState.config.qaList = (pluginState.config.qaList || []).filter(q => q.keyword !== keyword);
      if (pluginState.config.qaList.length === before) { await pluginState.sendGroupText(groupId, `未找到问答：${keyword}`); return true; }
    }
    saveConfig(ctx);
    await pluginState.sendGroupText(groupId, `已删除问答：${keyword}`);
    return true;
  }

  return false;
}


/** 处理黑名单用户（在群内发消息立即撤回+踢出，检查全局+群独立黑名单） */
export async function handleBlacklist (groupId: string, userId: string, messageId: string): Promise<boolean> {
  const isGlobalBlack = pluginState.isBlacklisted(userId);
  const settings = pluginState.getGroupSettings(groupId);
  const isGroupBlack = (settings.groupBlacklist || []).includes(userId);
  if (!isGlobalBlack && !isGroupBlack) return false;
  await pluginState.callApi('delete_msg', { message_id: messageId });
  await pluginState.callApi('set_group_kick', { group_id: groupId, user_id: userId, reject_add_request: false });
  pluginState.log('info', `黑名单用户 ${userId} 在群 ${groupId} 发言，已撤回并踢出（${isGlobalBlack ? '全局' : '群独立'}黑名单）`);
  return true;
}

/** 处理违禁词过滤 */
export async function handleFilterKeywords (groupId: string, userId: string, messageId: string, raw: string, ctx: NapCatPluginContext): Promise<boolean> {
  const settings = pluginState.getGroupSettings(groupId);
  // 群独立违禁词优先，没有则用全局
  const groupKw = settings.filterKeywords;
  const keywords = (groupKw && groupKw.length) ? groupKw : (pluginState.config.filterKeywords || []);
  if (!keywords.length) return false;
  const matched = keywords.find(k => raw.includes(k));
  if (!matched) return false;

  const level = (groupKw && groupKw.length) ? (settings.filterPunishLevel || 1) : (pluginState.config.filterPunishLevel || 1);
  pluginState.log('info', `违禁词触发: 群 ${groupId} 用户 ${userId} 触发「${matched}」，惩罚等级 ${level}`);

  // 等级1+：撤回
  await pluginState.callApi('delete_msg', { message_id: messageId });

  if (level >= 2) {
    const banMin = (groupKw && groupKw.length) ? (settings.filterBanMinutes || 10) : (pluginState.config.filterBanMinutes || 10);
    await pluginState.callApi('set_group_ban', { group_id: groupId, user_id: userId, duration: banMin * 60 });
    await pluginState.sendGroupText(groupId, `⚠️ ${userId} 触发违禁词，已禁言 ${banMin} 分钟`);
  }

  if (level >= 3) {
    setTimeout(() => pluginState.callApi('set_group_kick', { group_id: groupId, user_id: userId, reject_add_request: false }), 1000);
    await pluginState.sendGroupText(groupId, `⚠️ ${userId} 触发违禁词，已踢出`);
  }

  if (level >= 4) {
    if (!pluginState.config.blacklist) pluginState.config.blacklist = [];
    if (!pluginState.config.blacklist.includes(userId)) {
      pluginState.config.blacklist.push(userId);
      saveConfig(ctx);
    }
  }

  return true;
}

/** 处理刷屏检测 */
export async function handleSpamDetect (groupId: string, userId: string): Promise<boolean> {
  const settings = pluginState.getGroupSettings(groupId);
  const spamOn = settings.spamDetect !== undefined ? settings.spamDetect : pluginState.config.spamDetect;
  if (!spamOn) return false;
  const windowMs = ((settings.spamWindow !== undefined ? settings.spamWindow : pluginState.config.spamWindow) || 10) * 1000;
  const threshold = (settings.spamThreshold !== undefined ? settings.spamThreshold : pluginState.config.spamThreshold) || 10;
  const key = `${groupId}:${userId}`;
  const now = Date.now();

  let timestamps = pluginState.spamCache.get(key) || [];
  timestamps.push(now);
  timestamps = timestamps.filter(t => now - t < windowMs);
  pluginState.spamCache.set(key, timestamps);

  if (timestamps.length >= threshold) {
    const banMin = (settings.spamBanMinutes !== undefined ? settings.spamBanMinutes : pluginState.config.spamBanMinutes) || 5;
    await pluginState.callApi('set_group_ban', { group_id: groupId, user_id: userId, duration: banMin * 60 });
    await pluginState.sendGroupText(groupId, `⚠️ ${userId} 刷屏检测触发，已禁言 ${banMin} 分钟`);
    pluginState.spamCache.delete(key);
    pluginState.log('info', `刷屏检测: 群 ${groupId} 用户 ${userId} 在 ${windowMs / 1000}s 内发送 ${threshold} 条消息`);
    return true;
  }
  return false;
}

/** 处理防撤回事件 */
export async function handleAntiRecall (groupId: string, messageId: string, userId: string): Promise<void> {
  const isGroupMode = pluginState.config.antiRecallGroups.includes(groupId);
  const isGlobalMode = pluginState.config.globalAntiRecall;
  if (!isGroupMode && !isGlobalMode) return;

  const cached = pluginState.msgCache.get(messageId);
  if (!cached) return;
  pluginState.msgCache.delete(messageId);

  if (isGroupMode) {
    await pluginState.sendGroupMsg(groupId, [
      { type: 'text', data: { text: `🔔 防撤回 - 用户 ${userId} 撤回了消息：\n${cached.raw}` } },
    ]);
  }

  if (isGlobalMode) {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const msg = `🔔 防撤回通知\n群号：${groupId}\nQQ号：${userId}\n时间：${timeStr}\n撤回内容：${cached.raw}`;
    const owners = pluginState.config.ownerQQs.split(',').map(s => s.trim()).filter(Boolean);
    for (const owner of owners) {
      await pluginState.callApi('send_private_msg', { user_id: owner, message: [{ type: 'text', data: { text: msg } }] });
    }
  }
}

/** 缓存消息（用于防撤回） */
export function cacheMessage (messageId: string, userId: string, groupId: string, raw: string): void {
  if (!pluginState.config.antiRecallGroups.includes(groupId) && !pluginState.config.globalAntiRecall) return;
  pluginState.msgCache.set(messageId, { userId, groupId, raw, time: Date.now() });
  const now = Date.now();
  for (const [k, v] of pluginState.msgCache) {
    if (now - v.time > 600000) pluginState.msgCache.delete(k);
  }
}

/** 处理回应表情 */
export async function handleEmojiReact (groupId: string, userId: string, messageId: string, selfId: string): Promise<void> {
  if (pluginState.config.globalEmojiReact) {
    await pluginState.callApi('set_msg_emoji_like', { message_id: messageId, emoji_id: '76' });
    return;
  }
  const targets = pluginState.config.emojiReactGroups[groupId];
  if (!targets || !targets.length) return;
  const shouldReact = targets.includes(userId) || (targets.includes('self') && userId === selfId);
  if (!shouldReact) return;
  await pluginState.callApi('set_msg_emoji_like', { message_id: messageId, emoji_id: '76' });
}

/** 处理名片锁定检查（事件模式） */
export async function handleCardLockCheck (groupId: string, userId: string): Promise<void> {
  const key = `${groupId}:${userId}`;
  const lockedCard = pluginState.config.cardLocks[key];
  if (lockedCard === undefined) return;
  const info = await pluginState.callApi('get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true }) as any;
  const currentCard = info?.card || '';
  if (currentCard !== lockedCard) {
    await pluginState.callApi('set_group_card', { group_id: groupId, user_id: userId, card: lockedCard });
    pluginState.debug(`名片锁定: ${userId} 在群 ${groupId} 名片被还原为 ${lockedCard}`);
  }
}

/** 处理名片锁定检查（消息模式） */
export async function handleCardLockOnMessage (groupId: string, userId: string, senderCard: string): Promise<void> {
  const key = `${groupId}:${userId}`;
  const lockedCard = pluginState.config.cardLocks[key];
  if (lockedCard === undefined) return;
  const currentCard = senderCard || '';
  if (currentCard !== lockedCard) {
    pluginState.log('info', `[MsgCheck] 监测到 ${userId} 名片异常(当前: "${currentCard}", 锁定: "${lockedCard}")，正在修正...`);
    await pluginState.callApi('set_group_card', { group_id: groupId, user_id: userId, card: lockedCard });
  }
}

/** 处理针对用户自动撤回 */
export async function handleAutoRecall (groupId: string, userId: string, messageId: string): Promise<boolean> {
  const settings = pluginState.getGroupSettings(groupId);
  const targets = settings.targetUsers || [];
  if (!targets.includes(userId)) return false;
  await pluginState.callApi('delete_msg', { message_id: messageId });
  pluginState.debug(`针对撤回: 群 ${groupId} 用户 ${userId} 消息 ${messageId}`);
  return true;
}

/** 发送欢迎消息 */
export async function sendWelcomeMessage (groupId: string, userId: string): Promise<void> {
  const settings = pluginState.getGroupSettings(groupId);
  const tpl = (settings.welcomeMessage !== undefined && settings.welcomeMessage !== '') ? settings.welcomeMessage : (pluginState.config.welcomeMessage || '');
  if (!tpl) return;
  const msg = tpl.replace(/\{user\}/g, userId).replace(/\{group\}/g, groupId);
  await pluginState.sendGroupMsg(groupId, [
    { type: 'at', data: { qq: userId } },
    { type: 'text', data: { text: ` ${msg}` } },
  ]);
}

/** 处理消息类型过滤（视频/图片/语音/转发/小程序/名片/链接） */
export async function handleMsgTypeFilter (groupId: string, userId: string, messageId: string, raw: string, messageSegments: any[]): Promise<boolean> {
  const settings = pluginState.getGroupSettings(groupId);
  const filter = settings.msgFilter || pluginState.config.msgFilter;
  if (!filter) return false;

  const types = (messageSegments || []).map((s: any) => s.type);
  let blocked = false;
  let reason = '';

  if (filter.blockVideo && types.includes('video')) { blocked = true; reason = '视频'; }
  else if (filter.blockImage && types.includes('image')) { blocked = true; reason = '图片'; }
  else if (filter.blockRecord && types.includes('record')) { blocked = true; reason = '语音'; }
  else if (filter.blockForward && types.includes('forward')) { blocked = true; reason = '合并转发'; }
  else if (filter.blockLightApp && raw.includes('[CQ:json,')) { blocked = true; reason = '小程序卡片'; }
  else if (filter.blockContact && (raw.includes('"app":"com.tencent.contact.lua"') || raw.includes('"app":"com.tencent.qq.checkin"'))) { blocked = true; reason = '名片分享'; }
  else if (filter.blockUrl && /https?:\/\//i.test(raw)) { blocked = true; reason = '链接'; }

  if (!blocked) return false;
  await pluginState.callApi('delete_msg', { message_id: messageId });
  pluginState.log('info', `消息类型过滤: 群 ${groupId} 用户 ${userId} 发送${reason}，已撤回`);
  return true;
}

/** 问答自动回复 */
export async function handleQA (groupId: string, userId: string, raw: string): Promise<boolean> {
  const settings = pluginState.getGroupSettings(groupId);
  const isGroupCustom = pluginState.config.groups[groupId] && !pluginState.config.groups[groupId].useGlobal;
  const qaList = isGroupCustom ? (settings.qaList || []) : (pluginState.config.qaList || []);
  if (!qaList.length) return false;

  const text = raw.replace(/\[CQ:[^\]]+\]/g, '').trim();
  for (const qa of qaList) {
    let matched = false;
    if (qa.mode === 'exact') matched = text === qa.keyword;
    else if (qa.mode === 'contains') matched = text.includes(qa.keyword);
    else if (qa.mode === 'regex') { try { matched = new RegExp(qa.keyword).test(text); } catch { /* ignore */ } }
    if (matched) {
      const reply = qa.reply.replace(/\{user\}/g, userId).replace(/\{group\}/g, groupId);
      await pluginState.sendGroupText(groupId, reply);
      pluginState.debug(`问答触发: 群 ${groupId} 用户 ${userId} 匹配 [${qa.mode}]${qa.keyword}`);
      return true;
    }
  }
  return false;
}
