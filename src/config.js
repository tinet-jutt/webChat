// 多房间系统配置与内存状态管理

class Room {
  constructor(id, name, isCodeRequired = false, roomCode = '') {
    this.id = id;
    this.name = name;
    this.isCodeRequired = isCodeRequired;
    this.roomCode = roomCode;
    this.recentMessages = [];
  }

  addMessage(msg) {
    this.recentMessages.push(msg);
    if (this.recentMessages.length > 50) {
      this.recentMessages.shift();
    }
  }

  clearHistory() {
    this.recentMessages = [];
  }

  getHistory() {
    return this.recentMessages;
  }
}

// 初始没有任何默认预置房间，完全由管理员自行创建与运维
const initialRooms = new Map();

const config = {
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  maxHistoryMessages: 50,
  rooms: initialRooms
};

// 修改管理员密码
function updateAdminPassword(newPassword) {
  if (newPassword && newPassword.trim() !== '') {
    config.adminPassword = newPassword.trim();
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
  return room;
}

// 删除房间
function deleteRoom(id) {
  return config.rooms.delete(id);
}

module.exports = {
  config,
  updateAdminPassword,
  getPublicRooms,
  getAdminRooms,
  upsertRoom,
  deleteRoom
};
