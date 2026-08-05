// 多房间系统配置、内存状态管理与持久化落盘 (JSON File Persistence)
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
const roomsDataFile = path.join(dataDir, 'rooms.json');
const configDataFile = path.join(dataDir, 'config.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class Room {
  constructor(id, name, isCodeRequired = false, roomCode = '', recentMessages = []) {
    this.id = id;
    this.name = name;
    this.isCodeRequired = isCodeRequired;
    this.roomCode = roomCode;
    this.recentMessages = recentMessages || [];
  }

  addMessage(msg) {
    this.recentMessages.push(msg);
    if (this.recentMessages.length > 100) {
      this.recentMessages.shift();
    }
    saveRoomsToDisk();
  }

  clearHistory() {
    this.recentMessages = [];
    saveRoomsToDisk();
  }

  getHistory() {
    return this.recentMessages;
  }
}

// 内存中的 Map 结构
const roomsMap = new Map();

// 初始系统配置
const config = {
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  maxHistoryMessages: 100,
  rooms: roomsMap
};

// 1. 从磁盘加载持久化配置与房间数据
function loadDataFromDisk() {
  try {
    if (fs.existsSync(configDataFile)) {
      const configRaw = fs.readFileSync(configDataFile, 'utf8');
      const savedConfig = JSON.parse(configRaw);
      if (savedConfig.adminPassword) {
        config.adminPassword = savedConfig.adminPassword;
      }
    }

    if (fs.existsSync(roomsDataFile)) {
      const roomsRaw = fs.readFileSync(roomsDataFile, 'utf8');
      const roomsArray = JSON.parse(roomsRaw);
      if (Array.isArray(roomsArray)) {
        roomsMap.clear();
        roomsArray.forEach(r => {
          roomsMap.set(r.id, new Room(r.id, r.name, r.isCodeRequired, r.roomCode, r.recentMessages));
        });
        console.log(`📂 [Persistence Loaded] 成功从磁盘数据卷恢复了 ${roomsMap.size} 个房间数据！`);
      }
    }
  } catch (err) {
    console.error('读取持久化磁盘数据失败:', err);
  }
}

// 2. 将房间数据写回磁盘
function saveRoomsToDisk() {
  try {
    const list = [];
    for (const [id, room] of roomsMap.entries()) {
      list.push({
        id: room.id,
        name: room.name,
        isCodeRequired: room.isCodeRequired,
        roomCode: room.roomCode,
        recentMessages: room.recentMessages
      });
    }
    fs.writeFileSync(roomsDataFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('保存房间数据至磁盘失败:', err);
  }
}

// 3. 将管理员配置写回磁盘
function saveConfigToDisk() {
  try {
    fs.writeFileSync(configDataFile, JSON.stringify({
      adminPassword: config.adminPassword
    }, null, 2), 'utf8');
  } catch (err) {
    console.error('保存管理员配置至磁盘失败:', err);
  }
}

// 启动时自动执行落盘数据加载
loadDataFromDisk();

// 修改管理员密码
function updateAdminPassword(newPassword) {
  if (newPassword && newPassword.trim() !== '') {
    config.adminPassword = newPassword.trim();
    saveConfigToDisk();
    return true;
  }
  return false;
}

// 获取所有公开的房间列表
function getPublicRooms() {
  const list = [];
  for (const [id, room] of config.rooms.entries()) {
    list.push({
      id: room.id,
      name: room.name,
      isCodeRequired: room.isCodeRequired
    });
  }
  return list;
}

// 管理员获取完整房间列表 (包含口令)
function getAdminRooms() {
  const list = [];
  for (const [id, room] of config.rooms.entries()) {
    list.push({
      id: room.id,
      name: room.name,
      isCodeRequired: room.isCodeRequired,
      roomCode: room.roomCode
    });
  }
  return list;
}

// 创建或修改房间
function upsertRoom(id, name, isCodeRequired, roomCode) {
  let room = config.rooms.get(id);
  if (room) {
    if (name) room.name = name;
    if (typeof isCodeRequired === 'boolean') room.isCodeRequired = isCodeRequired;
    if (roomCode !== undefined) room.roomCode = roomCode;
  } else {
    room = new Room(id, name, isCodeRequired, roomCode);
    config.rooms.set(id, room);
  }
  saveRoomsToDisk();
  return room;
}

// 删除房间
function deleteRoom(id) {
  const res = config.rooms.delete(id);
  saveRoomsToDisk();
  return res;
}

module.exports = {
  config,
  updateAdminPassword,
  getPublicRooms,
  getAdminRooms,
  upsertRoom,
  deleteRoom
};
