// 独立管理员控制台交互逻辑 (Admin Dashboard Logic with Empty Rooms Support)
document.addEventListener('DOMContentLoaded', () => {
  let adminToken = localStorage.getItem('chat_admin_token') || '';
  let adminSelectedRoomId = '';
  let adminRoomsData = [];
  let toastTimer = null;

  const adminLoginSection = document.getElementById('admin-login-section');
  const adminPanelSection = document.getElementById('admin-panel-section');
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminPasswordInput = document.getElementById('admin-password-input');

  const adminSelectWrapper = document.getElementById('admin-select-wrapper');
  const adminSelectTrigger = document.getElementById('admin-select-trigger');
  const adminSelectedLabel = document.getElementById('admin-selected-label');
  const adminSelectOptions = document.getElementById('admin-select-options');

  const toggleCodeRequired = document.getElementById('toggle-code-required');
  const adminNewRoomCode = document.getElementById('admin-new-room-code');
  const btnSaveAdminConfig = document.getElementById('btn-save-admin-config');
  const btnClearChatHistory = document.getElementById('btn-clear-chat-history');

  const adminOnlineUsersList = document.getElementById('admin-online-users-list');
  const adminOnlineUserCount = document.getElementById('admin-online-user-count');

  const newRoomIdInput = document.getElementById('new-room-id');
  const newRoomNameInput = document.getElementById('new-room-name');
  const newRoomCodeInput = document.getElementById('new-room-code');
  const btnCreateRoom = document.getElementById('btn-create-room');

  const adminOldPass = document.getElementById('admin-old-pass');
  const adminNewPass = document.getElementById('admin-new-pass');
  const btnChangeAdminPass = document.getElementById('btn-change-admin-pass');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  const toast = document.getElementById('toast');

  // 自定义 Select 初始化
  if (adminSelectTrigger) {
    adminSelectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (adminSelectWrapper) adminSelectWrapper.classList.toggle('open');
    });
  }

  document.addEventListener('click', () => {
    if (adminSelectWrapper) adminSelectWrapper.classList.remove('open');
  });

  // 1. 初始化检查登录状态
  if (adminToken) {
    showAdminPanel();
  } else {
    showAdminLogin();
  }

  function showAdminLogin() {
    adminLoginSection.style.display = 'block';
    adminPanelSection.style.display = 'none';
  }

  function showAdminPanel() {
    adminLoginSection.style.display = 'none';
    adminPanelSection.style.display = 'grid';
    fetchAdminRooms();
  }

  // 核心管理员登录处理 (双重阻断 HTML 原生页面跳转刷新)
  const btnAdminLoginSubmit = document.getElementById('btn-admin-login-submit');

  function doAdminLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
    if (!password) {
      showToast('请输入管理员密码', 'warning');
      return false;
    }

    if (btnAdminLoginSubmit) {
      btnAdminLoginSubmit.disabled = true;
      btnAdminLoginSubmit.innerHTML = '<span class="loading-spinner" style="display:inline-block; width:14px; height:14px; vertical-align:middle; border-width:2px; margin-right:6px; border-top-color:#ffffff;"></span><span>身份验证中...</span>';
    }

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
      if (btnAdminLoginSubmit) {
        btnAdminLoginSubmit.disabled = false;
        btnAdminLoginSubmit.innerHTML = '验证登录';
      }
      if (data.success) {
        adminToken = data.token;
        localStorage.setItem('chat_admin_token', adminToken);
        if (adminPasswordInput) adminPasswordInput.value = '';
        showToast('管理员身份验证成功！', 'success');
        showAdminPanel();
      } else {
        showToast(data.message || '密码验证失败', 'error');
      }
    })
    .catch(err => {
      if (btnAdminLoginSubmit) {
        btnAdminLoginSubmit.disabled = false;
        btnAdminLoginSubmit.innerHTML = '验证登录';
      }
      console.error('登录请求异常:', err);
      showToast('登录请求发送失败，请重试', 'error');
    });

    return false;
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', doAdminLogin);
  }
  if (btnAdminLoginSubmit) {
    btnAdminLoginSubmit.addEventListener('click', doAdminLogin);
  }

  // 安全退出登录
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      adminToken = '';
      localStorage.removeItem('chat_admin_token');
      showToast('已退出管理员状态', 'info');
      showAdminLogin();
    });
  }

  // 拉取管理员房间列表
  function fetchAdminRooms() {
    fetch('/api/admin/rooms', {
      headers: { 'Authorization': adminToken }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.rooms)) {
        adminRoomsData = data.rooms;
        renderAdminCustomSelect();
        if (adminSelectedRoomId && adminRoomsData.find(r => r.id === adminSelectedRoomId)) {
          fetchAdminRoomUsers(adminSelectedRoomId);
        } else if (adminRoomsData.length > 0) {
          adminSelectedRoomId = adminRoomsData[0].id;
          fetchAdminRoomUsers(adminSelectedRoomId);
        } else {
          renderAdminUsersList([]);
        }
      } else {
        adminToken = '';
        localStorage.removeItem('chat_admin_token');
        showAdminLogin();
      }
    });
  }

  function renderAdminCustomSelect() {
    if (adminRoomsData.length === 0) {
      adminSelectedRoomId = '';
      adminSelectedLabel.textContent = '暂无可用房间 (请在右侧创建)';
      toggleCodeRequired.checked = false;
      toggleCodeRequired.disabled = true;
      adminNewRoomCode.value = '';
      adminNewRoomCode.disabled = true;
      adminSelectOptions.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">暂无房间，请先在右侧“创建新房间”</div>`;
      return;
    }

    toggleCodeRequired.disabled = false;
    adminNewRoomCode.disabled = false;

    const curRoom = adminRoomsData.find(r => r.id === adminSelectedRoomId) || adminRoomsData[0];
    if (curRoom) {
      adminSelectedRoomId = curRoom.id;
      adminSelectedLabel.textContent = curRoom.name;
      toggleCodeRequired.checked = curRoom.isCodeRequired;
      adminNewRoomCode.value = curRoom.roomCode || '';
    }

    let html = '';
    const lockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    adminRoomsData.forEach(r => {
      const isSelected = r.id === adminSelectedRoomId;
      html += `
        <div class="custom-select-option ${isSelected ? 'selected' : ''}" data-id="${r.id}">
          <span>${escapeHtml(r.name)}</span>
          ${r.isCodeRequired ? `<span class="badge-lock" style="display:inline-flex;align-items:center;gap:3px;">${lockSvg} 口令</span>` : ''}
        </div>
      `;
    });
    adminSelectOptions.innerHTML = html;

    adminSelectOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        adminSelectWrapper.classList.remove('open');
        const roomId = opt.getAttribute('data-id');
        adminSelectedRoomId = roomId;
        const targetRoom = adminRoomsData.find(r => r.id === roomId);
        if (targetRoom) {
          adminSelectedLabel.textContent = targetRoom.name;
          toggleCodeRequired.checked = targetRoom.isCodeRequired;
          adminNewRoomCode.value = targetRoom.roomCode || '';
          fetchAdminRoomUsers(roomId);
        }
      });
    });
  }

  // 管理员获取当前房间的在线人员
  function fetchAdminRoomUsers(roomId) {
    if (!roomId) {
      renderAdminUsersList([]);
      return;
    }
    fetch(`/api/admin/users/${roomId}`, {
      headers: { 'Authorization': adminToken }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.users)) {
        renderAdminUsersList(data.users);
      }
    });
  }

  // 纯粹渲染在线人员
  function renderAdminUsersList(users) {
    adminOnlineUserCount.textContent = `${users.length} 人在线`;
    if (users.length === 0) {
      adminOnlineUsersList.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">${adminRoomsData.length === 0 ? '暂无可用房间' : '当前房间暂无在线成员'}</div>`;
      return;
    }

    let html = '';
    users.forEach(u => {
      const avatarBg = u.avatarColor || 'linear-gradient(135deg, #6366f1, #4f46e5)';
      const firstLetter = u.username ? u.username.charAt(0).toUpperCase() : '?';
      html += `
        <div class="admin-user-item">
          <div class="admin-user-info">
            <div class="user-mini-avatar" style="background:${avatarBg}">${firstLetter}</div>
            <span class="admin-user-name">${escapeHtml(u.username)}</span>
          </div>
          <span style="font-size:11.5px; color:#4ade80; display:inline-flex; align-items:center; gap:4px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#4ade80;"></span> 在线
          </span>
        </div>
      `;
    });

    adminOnlineUsersList.innerHTML = html;
  }

  // 保存房间设置
  btnSaveAdminConfig.addEventListener('click', () => {
    if (adminRoomsData.length === 0) {
      showToast('暂无可选房间，请先在右侧“创建新房间”！', 'warning');
      return;
    }
    const targetRoom = adminRoomsData.find(r => r.id === adminSelectedRoomId);
    if (!targetRoom) return;

    const isCodeRequired = toggleCodeRequired.checked;
    const roomCode = adminNewRoomCode.value.trim();

    fetch('/api/admin/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminToken
      },
      body: JSON.stringify({
        id: targetRoom.id,
        name: targetRoom.name,
        isCodeRequired,
        roomCode
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast(data.message || '房间配置保存成功！', 'success');
        fetchAdminRooms();
      } else {
        showToast(data.message || '保存失败', 'error');
      }
    });
  });

  // 创建新房间
  btnCreateRoom.addEventListener('click', () => {
    const id = newRoomIdInput.value.trim();
    const name = newRoomNameInput.value.trim();
    const roomCode = newRoomCodeInput.value.trim();

    if (!id || !name) {
      showToast('请填写完整房间ID与名称', 'warning');
      return;
    }

    fetch('/api/admin/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminToken
      },
      body: JSON.stringify({
        id,
        name,
        isCodeRequired: !!roomCode,
        roomCode
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast(`房间【${name}】创建成功！`, 'success');
        adminSelectedRoomId = id;
        newRoomIdInput.value = '';
        newRoomNameInput.value = '';
        newRoomCodeInput.value = '';
        fetchAdminRooms();
      } else {
        showToast(data.message || '创建房间失败', 'error');
      }
    });
  // 清空选中房间历史消息 (自定义 Glassmorphism 确认弹窗)
  if (btnClearChatHistory) {
    btnClearChatHistory.addEventListener('click', async () => {
      if (!adminSelectedRoomId) {
        showToast('请先选择要清空消息的房间', 'warning');
        return;
      }
      const targetRoom = adminRoomsData.find(r => r.id === adminSelectedRoomId);
      if (!targetRoom) return;

      const confirmed = await showConfirmDialog({
        title: '危险操作：清空房间历史消息',
        content: `确定要清空 【${targetRoom.name}】 的所有历史消息记录吗？该操作同时将物理删除磁盘存储的所有文件与图片资源！`,
        confirmText: '确认清空消息与文件',
        cancelText: '取消操作',
        danger: true
      });

      if (confirmed) {
        fetch(`/api/admin/rooms/${adminSelectedRoomId}/clear`, {
          method: 'POST',
          headers: {
            'Authorization': adminToken
          }
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            showToast(data.message || `【${targetRoom.name}】历史消息已成功清空！`, 'success');
          } else {
            showToast(data.message || '清空历史失败', 'error');
          }
        })
        .catch(err => {
          console.error('清空历史出错:', err);
          showToast('清空历史消息失败', 'error');
        });
      }
    });
  }

  // 修改密码
  btnChangeAdminPass.addEventListener('click', () => {
    const oldPassword = adminOldPass.value;
    const newPassword = adminNewPass.value;

    if (!oldPassword || !newPassword) {
      showToast('请输入原密码与新密码', 'warning');
      return;
    }

    fetch('/api/admin/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminToken
      },
      body: JSON.stringify({ oldPassword, newPassword })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast('管理员密码修改成功！', 'success');
        adminOldPass.value = '';
        adminNewPass.value = '';
      } else {
        showToast(data.message || '密码修改失败', 'error');
      }
    })
    .catch(err => {
      console.error('修改密码出错:', err);
      showToast('修改密码失败', 'error');
    });
  });

  // 两步法系统更新逻辑 (1. 检查 ➔ 2. 确认更新)
  const btnCheckSystemUpdate = document.getElementById('btn-check-system-update');
  const btnTriggerSystemUpdate = document.getElementById('btn-trigger-system-update');
  const updateStatusBox = document.getElementById('update-status-box');

  if (btnCheckSystemUpdate) {
    btnCheckSystemUpdate.addEventListener('click', () => {
      btnCheckSystemUpdate.disabled = true;
      btnCheckSystemUpdate.style.opacity = '0.75';
      btnCheckSystemUpdate.innerHTML = '<span class="loading-spinner" style="display:inline-block; width:14px; height:14px; vertical-align:middle; border-width:2px; margin-right:6px; border-top-color:#ffffff;"></span><span>正在比对 GitHub 远端镜像...</span>';
      showToast('正在检查远端最新 Docker 镜像...', 'info');

      if (updateStatusBox) {
        updateStatusBox.style.display = 'block';
        updateStatusBox.style.background = 'rgba(99, 102, 241, 0.1)';
        updateStatusBox.style.border = '1px solid rgba(129, 140, 248, 0.3)';
        updateStatusBox.style.color = '#c7d2fe';
        updateStatusBox.textContent = '正在向远程镜像仓库查询最新 Tag 与 Commit 哈希...';
      }

      fetch('/api/admin/system/check-update', {
        method: 'POST',
        headers: {
          'Authorization': adminToken
        }
      })
      .then(res => {
        if (res.status === 401) {
          showAdminLogin();
          throw new Error('管理员登录失效，请重新登录！');
        }
        return res.json();
      })
      .then(data => {
        btnCheckSystemUpdate.disabled = false;
        btnCheckSystemUpdate.style.opacity = '1';
        btnCheckSystemUpdate.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>重新检查版本</span>';

        if (data.hasUpdate) {
          showToast('检测到新版本，请确认是否升级！', 'success');
          if (updateStatusBox) {
            updateStatusBox.style.background = 'rgba(16, 185, 129, 0.15)';
            updateStatusBox.style.border = '1px solid rgba(52, 211, 153, 0.4)';
            updateStatusBox.style.color = '#6ee7b7';
            updateStatusBox.innerHTML = `
              <div style="display:flex; align-items:center; gap:6px; font-weight:600; margin-bottom:4px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                <span>检测到最新镜像版本！</span>
              </div>
              • 远端 Commit: <code>${data.latestCommit}</code><br>
              • 提交说明: ${escapeHtml(data.commitMessage)}<br>
              • 对应时间: ${data.commitDate || '刚发布'}
            `;
          }
          if (btnTriggerSystemUpdate) {
            btnTriggerSystemUpdate.style.display = 'inline-flex';
          }
        } else {
          showToast('当前已是最新版本，无需更新！', 'info');
          if (updateStatusBox) {
            updateStatusBox.style.background = 'rgba(148, 163, 184, 0.1)';
            updateStatusBox.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            updateStatusBox.style.color = '#94a3b8';
            updateStatusBox.innerHTML = `<div style="display:flex; align-items:center; gap:6px; font-weight:600;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>已是最新版本 (${data.currentCommit})</span></div>系统的运行镜像与 GitHub 仓库 100% 一致。`;
          }
          if (btnTriggerSystemUpdate) {
            btnTriggerSystemUpdate.style.display = 'none';
          }
        }
      })
      .catch(err => {
        btnCheckSystemUpdate.disabled = false;
        btnCheckSystemUpdate.style.opacity = '1';
        btnCheckSystemUpdate.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>重新检查版本</span>';
        console.error('检查版本异常:', err);
        showToast(err.message || '版本检查失败，请重试', 'error');
        if (updateStatusBox) {
          updateStatusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          updateStatusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          updateStatusBox.style.color = '#fca5a5';
          updateStatusBox.innerHTML = `<div style="display:flex; align-items:center; gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>${escapeHtml(err.message || '连接服务器检查失败，请重新登录管理后台')}</span></div>`;
        }
      });
    });
  }

  if (btnTriggerSystemUpdate) {
    btnTriggerSystemUpdate.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: '系统版本升级确认',
        content: '确定要立即升级部署最新 Docker 镜像吗？在镜像拉取与容器无感更替过程中，连接可能会发生 2-3 秒的短注重连。',
        confirmText: '确认立即升级',
        cancelText: '取消',
        danger: false
      });

      if (!confirmed) return;

      btnTriggerSystemUpdate.disabled = true;
      btnTriggerSystemUpdate.innerHTML = '<span class="loading-spinner" style="display:inline-block; width:14px; height:14px; vertical-align:middle; border-width:2px; margin-right:6px; border-top-color:#ffffff;"></span><span>升级部署中，请稍候...</span>';
      showToast('已向 Watchtower 下发强行升级指令...', 'info');

      fetch('/api/admin/system/update', {
        method: 'POST',
        headers: {
          'Authorization': adminToken
        }
      })
      .then(res => res.json())
      .then(data => {
        showToast(data.message || '更新指令已发送', 'success');
        if (updateStatusBox) {
          updateStatusBox.style.background = 'rgba(16, 185, 129, 0.2)';
          updateStatusBox.style.color = '#a7f3d0';
          updateStatusBox.innerHTML = '<div style="display:flex; align-items:center; gap:6px; font-weight:600;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>应用正在进行拉取并重启...</span></div>请等待 5-10 秒后刷新页面查看全新版本！';
        }
      })
      .catch(err => {
        console.error('触发更新异常:', err);
        showToast('触发指令已发出', 'info');
      });
    });
  }

  // 辅助：通用高颜值 Glassmorphism Confirm 确认弹窗 (取代原生 confirm)
  function showConfirmDialog({ title = '操作确认', content = '确定要执行此操作吗？', confirmText = '确认', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      const confirmModal = document.getElementById('confirm-modal');
      const confirmModalTitle = document.getElementById('confirm-modal-title');
      const confirmModalContent = document.getElementById('confirm-modal-content');
      const btnConfirmOk = document.getElementById('btn-confirm-ok');
      const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

      if (!confirmModal) {
        resolve(true);
        return;
      }

      const iconSvg = danger 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

      confirmModalTitle.innerHTML = `${iconSvg}<span style="color: ${danger ? '#f87171' : '#f8fafc'};">${escapeHtml(title)}</span>`;
      confirmModalContent.textContent = content;
      btnConfirmCancel.textContent = cancelText;
      btnConfirmOk.textContent = confirmText;

      if (danger) {
        btnConfirmOk.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        btnConfirmOk.style.borderColor = 'rgba(248, 113, 113, 0.4)';
      } else {
        btnConfirmOk.style.background = 'var(--primary-gradient)';
        btnConfirmOk.style.borderColor = 'rgba(129, 140, 248, 0.4)';
      }

      confirmModal.classList.add('active');

      const cleanup = () => {
        confirmModal.classList.remove('active');
        btnConfirmOk.removeEventListener('click', onOk);
        btnConfirmCancel.removeEventListener('click', onCancel);
      };

      const onOk = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      btnConfirmOk.addEventListener('click', onOk);
      btnConfirmCancel.addEventListener('click', onCancel);
    });
  }

  // Toast
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

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
});
