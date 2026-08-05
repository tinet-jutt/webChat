const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config, updateAdminPassword, getPublicRooms, getAdminRooms, upsertRoom, deleteRoom } = require('../config');
const { checkRateLimit, recordFailure, recordSuccess } = require('../security');

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown-ip';
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('只能上传图片文件！'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 1. 获取公开房间列表
router.get('/rooms', (req, res) => {
  res.json({
    success: true,
    rooms: getPublicRooms()
  });
});

// 2. 图片上传接口
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择要上传的图片' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  return res.json({
    success: true,
    imageUrl: imageUrl
  });
});

// 3. 管理员登录校验
router.post('/admin/login', async (req, res) => {
  const clientIp = getClientIp(req);
  const lockKey = `admin-login-${clientIp}`;

  const limitStatus = checkRateLimit(lockKey, 5);
  if (limitStatus.isLocked) {
    await delay(500);
    return res.status(429).json({
      success: false,
      message: `密码连续错误次数过多！请等待 ${limitStatus.remainingSeconds} 秒后再试`
    });
  }

  const { password } = req.body;
  if (password === config.adminPassword) {
    recordSuccess(lockKey);
    return res.json({
      success: true,
      token: 'admin-authenticated-token'
    });
  } else {
    const failRecord = recordFailure(lockKey, 5);
    await delay(600);

    if (failRecord.attempts >= 5) {
      const lockMinutes = Math.ceil((failRecord.lockUntil - Date.now()) / 1000 / 60);
      return res.status(429).json({
        success: false,
        message: `密码连续错误 5 次！已被触发高强度安全防爆破保护，封禁 ${lockMinutes} 分钟！`
      });
    }

    const remainingAttempts = 5 - failRecord.attempts;
    return res.status(401).json({
      success: false,
      message: `管理员密码错误！还剩 ${remainingAttempts} 次尝试机会`
    });
  }
});

// 4. 修改管理员密码
router.post('/admin/change-password', async (req, res) => {
  const token = req.headers['authorization'];
  if (token !== 'admin-authenticated-token') {
    return res.status(401).json({ success: false, message: '未授权管理权限' });
  }

  const clientIp = getClientIp(req);
  const lockKey = `admin-change-pass-${clientIp}`;

  const limitStatus = checkRateLimit(lockKey, 5);
  if (limitStatus.isLocked) {
    await delay(500);
    return res.status(429).json({
      success: false,
      message: `原密码验证错误次数过多！请等待 ${limitStatus.remainingSeconds} 秒后再试`
    });
  }

  const { oldPassword, newPassword } = req.body;
  if (oldPassword !== config.adminPassword) {
    const failRecord = recordFailure(lockKey, 5);
    await delay(600);
    return res.status(400).json({
      success: false,
      message: `原管理员密码输入错误！(还剩 ${5 - failRecord.attempts} 次尝试机会)`
    });
  }

  if (!newPassword || newPassword.trim() === '') {
    return res.status(400).json({ success: false, message: '新密码不能为空' });
  }

  recordSuccess(lockKey);
  updateAdminPassword(newPassword);

  res.json({
    success: true,
    message: '管理员密码修改成功！'
  });
});

// 5. 管理员获取指定房间的在线用户
router.get('/admin/users/:roomId', (req, res) => {
  const token = req.headers['authorization'];
  if (token !== 'admin-authenticated-token') {
    return res.status(401).json({ success: false, message: '未授权管理权限' });
  }

  const roomId = req.params.roomId;
  const io = req.app.get('io');
  const users = [];

  if (io && io.sockets) {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket && targetSocket.userData) {
          users.push({
            socketId: targetSocket.id,
            username: targetSocket.userData.username,
            avatarColor: targetSocket.userData.avatarColor,
            roomId: targetSocket.userData.roomId
          });
        }
      }
    }
  }

  res.json({
    success: true,
    users: users
  });
});

// 6. 管理员获取所有房间列表
router.get('/admin/rooms', (req, res) => {
  const token = req.headers['authorization'];
  if (token !== 'admin-authenticated-token') {
    return res.status(401).json({ success: false, message: '未授权管理权限' });
  }
  res.json({
    success: true,
    rooms: getAdminRooms()
  });
});

// 7. 管理员创建或编辑指定房间 (口令修改全员强制下线)
router.post('/admin/rooms', (req, res) => {
  const token = req.headers['authorization'];
  if (token !== 'admin-authenticated-token') {
    return res.status(401).json({ success: false, message: '未授权管理权限' });
  }

  const { id, name, isCodeRequired, roomCode } = req.body;
  if (!id || !name) {
    return res.status(400).json({ success: false, message: '房间ID与名称不能为空' });
  }

  // 检查之前房间的配置
  const oldRoom = config.rooms.get(id);
  const oldIsCodeRequired = oldRoom ? oldRoom.isCodeRequired : false;
  const oldRoomCode = oldRoom ? oldRoom.roomCode : '';

  // 更新房间
  const room = upsertRoom(id, name, isCodeRequired, roomCode);

  // 判断口令是否发生了开启/关闭或更改
  const isCodeChanged = (oldIsCodeRequired !== !!isCodeRequired) || (oldRoomCode !== (roomCode || ''));

  const io = req.app.get('io');
  if (io) {
    // 1) 广播房间列表更新
    io.emit('rooms_updated', {
      rooms: getPublicRooms(),
      message: `管理员更新了房间列表/设置`
    });

    // 2) 如果口令更新了，使该房间当前在线的所有设备强制断开下线！
    if (isCodeChanged && io.sockets) {
      const roomSockets = io.sockets.adapter.rooms.get(id);
      if (roomSockets) {
        const socketIds = Array.from(roomSockets);
        socketIds.forEach(socketId => {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
            targetSocket.emit('room_code_changed', {
              roomId: id,
              roomName: name,
              message: `房间【${name}】保密口令已被管理员重置，您已被安全踢下线，请输入最新口令连接！`
            });
            targetSocket.disconnect(true);
          }
        });
      }
    }
  }

  res.json({
    success: true,
    message: isCodeChanged ? '房间配置保存成功！在线设备已安全下线重置' : '房间配置保存成功',
    room: {
      id: room.id,
      name: room.name,
      isCodeRequired: room.isCodeRequired,
      roomCode: room.roomCode
    }
  });
});

// 8. 管理员清空指定房间历史
router.post('/admin/rooms/:id/clear', (req, res) => {
  const token = req.headers['authorization'];
  if (token !== 'admin-authenticated-token') {
    return res.status(401).json({ success: false, message: '未授权管理权限' });
  }

  const roomId = req.params.id;
  const room = config.rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }

  room.clearHistory();

  const io = req.app.get('io');
  if (io) {
    io.to(roomId).emit('history_cleared', { message: `管理员已清空【${room.name}】的聊天历史` });
  }

  res.json({ success: true, message: '聊天历史已清空' });
});

module.exports = router;
