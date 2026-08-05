// 阶梯式防爆破安全防护模块 (Security Rate Limiter)

// 内存尝试状态记录: key -> { attempts, lockCount, lockUntil }
const rateLimitMap = new Map();

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (data.lockUntil && (now - data.lockUntil > 24 * 60 * 60 * 1000)) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * 检查 IP / 账号是否处于防爆破封禁锁定状态
 */
function checkRateLimit(key, maxAttempts = 5) {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    return { isLocked: false, remainingSeconds: 0, currentAttempts: 0 };
  }

  if (record.lockUntil && record.lockUntil > now) {
    const remainingSeconds = Math.ceil((record.lockUntil - now) / 1000);
    return { isLocked: true, remainingSeconds, currentAttempts: record.attempts };
  }

  return { isLocked: false, remainingSeconds: 0, currentAttempts: record.attempts };
}

/**
 * 记录密码验证失败，触发阶梯式安全锁定
 */
function recordFailure(key, maxAttempts = 5) {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record) {
    record = { attempts: 1, lockCount: 0, lockUntil: null };
  } else {
    record.attempts += 1;
  }

  if (record.attempts >= maxAttempts) {
    record.lockCount += 1;
    let lockTimeMs = 30 * 60 * 1000; // 30 分钟

    if (record.lockCount === 2) {
      lockTimeMs = 2 * 60 * 60 * 1000; // 2 小时
    } else if (record.lockCount >= 3) {
      lockTimeMs = 24 * 60 * 60 * 1000; // 24 小时
    }

    record.lockUntil = now + lockTimeMs;
    console.warn(`[SECURITY LOCKOUT] 防爆破触发! IP/Key [${key}] 锁定 ${lockTimeMs / 1000 / 60} 分钟`);
  }

  rateLimitMap.set(key, record);
  return record;
}

/**
 * 验证成功清空失败次数
 */
function recordSuccess(key) {
  const record = rateLimitMap.get(key);
  if (record) {
    record.attempts = 0;
    record.lockUntil = null;
    rateLimitMap.set(key, record);
  }
}

module.exports = {
  checkRateLimit,
  recordFailure,
  recordSuccess
};
