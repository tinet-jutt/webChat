const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { config, getPublicRooms } = require('./config');
const { checkRateLimit, recordFailure, recordSuccess } = require('./security');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

// 独立管理员页面路由
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.use('/api', apiRoutes);

function generateColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

// 广播在线人数更新
function broadcastOnlineUsers(roomId) {
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  const count = roomSockets ? roomSockets.size : 0;
  const users = [];

  if (roomSockets) {
    for (const socketId of roomSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.userData) {
        users.push({
          socketId: socket.id,
          username: socket.userData.username,
          avatarColor: socket.userData.avatarColor
        });
      }
    }
  }

  io.to(roomId).emit('online_users_update', {
    roomId,
    count,
    users
  });
}

// Socket 连接逻辑
io.on('connection', (socket) => {
  let currentRoomId = null;

  // 加入房间
  socket.on('join_room', ({ username, roomCode, roomId }, callback) => {
    if (!username || username.trim() === '') {
      if (callback) callback({ success: false, message: '用户名不能为空' });
      return;
    }

    const targetRoomId = roomId;
    if (!targetRoomId) {
      if (callback) callback({ success: false, message: '请选择有效的房间' });
      return;
    }

    const targetRoom = config.rooms.get(targetRoomId);
    if (!targetRoom) {
      if (callback) callback({ success: false, message: '该房间不存在或已被删除' });
      return;
    }

    const cleanUsername = username.trim();
    const lockKey = `socket-join-${cleanUsername}-${targetRoomId}`;

    // 1. 校验房间口令
    if (targetRoom.isCodeRequired) {
      if (!roomCode || roomCode.trim() !== targetRoom.roomCode) {
        const failRecord = recordFailure(lockKey, 5);
        if (callback) callback({
          success: false,
          message: `房间【${targetRoom.name}】口令错误！还剩 ${5 - failRecord.attempts} 次尝试机会`
        });
        return;
      }
    }

    recordSuccess(lockKey);

    // 2. 口令验证成功后，校验该房间内是否存在同名在线用户 (大小写不敏感)
    const existingRoomSockets = io.sockets.adapter.rooms.get(targetRoomId);
    if (existingRoomSockets) {
      for (const existingSocketId of existingRoomSockets) {
        if (existingSocketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket && existingSocket.userData && existingSocket.userData.username) {
            if (existingSocket.userData.username.trim().toLowerCase() === cleanUsername.toLowerCase()) {
              if (callback) callback({
                success: false,
                message: `房间【${targetRoom.name}】已存在名为 "${cleanUsername}" 的在线成员，请更换昵称`
              });
              return;
            }
          }
        }
      }
    }

    // 离开前一个房间
    if (currentRoomId) {
      socket.leave(currentRoomId);
      const oldRoomId = currentRoomId;
      currentRoomId = null;
      broadcastOnlineUsers(oldRoomId);
    }

    // 加入新房间
    currentRoomId = targetRoomId;
    socket.join(currentRoomId);

    socket.userData = {
      username: cleanUsername,
      avatarColor: generateColor(cleanUsername),
      roomId: currentRoomId
    };

    // 响应客户端加入成功
    if (callback) {
      callback({
        success: true,
        user: {
          socketId: socket.id,
          username: cleanUsername,
          avatarColor: socket.userData.avatarColor
        },
        room: {
          id: targetRoom.id,
          name: targetRoom.name,
          isCodeRequired: targetRoom.isCodeRequired
        }
      });
    }

    // 发送历史消息给该用户
    socket.emit('history_messages', targetRoom.getHistory());

    // 广播在线人数
    broadcastOnlineUsers(currentRoomId);
  });

  // 发送消息
  socket.on('send_message', (data) => {
    if (!currentRoomId || !socket.userData) {
      socket.emit('error_message', { message: '您未加入任何聊天房间！' });
      return;
    }

    const targetRoom = config.rooms.get(currentRoomId);
    if (!targetRoom) return;

    let msgObj = null;

    if (data.type === 'text' && data.text && data.text.trim()) {
      msgObj = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        type: 'text',
        sender: socket.userData.username,
        senderId: socket.id,
        avatarColor: socket.userData.avatarColor,
        text: data.text.trim(),
        timestamp: Date.now()
      };
    } else if (data.type === 'image' && data.imageUrl) {
      msgObj = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        type: 'image',
        sender: socket.userData.username,
        senderId: socket.id,
        avatarColor: socket.userData.avatarColor,
        imageUrl: data.imageUrl,
        timestamp: Date.now()
      };
    }

    if (msgObj) {
      targetRoom.addMessage(msgObj);
      io.to(currentRoomId).emit('new_message', msgObj);
    }
  });

  // 断开连接处理
  socket.on('disconnect', () => {
    if (currentRoomId) {
      const oldRoomId = currentRoomId;
      currentRoomId = null;
      broadcastOnlineUsers(oldRoomId);
    }
  });
});

const PORT = process.env.PORT || 7001;
server.listen(PORT, () => {
  console.log(`\n=================================`);
  console.log(`🚀 WebChat H5 多房间聊天服务器 (带防爆破保护) 已启动!`);
  console.log(`✨ [Watchtower Verified] 自动部署更新已成功生效！`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`=================================\n`);
});
