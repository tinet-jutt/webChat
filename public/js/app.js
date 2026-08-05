// H5 Web Chat 前端 用户体验、大文件分片上传与流式下载
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  let currentUser = null;
  let currentRoomId = '';
  let availableRooms = [];
  let currentOnlineUsers = [];
  let currentPreviewUrl = '';

  const lockBadge = document.getElementById('lock-badge');
  const lockStatusText = document.getElementById('lock-status-text');
  const onlineCount = document.getElementById('online-count');
  const btnShowOnlineUsers = document.getElementById('btn-show-online-users');
  const userProfileBadge = document.getElementById('user-profile-badge');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  const currentUserName = document.getElementById('current-user-name');

  const messagesContainer = document.getElementById('messages-container');
  const msgInput = document.getElementById('msg-input');
  const btnSendMsg = document.getElementById('btn-send-msg');
  const btnUploadTrigger = document.getElementById('btn-upload-trigger');
  const imgInput = document.getElementById('img-input');

  const btnFileTrigger = document.getElementById('btn-file-trigger');
  const fileInput = document.getElementById('file-input');

  const uploadProgressCard = document.getElementById('upload-progress-card');
  const progressFilename = document.getElementById('progress-filename');
  const progressPercentText = document.getElementById('progress-percent-text');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressStatusSub = document.getElementById('progress-status-sub');

  const headerSelectWrapper = document.getElementById('header-select-wrapper');
  const headerSelectTrigger = document.getElementById('header-select-trigger');
  const headerSelectedLabel = document.getElementById('header-selected-label');
  const headerSelectOptions = document.getElementById('header-select-options');

  const joinModal = document.getElementById('join-modal');
  const closeJoinModal = document.getElementById('close-join-modal');
  const joinForm = document.getElementById('join-form');
  const joinSelectWrapper = document.getElementById('join-select-wrapper');
  const joinSelectTrigger = document.getElementById('join-select-trigger');
  const joinSelectedLabel = document.getElementById('join-selected-label');
  const joinSelectOptions = document.getElementById('join-select-options');

  const joinUsername = document.getElementById('join-username');
  const roomCodeGroup = document.getElementById('room-code-group');
  const joinRoomCode = document.getElementById('join-room-code');

  const onlineUsersModal = document.getElementById('online-users-modal');
  const closeOnlineUsersModal = document.getElementById('close-online-users-modal');
  const userOnlineList = document.getElementById('user-online-list');

  const imageModal = document.getElementById('image-modal');
  const previewImgElement = document.getElementById('preview-img-element');
  const btnDownloadImage = document.getElementById('btn-download-image');
  const btnCloseImageModal = document.getElementById('btn-close-image-modal');

  const toast = document.getElementById('toast');

  // 下拉选单驱动
  function setupSelectDropdown(wrapper, trigger) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        if (w !== wrapper) w.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => {
      w.classList.remove('open');
    });
  });

  setupSelectDropdown(headerSelectWrapper, headerSelectTrigger);
  setupSelectDropdown(joinSelectWrapper, joinSelectTrigger);

  // 初始化
  fetchRooms();

  function fetchRooms(autoLogin = true) {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.rooms)) {
          availableRooms = data.rooms;
          renderAllCustomSelects();
          updateCurrentRoomUI();
          if (autoLogin && availableRooms.length > 0) {
            autoJoinIfSaved();
          } else if (availableRooms.length === 0) {
            joinModal.classList.add('active');
          }
        }
      })
      .catch(err => console.error('获取房间列表失败:', err));
  }

  function renderAllCustomSelects() {
    if (availableRooms.length === 0) {
      currentRoomId = '';
      headerSelectedLabel.textContent = '暂无可用房间';
      joinSelectedLabel.textContent = '暂无可用房间';
      headerSelectOptions.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">暂无已开启房间，请联系管理员</div>`;
      joinSelectOptions.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">暂无已开启房间，请联系管理员</div>`;
      return;
    }

    const curRoom = availableRooms.find(r => r.id === currentRoomId) || availableRooms[0];
    if (curRoom) {
      currentRoomId = curRoom.id;
      headerSelectedLabel.textContent = curRoom.name;
      joinSelectedLabel.textContent = curRoom.name;
    }

    renderOptions(headerSelectOptions, (roomId) => {
      headerSelectWrapper.classList.remove('open');
      switchRoom(roomId);
    });

    renderOptions(joinSelectOptions, (roomId) => {
      joinSelectWrapper.classList.remove('open');
      currentRoomId = roomId;
      headerSelectedLabel.textContent = (availableRooms.find(r => r.id === roomId) || {}).name || roomId;
      joinSelectedLabel.textContent = (availableRooms.find(r => r.id === roomId) || {}).name || roomId;
      updateCurrentRoomUI();
      const savedCode = localStorage.getItem(`chat_room_code_${roomId}`) || '';
      joinRoomCode.value = savedCode;
    });
  }

  function renderOptions(container, onSelect) {
    if (availableRooms.length === 0) return;

    let html = '';
    const lockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    availableRooms.forEach(room => {
      const isSelected = room.id === currentRoomId;
      html += `
        <div class="custom-select-option ${isSelected ? 'selected' : ''}" data-id="${room.id}">
          <span>${escapeHtml(room.name)}</span>
          ${room.isCodeRequired ? `<span class="badge-lock" style="display:inline-flex;align-items:center;gap:3px;">${lockSvg} 口令</span>` : ''}
        </div>
      `;
    });
    container.innerHTML = html;

    container.querySelectorAll('.custom-select-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = option.getAttribute('data-id');
        onSelect(roomId);
      });
    });
  }

  function updateCurrentRoomUI() {
    if (availableRooms.length === 0) {
      headerSelectedLabel.textContent = '暂无可用房间';
      joinSelectedLabel.textContent = '暂无可用房间';
      lockBadge.classList.add('unlocked');
      lockStatusText.textContent = '未开启房间';
      roomCodeGroup.style.display = 'none';
      joinRoomCode.required = false;
      onlineCount.textContent = '0 人在线';
      messagesContainer.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted); font-size:13px;">暂无已开放的房间，请先在管理员后台控制台创建新房间。</div>`;
      return;
    }

    const curRoom = availableRooms.find(r => r.id === currentRoomId);
    if (curRoom) {
      headerSelectedLabel.textContent = curRoom.name;
      joinSelectedLabel.textContent = curRoom.name;

      if (curRoom.isCodeRequired) {
        lockBadge.classList.remove('unlocked');
        lockStatusText.textContent = '已开启口令';
        roomCodeGroup.style.display = 'flex';
        joinRoomCode.required = true;
      } else {
        lockBadge.classList.add('unlocked');
        lockStatusText.textContent = '无需口令';
        roomCodeGroup.style.display = 'none';
        joinRoomCode.required = false;
      }
    }
  }

  function updateUserProfileUI() {
    if (currentUser && currentUser.username) {
      currentUserName.textContent = currentUser.username;
      const firstLetter = currentUser.username.charAt(0).toUpperCase();
      currentUserAvatar.textContent = firstLetter;
      currentUserAvatar.style.background = currentUser.avatarColor || 'var(--primary)';
    } else {
      currentUserName.textContent = '未登录';
      currentUserAvatar.textContent = '?';
      currentUserAvatar.style.background = 'rgba(255,255,255,0.2)';
    }
  }

  userProfileBadge.addEventListener('click', () => {
    joinModal.classList.add('active');
  });

  btnShowOnlineUsers.addEventListener('click', () => {
    renderUserOnlineModalList();
    onlineUsersModal.classList.add('active');
  });

  if (closeOnlineUsersModal) {
    closeOnlineUsersModal.addEventListener('click', () => {
      onlineUsersModal.classList.remove('active');
    });
  }

  function renderUserOnlineModalList() {
    if (!currentOnlineUsers || currentOnlineUsers.length === 0) {
      userOnlineList.innerHTML = `<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:12px;">当前房间暂无在线成员</div>`;
      return;
    }

    let html = '';
    currentOnlineUsers.forEach(u => {
      const avatarBg = u.avatarColor || 'linear-gradient(135deg, #6366f1, #4f46e5)';
      const firstLetter = u.username ? u.username.charAt(0).toUpperCase() : '?';
      const isMe = currentUser && u.username === currentUser.username;

      html += `
        <div class="admin-user-item">
          <div class="admin-user-info">
            <div class="user-mini-avatar" style="background:${avatarBg}">${firstLetter}</div>
            <span class="admin-user-name">${escapeHtml(u.username)} ${isMe ? '<span style="font-size:10px; color:#818cf8; margin-left:4px;">(你)</span>' : ''}</span>
          </div>
          <span style="font-size:11.5px; color:#4ade80; display:inline-flex; align-items:center; gap:4px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#4ade80;"></span> 在线
          </span>
        </div>
      `;
    });
    userOnlineList.innerHTML = html;
  }

  function switchRoom(roomId) {
    currentRoomId = roomId;
    updateCurrentRoomUI();

    const username = localStorage.getItem('chat_username') || (currentUser ? currentUser.username : '');
    const savedRoomCode = localStorage.getItem(`chat_room_code_${roomId}`) || '';

    const curRoom = availableRooms.find(r => r.id === roomId);

    if (curRoom && curRoom.isCodeRequired && !savedRoomCode) {
      if (username) joinUsername.value = username;
      joinRoomCode.value = '';
      joinModal.classList.add('active');
      return;
    }

    if (username) {
      doJoinRoom(username, savedRoomCode, roomId);
    } else {
      joinModal.classList.add('active');
    }
  }

  function autoJoinIfSaved() {
    if (availableRooms.length === 0) return;

    const savedUsername = localStorage.getItem('chat_username');
    const savedRoomCode = localStorage.getItem(`chat_room_code_${currentRoomId}`) || '';

    if (savedUsername) {
      joinUsername.value = savedUsername;
      joinRoomCode.value = savedRoomCode;

      const curRoom = availableRooms.find(r => r.id === currentRoomId);
      if (curRoom && curRoom.isCodeRequired && !savedRoomCode) {
        joinModal.classList.add('active');
        return;
      }

      doJoinRoom(savedUsername, savedRoomCode, currentRoomId);
    } else {
      joinModal.classList.add('active');
    }
  }

  function doJoinRoom(username, roomCode, roomId) {
    if (availableRooms.length === 0) {
      showToast('暂无可用房间，请先在管理员后台创建房间！', 'warning');
      return;
    }

    socket.emit('join_room', { username, roomCode, roomId }, (response) => {
      if (response && response.success) {
        currentUser = response.user;
        currentRoomId = response.room.id;
        localStorage.setItem('chat_username', username);
        if (roomCode) {
          localStorage.setItem(`chat_room_code_${currentRoomId}`, roomCode);
        }
        joinModal.classList.remove('active');
        renderAllCustomSelects();
        updateUserProfileUI();
        showToast(`已进入【${response.room.name}】`, 'success');
        msgInput.focus();
      } else {
        localStorage.removeItem(`chat_room_code_${roomId}`);
        joinModal.classList.add('active');
        showToast(response.message || '加入失败，请检查口令', 'error');
      }
    });
  }

  // 2. 加入房间表单
  if (closeJoinModal) {
    closeJoinModal.addEventListener('click', () => {
      joinModal.classList.remove('active');
    });
  }

  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (availableRooms.length === 0) {
      showToast('暂无可用房间，请联系管理员先创建房间', 'warning');
      return;
    }
    const username = joinUsername.value.trim();
    const roomCode = joinRoomCode.value.trim();

    if (!username) {
      showToast('请输入有效的用户名', 'warning');
      return;
    }

    doJoinRoom(username, roomCode, currentRoomId);
  });

  // 3. Socket 事件处理
  socket.on('connect', () => {
    if (currentUser && currentUser.username && currentRoomId) {
      const savedCode = localStorage.getItem(`chat_room_code_${currentRoomId}`) || '';
      doJoinRoom(currentUser.username, savedCode, currentRoomId);
    }
  });

  socket.on('error_message', (data) => {
    showToast(data.message || '发生错误', 'error');
    if (!currentUser && availableRooms.length > 0) {
      joinModal.classList.add('active');
    }
  });

  socket.on('room_code_changed', (data) => {
    currentUser = null;
    updateUserProfileUI();
    if (data.roomId) {
      localStorage.removeItem(`chat_room_code_${data.roomId}`);
    }
    showToast(data.message || '房间口令已被重置，请重新输入最新口令！', 'warning');
    joinModal.classList.add('active');
  });

  socket.on('online_users_update', (data) => {
    if (data.roomId === currentRoomId) {
      currentOnlineUsers = data.users || [];
      onlineCount.textContent = `${data.count} 人在线`;
      if (onlineUsersModal.classList.contains('active')) {
        renderUserOnlineModalList();
      }
    }
  });

  socket.on('history_messages', (messages) => {
    messagesContainer.innerHTML = '';
    if (Array.isArray(messages)) {
      messages.forEach(msg => appendMessage(msg));
    }
    scrollToBottom();
  });

  socket.on('new_message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  socket.on('rooms_updated', (data) => {
    fetchRooms(false);
    showToast(data.message || '房间列表更新', 'info');
  });

  socket.on('history_cleared', (data) => {
    messagesContainer.innerHTML = '';
    showToast(data.message, 'warning');
  });

  // 4. 消息追加渲染
  function appendMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('message-item');

    if (msg.type === 'system') {
      item.classList.add('system');
      item.innerHTML = `<div class="system-bubble">${escapeHtml(msg.text)}</div>`;
      messagesContainer.appendChild(item);
      return;
    }

    const isSelf = currentUser && (msg.senderId === currentUser.socketId || msg.sender === currentUser.username);
    item.classList.add(isSelf ? 'self' : 'other');

    const firstLetter = msg.sender ? msg.sender.charAt(0).toUpperCase() : '?';
    const avatarBg = msg.avatarColor || 'linear-gradient(135deg, #6366f1, #4f46e5)';
    const timeStr = formatTime(msg.timestamp);

    let contentHtml = '';
    if (msg.type === 'text') {
      contentHtml = `
        <div class="message-bubble">
          ${escapeHtml(msg.text)}
          <div class="bubble-footer">
            <span>${timeStr}</span>
            <button class="btn-action btn-copy-text" data-text="${escapeAttribute(msg.text)}" title="一键复制文字">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
      `;
    } else if (msg.type === 'image') {
      contentHtml = `
        <div class="message-bubble" style="padding: 4px; background: transparent; border: none;">
          <div class="chat-img-wrap" data-src="${msg.imageUrl}">
            <img src="${msg.imageUrl}" class="chat-img" alt="图片消息" loading="lazy">
            <div class="img-download-overlay" data-src="${msg.imageUrl}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              下载
            </div>
          </div>
          <div class="bubble-footer" style="margin-top: 2px;">
            <span>${timeStr}</span>
          </div>
        </div>
      `;
    } else if (msg.type === 'file') {
      const ext = getFileExtension(msg.fileName);
      const formattedSize = formatBytes(msg.fileSize);
      const downloadTarget = msg.downloadUrl || msg.fileUrl;

      contentHtml = `
        <div class="file-message-card">
          <div class="file-icon-box">${escapeHtml(ext)}</div>
          <div class="file-meta-info">
            <span class="file-name-title" title="${escapeAttribute(msg.fileName)}">${escapeHtml(msg.fileName)}</span>
            <span class="file-size-subtitle">${formattedSize} • 流式传输</span>
          </div>
          <a href="${downloadTarget}" class="btn-file-stream-download" download="${escapeAttribute(msg.fileName)}" target="_blank" title="流式断点下载">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            下载
          </a>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="user-avatar" style="background: ${avatarBg}">${firstLetter}</div>
      <div class="message-content">
        ${!isSelf ? `<span class="sender-name">${escapeHtml(msg.sender)}</span>` : ''}
        ${contentHtml}
      </div>
    `;

    messagesContainer.appendChild(item);
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // 5. 发送文本消息
  btnSendMsg.addEventListener('click', sendTextMessage);
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  });

  function sendTextMessage() {
    if (availableRooms.length === 0) {
      showToast('暂无可用房间，请联系管理员先创建房间', 'warning');
      return;
    }
    if (!currentUser) {
      showToast('请先选择房间并输入昵称加入聊天！', 'warning');
      joinModal.classList.add('active');
      return;
    }
    const text = msgInput.value.trim();
    if (!text) return;
    socket.emit('send_message', { type: 'text', text });
    msgInput.value = '';
  }

  // 图片快捷上传
  btnUploadTrigger.addEventListener('click', () => {
    if (availableRooms.length === 0) {
      showToast('暂无可用房间，请联系管理员先创建房间', 'warning');
      return;
    }
    if (!currentUser) {
      showToast('请先选择房间并输入昵称加入聊天！', 'warning');
      joinModal.classList.add('active');
      return;
    }
    imgInput.click();
  });

  imgInput.addEventListener('change', () => {
    if (imgInput.files && imgInput.files[0]) {
      const file = imgInput.files[0];
      const formData = new FormData();
      formData.append('image', file);

      showToast('图片处理中，准备发送...', 'info');

      fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          socket.emit('send_message', { type: 'image', imageUrl: data.imageUrl });
          imgInput.value = '';
          showToast('图片已成功发送！', 'success');
        } else {
          showToast(data.message || '图片上传失败', 'error');
        }
      })
      .catch(err => {
        console.error('上传出错:', err);
        showToast('图片上传发生错误', 'error');
      });
    }
  });

  // 6. 大文件切片上传核心逻辑 (Chunked Resumable Upload)
  btnFileTrigger.addEventListener('click', () => {
    if (availableRooms.length === 0) {
      showToast('暂无可用房间，请联系管理员先创建房间', 'warning');
      return;
    }
    if (!currentUser) {
      showToast('请先选择房间并输入昵称加入聊天！', 'warning');
      joinModal.classList.add('active');
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      handleFileUploadWithChunks(file);
    }
  });

  async function handleFileUploadWithChunks(file) {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 每个切片
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileHash = `${Date.now()}-${encodeURIComponent(file.name)}-${file.size}`;

    // 显示进度 UI
    progressFilename.textContent = file.name;
    progressPercentText.textContent = '0%';
    progressBarFill.style.width = '0%';
    progressStatusSub.textContent = `准备上传 0/${totalChunks} 切片...`;
    uploadProgressCard.classList.add('active');

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('fileHash', fileHash);
        formData.append('chunkIndex', i);
        formData.append('totalChunks', totalChunks);
        formData.append('fileName', file.name);
        formData.append('fileSize', file.size);
        formData.append('chunk', chunk, `${i}`);

        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.message || `切片 ${i} 上传失败`);
        }

        // 更新进度条
        const percent = Math.floor(((i + 1) / totalChunks) * 100);
        progressPercentText.textContent = `${percent}%`;
        progressBarFill.style.width = `${percent}%`;
        progressStatusSub.textContent = `分片传输中 (${i + 1}/${totalChunks})...`;
      }

      // 所有切片上传完成，发送合并请求
      progressStatusSub.textContent = '全量切片流式校验合并中...';
      const mergeRes = await fetch('/api/upload/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash,
          fileName: file.name,
          totalChunks,
          fileSize: file.size
        })
      });

      const mergeData = await mergeRes.json();
      if (mergeData.success) {
        uploadProgressCard.classList.remove('active');
        fileInput.value = '';
        showToast('大文件切片发送成功！', 'success');

        // 发送 Socket 广播
        socket.emit('send_message', {
          type: 'file',
          fileUrl: mergeData.fileUrl,
          downloadUrl: mergeData.downloadUrl,
          fileName: mergeData.fileName,
          fileSize: mergeData.fileSize
        });
      } else {
        throw new Error(mergeData.message || '文件合并失败');
      }
    } catch (err) {
      console.error('分片上传错误:', err);
      uploadProgressCard.classList.remove('active');
      fileInput.value = '';
      showToast(err.message || '文件切片传输失败', 'error');
    }
  }

  // 7. 辅助方法与点击响应
  messagesContainer.addEventListener('click', (e) => {
    const btnCopy = e.target.closest('.btn-copy-text');
    if (btnCopy) {
      const textToCopy = btnCopy.getAttribute('data-text');
      copyToClipboard(textToCopy);
      return;
    }

    const imgWrap = e.target.closest('.chat-img-wrap');
    if (imgWrap) {
      const src = imgWrap.getAttribute('data-src');
      if (e.target.closest('.img-download-overlay')) {
        downloadFile(src);
      } else {
        openImagePreview(src);
      }
    }
  });

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('文本已成功复制到剪贴板！', 'success');
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('文本已成功复制！', 'success');
    } catch (err) {
      showToast('复制失败，请手动选择文本', 'error');
    }
    document.body.removeChild(textArea);
  }

  function downloadFile(url) {
    showToast('文件准备传输下载...', 'info');
    const a = document.createElement('a');
    a.href = url;
    a.download = url.substring(url.lastIndexOf('/') + 1) || 'file';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openImagePreview(url) {
    currentPreviewUrl = url;
    previewImgElement.src = url;
    imageModal.classList.add('active');
  }

  btnCloseImageModal.addEventListener('click', () => {
    imageModal.classList.remove('active');
  });

  btnDownloadImage.addEventListener('click', () => {
    if (currentPreviewUrl) downloadFile(currentPreviewUrl);
  });

  // 8. Toast
  let toastTimer = null;
  function showToast(message, type = 'info') {
    if (toastTimer) clearTimeout(toastTimer);

    toast.className = 'toast-container show toast-' + type;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 1 1.71 3h16.94a2 2 0 0 1 1.71-3L13.71 3.86a2 2 0 0 1-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="16"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;

    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function getFileExtension(filename) {
    if (!filename) return 'FILE';
    const parts = filename.split('.');
    if (parts.length > 1) {
      return parts.pop().substring(0, 4).toUpperCase();
    }
    return 'FILE';
  }

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
});
