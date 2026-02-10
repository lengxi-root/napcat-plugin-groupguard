// 验证逻辑
import { pluginState } from './state';

function randInt (min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion (min: number, max: number): { expression: string; answer: number; } {
  const a = randInt(min, max);
  const b = randInt(min, max);
  const ops = ['+', '-', '*'] as const;
  const op = ops[randInt(0, 2)];
  let expression: string, answer: number;
  switch (op) {
    case '+': expression = `${a} + ${b}`; answer = a + b; break;
    case '-': { const big = Math.max(a, b), small = Math.min(a, b); expression = `${big} - ${small}`; answer = big - small; break; }
    case '*': { const x = randInt(1, 20), y = randInt(1, 20); expression = `${x} × ${y}`; answer = x * y; break; }
  }
  return { expression, answer };
}

function sessionKey (groupId: string, userId: string): string { return `${groupId}:${userId}`; }

export function createVerifySession (groupId: string, userId: string, comment?: string, welcomeText?: string): void {
  const key = sessionKey(groupId, userId);
  const existing = pluginState.sessions.get(key);
  if (existing) clearTimeout(existing.timer);

  const settings = pluginState.getGroupSettings(groupId);
  const { expression, answer } = generateMathQuestion(settings.mathMin, settings.mathMax);
  const timeout = settings.verifyTimeout;
  const maxAttempts = settings.maxAttempts;

  const timer = setTimeout(async () => {
    const session = pluginState.sessions.get(key);
    if (!session) return;
    pluginState.sessions.delete(key);
    pluginState.log('info', `用户 ${userId} 在群 ${groupId} 验证超时，踢出`);
    await pluginState.sendGroupMsg(groupId, [
      { type: 'at', data: { qq: userId } },
      { type: 'text', data: { text: ` 验证超时，你已被移出群聊。` } },
    ]);
    setTimeout(() => pluginState.callApi('set_group_kick', { group_id: groupId, user_id: userId, reject_add_request: false }), 1500);
  }, timeout * 1000);

  pluginState.sessions.set(key, { userId, groupId, answer, expression, attempts: 0, maxAttempts, timer, createdAt: Date.now() });
  pluginState.debug(`创建验证会话: ${key}, 题目: ${expression} = ${answer}`);

  const cleanComment = comment ? comment.replace(/^问题：/, '').replace(/\s*答案：/, ' 答案：') : '';
  const commentLine = cleanComment ? `\n入群验证信息：${cleanComment}` : '';
  const welcomeLine = welcomeText ? `${welcomeText}\n` : '';
  pluginState.sendGroupMsg(groupId, [
    { type: 'at', data: { qq: userId } },
    { type: 'text', data: { text: ` ${welcomeLine}请在「${timeout}」秒内发送「${expression}」的结果，否则会被移出群聊。${commentLine}` } },
  ]);
}

export async function handleVerifyAnswer (groupId: string, userId: string, rawMessage: string, messageId: string): Promise<boolean> {
  const key = sessionKey(groupId, userId);
  const session = pluginState.sessions.get(key);
  if (!session) return false;
  const trimmed = rawMessage.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    // 非数字消息（图片、文字等）：自动撤回并提示
    await pluginState.callApi('delete_msg', { message_id: messageId });
    await pluginState.sendGroupMsg(groupId, [
      { type: 'at', data: { qq: userId } },
      { type: 'text', data: { text: ` 请发送数字答案，计算「${session.expression}」的结果。` } },
    ]);
    return true;
  }
  const userAnswer = parseInt(trimmed, 10);

  if (userAnswer === session.answer) {
    clearTimeout(session.timer);
    pluginState.sessions.delete(key);
    pluginState.log('info', `用户 ${userId} 在群 ${groupId} 验证通过`);
    await pluginState.sendGroupMsg(groupId, [
      { type: 'at', data: { qq: userId } },
      { type: 'text', data: { text: ' 验证通过，欢迎加入！' } },
    ]);
    return true;
  }

  session.attempts++;
  await pluginState.callApi('delete_msg', { message_id: messageId });
  if (session.attempts >= session.maxAttempts) {
    clearTimeout(session.timer);
    pluginState.sessions.delete(key);
    await pluginState.sendGroupMsg(groupId, [
      { type: 'at', data: { qq: userId } },
      { type: 'text', data: { text: ` 验证失败，你已用完 ${session.maxAttempts} 次机会，已被移出群聊。` } },
    ]);
    setTimeout(() => pluginState.callApi('set_group_kick', { group_id: groupId, user_id: userId, reject_add_request: false }), 1500);
  } else {
    const remaining = session.maxAttempts - session.attempts;
    await pluginState.sendGroupMsg(groupId, [
      { type: 'at', data: { qq: userId } },
      { type: 'text', data: { text: ` 回答错误，还剩 ${remaining} 次机会。请重新计算「${session.expression}」的结果。` } },
    ]);
  }
  return true;
}

export function clearAllSessions (): void {
  for (const session of pluginState.sessions.values()) clearTimeout(session.timer);
  pluginState.sessions.clear();
}
