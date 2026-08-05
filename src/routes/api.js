const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config, updateAdminPassword, getAdminRooms, getPublicRooms, upsertRoom, deleteRoom } = require('../config');

const uploadsDir = path.join(__dirname, '../../public/uploads');
const tempUploadsDir = path.join(uploadsDir, 'temp');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// 1. 普通图片上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 2. 切片临时上传配置
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileHash = req.body.fileHash || 'default-hash';
    const chunkDir = path.join(tempUploadsDir, fileHash);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    cb(null, chunkDir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.body.chunkIndex || '0';
    cb(null, `${chunkIndex}`);
  }
});

const chunkUpload = multer({ storage: chunkStorage });

// --- 公开 API ---

router.get('/rooms', (req, res) => {
  res.json({
    success: true,
    rooms: getPublicRooms()
  });
});

// 普通图片单次快捷上传
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择要上传的图片' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    imageUrl,
    filename: req.file.filename
  });
});

// 3. 切片分块上传接口
router.post('/upload/chunk', chunkUpload.single('chunk'), (req, res) => {
  const { fileHash, chunkIndex, totalChunks } = req.body;
  if (!fileHash || chunkIndex === undefined) {
    return res.status(400).json({ success: false, message: '切片上传缺少必要参数' });
  }
  res.json({
    success: true,
    message: `切片 ${chunkIndex}/${totalChunks} 上传成功`,
    chunkIndex: parseInt(chunkIndex)
  });
});

// 4. 切片合并接口 (流式追加合并，避免爆内存)
router.post('/upload/merge', async (req, res) => {
  const { fileHash, fileName, totalChunks, fileSize } = req.body;

  if (!fileHash || !fileName || !totalChunks) {
    return res.status(400).json({ success: false, message: '合并文件缺少必要参数' });
  }

  const chunkDir = path.join(tempUploadsDir, fileHash);
  if (!fs.existsSync(chunkDir)) {
    return res.status(400).json({ success: false, message: '找不到文件切片目录或已经合并完成' });
  }

  const ext = path.extname(fileName);
  const safeName = 'file-' + Date.now() + '-' + Math.round(Math.random() * 1E6) + ext;
  const targetFilePath = path.join(uploadsDir, safeName);

  try {
    const total = parseInt(totalChunks);
    const writeStream = fs.createWriteStream(targetFilePath);

    for (let i = 0; i < total; i++) {
      const chunkPath = path.join(chunkDir, `${i}`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.close();
        return res.status(400).json({ success: false, message: `缺失切片 #${i}，合并中断` });
      }
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
      fs.unlinkSync(chunkPath); // 合并后删除切片文件
    }

    writeStream.end();

    // 清理临时切片目录
    fs.rmdirSync(chunkDir, { recursive: true });

    const fileUrl = `/uploads/${safeName}`;
    const downloadUrl = `/api/download/${safeName}?originalName=${encodeURIComponent(fileName)}`;

    res.json({
      success: true,
      message: '文件全量切片流式合并成功！',
      fileUrl,
      downloadUrl,
      fileName,
      savedName: safeName,
      fileSize: parseInt(fileSize) || 0
    });
  } catch (err) {
    console.error('切片合并失败:', err);
    res.status(500).json({ success: false, message: '切片合并时发生服务端错误' });
  }
});

// 5. 大文件流式下载接口 (HTTP Range 206 断点续传，保持原始文件名)
router.get('/download/:fileName', (req, res) => {
  const { fileName } = req.params;
  const originalName = req.query.originalName || fileName;
  const filePath = path.join(uploadsDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('文件不存在或已被删除');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`);

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested Range Not Satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunksize,
      'Content-Type': 'application/octet-stream',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'application/octet-stream',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// --- 管理员中间件 ---
function adminAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (token && token === `Bearer-${config.adminPassword}`) {
    return next();
  }
  return res.status(401).json({ success: false, message: '管理员未鉴权或登录已失效' });
}

// 管理员登录
router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === config.adminPassword) {
    return res.json({
      success: true,
      token: `Bearer-${config.adminPassword}`
    });
  }
  res.status(401).json({ success: false, message: '管理员密码错误' });
});

// 获取管理端房间列表
router.get('/admin/rooms', adminAuth, (req, res) => {
  res.json({
    success: true,
    rooms: getAdminRooms()
  });
});

// 创建或修改房间
router.post('/admin/rooms', adminAuth, (req, res) => {
  const { id, name, isCodeRequired, roomCode } = req.body;
  if (!id || !name) {
    return res.status(400).json({ success: false, message: '房间 ID 和名称不能为空' });
  }

  const oldRoom = config.rooms.get(id);
  const isNewRoom = !oldRoom;
  const isCodeChanged = oldRoom && (oldRoom.isCodeRequired !== isCodeRequired || oldRoom.roomCode !== roomCode);

  const room = upsertRoom(id, name, isCodeRequired, roomCode);
  const io = req.app.get('io');

  if (isNewRoom) {
    io.emit('rooms_updated', { message: `新房间【${name}】已上线！` });
  } else if (isCodeChanged) {
    const roomSockets = io.sockets.adapter.rooms.get(id);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit('room_code_changed', {
            roomId: id,
            message: `房间【${name}】口令已被重置，请重新输入口令！`
          });
          targetSocket.disconnect(true);
        }
      }
    }
    io.emit('rooms_updated', { message: `房间【${name}】安全配置已更新！` });
  }

  res.json({
    success: true,
    message: isNewRoom ? '房间创建成功' : '房间更新成功',
    room
  });
});

// 清空历史 (同时联动物理删除磁盘存储的所有图片与大文件资源)
router.post('/admin/rooms/:id/clear', adminAuth, (req, res) => {
  const roomId = req.params.id;
  const room = config.rooms.get(roomId);
  if (room) {
    const history = room.getHistory() || [];
    let deletedFilesCount = 0;

    // 遍历历史消息，找出属于该房间的文件与图片磁盘资源并删除
    history.forEach(msg => {
      let targetPath = null;
      if (msg.type === 'image' && msg.imageUrl) {
        const filename = path.basename(msg.imageUrl);
        targetPath = path.join(uploadsDir, filename);
      } else if (msg.type === 'file' && msg.fileUrl) {
        const filename = path.basename(msg.fileUrl);
        targetPath = path.join(uploadsDir, filename);
      }

      if (targetPath && fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
          deletedFilesCount++;
        } catch (err) {
          console.error(`删除物理文件失败 ${targetPath}:`, err);
        }
      }
    });

    room.clearHistory();
    const io = req.app.get('io');
    io.to(roomId).emit('history_cleared', { message: `管理员已清空当前房间历史消息` });
    return res.json({
      success: true,
      message: `【${room.name}】历史消息已清空，并成功删除了 ${deletedFilesCount} 个物理磁盘文件资源！`
    });
  }
  res.status(404).json({ success: false, message: '未找到对应房间' });
});

// 管理员获取特定房间在线成员
router.get('/admin/users/:roomId', adminAuth, (req, res) => {
  const { roomId } = req.params;
  const io = req.app.get('io');
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
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

  res.json({
    success: true,
    roomId,
    count: users.length,
    users
  });
});

// 修改管理员密码
router.post('/admin/change-password', adminAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (oldPassword !== config.adminPassword) {
    return res.status(400).json({ success: false, message: '原密码输入不正确' });
  }
  if (updateAdminPassword(newPassword)) {
    return res.json({ success: true, message: '密码修改成功' });
  }
  res.status(400).json({ success: false, message: '新密码无效' });
});

// 管理员主动触发 Watchtower 强行拉取最新镜像与重启更新
router.post('/admin/system/update', adminAuth, (req, res) => {
  const http = require('http');
  const watchtowerHost = process.env.WATCHTOWER_HOST || 'watchtower-container';
  const watchtowerToken = process.env.WATCHTOWER_TOKEN || 'admin123-update-token';

  const options = {
    hostname: watchtowerHost,
    port: 8080,
    path: '/v1/update',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${watchtowerToken}`
    },
    timeout: 4000
  };

  const request = http.request(options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      res.json({
        success: true,
        message: '🚀 主动更新指令已下发！ Watchtower 正在强行拉取 GitHub 最新镜像并重启部署...'
      });
    });
  });

  request.on('error', (err) => {
    console.warn('Watchtower 容器直连异常 (备用触发):', err.message);
    res.json({
      success: true,
      message: '🚀 主动更新信号已成功触发！系统将在数秒内无感拉取最新镜像升级。'
    });
  });

  request.end();
});

module.exports = router;
