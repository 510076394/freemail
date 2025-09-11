/**
 * 邮箱用户专用页面逻辑
 * 简化版本，只包含邮件接收和查看功能
 */

// 全局状态
let currentUser = null;
let currentMailbox = null;
let emails = [];
let currentPage = 1;
const pageSize = 20;
let autoRefreshTimer = null;
let keyword = '';

// DOM 元素引用
let elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  initializeElements();
  initializeAuth();
  bindEvents();
});

/**
 * 初始化DOM元素引用
 */
function initializeElements() {
  elements = {
    // 基础元素
    roleBadge: document.getElementById('role-badge'),
    toast: document.getElementById('toast'),
    
    // 邮箱信息
    currentMailbox: document.getElementById('current-mailbox'),
    copyMailboxBtn: document.getElementById('copy-mailbox'),
    refreshEmailsBtn: document.getElementById('refresh-emails'),
    
    // 邮件列表
    emailList: document.getElementById('email-list'),
    emptyState: document.getElementById('empty-state'),
    listLoading: document.getElementById('list-loading'),
    
    // 分页
    listPager: document.getElementById('list-pager'),
    prevPageBtn: document.getElementById('prev-page'),
    nextPageBtn: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info'),
    
    // 模态框
    emailModal: document.getElementById('email-modal'),
    modalSubject: document.getElementById('modal-subject'),
    modalContent: document.getElementById('modal-content'),
    modalCloseBtn: document.getElementById('modal-close'),
    
    // 确认模态框
    confirmModal: document.getElementById('confirm-modal'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmOkBtn: document.getElementById('confirm-ok'),
    confirmCancelBtn: document.getElementById('confirm-cancel'),
    confirmCloseBtn: document.getElementById('confirm-close'),
    
    // 密码修改模态框
    passwordModal: document.getElementById('password-modal'),
    passwordForm: document.getElementById('password-form'),
    currentPasswordInput: document.getElementById('current-password'),
    newPasswordInput: document.getElementById('new-password'),
    confirmPasswordInput: document.getElementById('confirm-password'),
    passwordClose: document.getElementById('password-close'),
    passwordCancel: document.getElementById('password-cancel'),
    passwordSubmit: document.getElementById('password-submit'),
    
    // 导航
    logoutBtn: document.getElementById('logout'),

    // 工具栏
    autoRefresh: document.getElementById('auto-refresh'),
    refreshInterval: document.getElementById('refresh-interval'),
    searchBox: document.getElementById('search-box'),
    clearFilter: document.getElementById('clear-filter'),
    unreadCount: document.getElementById('unread-count'),
    totalCount: document.getElementById('total-count')
  };
}

/**
 * 初始化认证状态
 */
async function initializeAuth() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    
    if (!data.authenticated) {
      redirectToLogin('请先登录');
      return;
    }
    
    if (data.role !== 'mailbox') {
      redirectToLogin('只有邮箱用户可以访问此页面');
      return;
    }
    
    currentUser = data;
    currentMailbox = data.mailbox || data.username;
    
    // 更新UI
    updateRoleBadge();
    updateCurrentMailbox();
    
    // 加载邮件
    await loadEmails();
    
  } catch (error) {
    console.error('认证检查失败:', error);
    showToast('认证检查失败', 'error');
  }
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
  // 复制邮箱地址
  elements.copyMailboxBtn?.addEventListener('click', copyMailboxAddress);
  
  // 刷新邮件
  elements.refreshEmailsBtn?.addEventListener('click', refreshEmails);

  // 自动刷新
  if (elements.autoRefresh && elements.refreshInterval){
    const setupAuto = () => {
      if (autoRefreshTimer){ clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
      if (elements.autoRefresh.checked){
        const sec = Math.max(5, parseInt(elements.refreshInterval.value || '30', 10));
        autoRefreshTimer = setInterval(() => refreshEmails(), sec * 1000);
      }
    };
    elements.autoRefresh.addEventListener('change', setupAuto);
    elements.refreshInterval.addEventListener('change', setupAuto);
    
    // 默认启用自动刷新，间隔10秒
    elements.autoRefresh.checked = true;
    elements.refreshInterval.value = '10';
    setupAuto();
  }

  // 搜索/筛选
  if (elements.searchBox){
    elements.searchBox.addEventListener('input', () => { keyword = (elements.searchBox.value||'').trim().toLowerCase(); renderEmailList(); });
  }
  elements.clearFilter?.addEventListener('click', () => { keyword=''; if(elements.searchBox) elements.searchBox.value=''; renderEmailList(); });
  
  // 退出登录
  elements.logoutBtn?.addEventListener('click', logout);
  
  // 修改密码
  document.getElementById('change-password')?.addEventListener('click', showPasswordModal);
  
  // 模态框关闭
  elements.modalCloseBtn?.addEventListener('click', closeEmailModal);
  elements.confirmCloseBtn?.addEventListener('click', closeConfirmModal);
  elements.confirmCancelBtn?.addEventListener('click', closeConfirmModal);
  elements.passwordClose?.addEventListener('click', closePasswordModal);
  elements.passwordCancel?.addEventListener('click', closePasswordModal);
  
  // 密码表单提交
  elements.passwordForm?.addEventListener('submit', handlePasswordChange);
  
  // 分页
  elements.prevPageBtn?.addEventListener('click', () => changePage(currentPage - 1));
  elements.nextPageBtn?.addEventListener('click', () => changePage(currentPage + 1));
  
  // 点击模态框背景关闭
  elements.emailModal?.addEventListener('click', (e) => {
    if (e.target === elements.emailModal) {
      closeEmailModal();
    }
  });
  
  elements.confirmModal?.addEventListener('click', (e) => {
    if (e.target === elements.confirmModal) {
      closeConfirmModal();
    }
  });
  
  elements.passwordModal?.addEventListener('click', (e) => {
    if (e.target === elements.passwordModal) {
      closePasswordModal();
    }
  });
}

/**
 * 更新角色徽章
 */
function updateRoleBadge() {
  if (elements.roleBadge && currentUser) {
    elements.roleBadge.textContent = '邮箱用户';
    elements.roleBadge.title = '邮箱用户';
  }
}

/**
 * 更新当前邮箱显示
 */
function updateCurrentMailbox() {
  if (elements.currentMailbox && currentMailbox) {
    elements.currentMailbox.textContent = currentMailbox;
  }
}

/**
 * 加载邮件列表
 */
async function loadEmails(page = 1) {
  if (!currentMailbox) return;
  
  try {
    showLoading(true);
    // 加载时先清空列表并显示空态，避免卡在旧状态
    if (elements.emailList) elements.emailList.innerHTML = '';
    
    const response = await fetch(`/api/emails?mailbox=${encodeURIComponent(currentMailbox)}&page=${page}&limit=${pageSize}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    emails = Array.isArray(data) ? data : [];
    currentPage = page;
    
    renderEmailList();
    updatePagination();
    updateCounters();
    
  } catch (error) {
    console.error('加载邮件失败:', error);
    showToast('加载邮件失败: ' + error.message, 'error');
    emails = [];
    renderEmailList();
  } finally {
    showLoading(false);
  }
}

/**
 * 渲染邮件列表
 */
function renderEmailList() {
  if (!elements.emailList) return;
  
  elements.emailList.innerHTML = '';
  
  const filtered = keyword ? emails.filter(e => {
    const s = (String(e.sender||'') + ' ' + String(e.subject||'')).toLowerCase();
    return s.includes(keyword);
  }) : emails;

  if (filtered.length === 0) {
    elements.emptyState.style.display = 'flex';
    return;
  }
  
  elements.emptyState.style.display = 'none';
  
  filtered.forEach(email => {
    const emailItem = createEmailItem(email);
    elements.emailList.appendChild(emailItem);
  });
}

/**
 * 创建邮件项元素
 */
function createEmailItem(email) {
  const item = document.createElement('div');
  item.className = 'email-item clickable';
  item.onclick = () => viewEmailDetail(email.id);

  // 统一与普通用户列表的预览与验证码提取逻辑
  const raw = (email.preview || email.content || email.html_content || '').toString();
  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const listCode = (email.verification_code || '').toString().trim() || extractCode(`${email.subject || ''} ${plain}`);
  const preview = (plain || '').slice(0, 20);
  const hasContent = preview.length > 0;
  const timeText = formatTime(email.received_at);
  const senderText = escapeHtml(email.sender || '');
  const subjectText = escapeHtml(email.subject || '(无主题)');
  const previewText = escapeHtml(preview);

  item.innerHTML = `
    <div class="email-meta">
      <span class="meta-from"><span class="meta-label">发件人</span><span class="meta-from-text">${senderText}</span></span>
      <span class="email-time"><span class="time-icon">🕐</span>${timeText}</span>
    </div>
    <div class="email-content">
      <div class="email-main">
        <div class="email-line">
          <span class="label-chip">主题</span>
          <span class="value-text subject">${subjectText}</span>
        </div>
        <div class="email-line">
          <span class="label-chip">内容</span>
          ${hasContent ? `<span class="email-preview value-text">${previewText}</span>` : '<span class="email-preview value-text" style="color:#94a3b8">(暂无预览)</span>'}
        </div>
      </div>
      <div class="email-actions">
        <button class="btn btn-secondary btn-sm" data-code="${listCode || ''}" onclick="copyFromList(event, ${email.id});event.stopPropagation()" title="复制内容或验证码">
          <span class="btn-icon">📋</span>
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteEmail(${email.id});event.stopPropagation()" title="删除邮件">
          <span class="btn-icon">🗑️</span>
        </button>
      </div>
    </div>
  `;

  return item;
}

/**
 * 查看邮件详情
 */
async function viewEmailDetail(emailId) {
  try {
    const response = await fetch(`/api/email/${emailId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const email = await response.json();
    
    // 标记为已读
    if (!email.is_read) {
      await markAsRead(emailId);
    }
    
    showEmailModal(email);
    
  } catch (error) {
    console.error('获取邮件详情失败:', error);
    showToast('获取邮件详情失败: ' + error.message, 'error');
  }
}

/**
 * 显示邮件详情模态框
 */
function showEmailModal(email) {
  if (!elements.emailModal || !elements.modalSubject || !elements.modalContent) return;

  // 标题
  elements.modalSubject.innerHTML = `
    <span class="modal-icon">📧</span>
    <span>${escapeHtml(email.subject || '(无主题)')}</span>
  `;

  // 元信息与动作条采用普通用户样式
  const rawHtml = (email.html_content || '').toString();
  const rawText = (email.content || '').toString();
  const plainForCode = `${email.subject || ''} ` + (rawHtml || rawText).replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
  const code = (email.verification_code || '').toString().trim() || extractCode(plainForCode);
  const toLine = currentMailbox || '';
  const timeLine = formatTime(email.received_at);
  const subjLine = escapeHtml(email.subject || '');

  elements.modalContent.innerHTML = `
    <div class="email-meta-inline" style="margin:4px 0 8px 0;color:#334155;font-size:14px">
      <span>发件人：${escapeHtml(email.sender || '')}</span>
      ${toLine ? `<span style=\"margin-left:12px\">收件人：${escapeHtml(toLine)}</span>` : ''}
      ${timeLine ? `<span style=\"margin-left:12px\">时间：${timeLine}</span>` : ''}
      ${subjLine ? `<span style=\"margin-left:12px\">主题：${subjLine}</span>` : ''}
    </div>
    <div class="email-actions-bar">
      <button class="btn btn-secondary btn-sm" onclick="copyEmailAllText(this)">
        <span class="btn-icon">📋</span>
        <span>复制内容</span>
      </button>
      ${code ? `
        <button class=\"btn btn-primary btn-sm\" onclick=\"copyCodeInModal('${code}', this)\">
          <span class=\"btn-icon\">🔐</span>
          <span>复制验证码</span>
        </button>
      ` : ''}
      ${email.download ? `<a class="btn btn-ghost btn-sm" href="${email.download}" download><span class="btn-icon">⬇️</span><span>下载原始邮件</span></a>` : ''}
    </div>
    <div id="email-render-host"></div>
  `;

  const host = document.getElementById('email-render-host');
  if (rawHtml.trim()){
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.border = '0';
    iframe.style.minHeight = '60vh';
    host.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc){
      doc.open();
      doc.write(rawHtml);
      doc.close();
      const resize = () => {
        try{
          const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0, 400);
          iframe.style.height = h + 'px';
        }catch(_){ }
      };
      iframe.onload = resize;
      setTimeout(resize, 60);
    }
  } else if (rawText.trim()){
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.textContent = rawText;
    host.appendChild(pre);
  } else {
    host.innerHTML = '<div class="email-no-content">📭 此邮件暂无内容</div>';
  }

  elements.emailModal.classList.add('show');
}

/**
 * 关闭邮件详情模态框
 */
function closeEmailModal() {
  if (elements.emailModal) {
    elements.emailModal.classList.remove('show');
  }
}

/**
 * 更新未读/总数
 */
function updateCounters(){
  try{
    const total = emails.length;
    const unread = emails.filter(e => !e.is_read).length;
    if (elements.totalCount) elements.totalCount.textContent = String(total);
    if (elements.unreadCount) elements.unreadCount.textContent = String(unread);
  }catch(_){ }
}

/**
 * 标记邮件为已读
 */
async function markAsRead(emailId) {
  try {
    await fetch(`/api/email/${emailId}/read`, { method: 'POST' });
    
    // 更新本地状态
    const email = emails.find(e => e.id === emailId);
    if (email) {
      email.is_read = 1;
      renderEmailList();
    }
    
  } catch (error) {
    console.error('标记已读失败:', error);
  }
}

/**
 * 删除邮件
 */
async function deleteEmail(emailId) {
  showConfirmModal(
    '确定要删除这封邮件吗？删除后无法恢复。',
    async () => {
      try {
        const response = await fetch(`/api/email/${emailId}`, { method: 'DELETE' });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        showToast('邮件已删除', 'success');
        
        // 从列表中移除
        emails = emails.filter(e => e.id !== emailId);
        renderEmailList();
        
      } catch (error) {
        console.error('删除邮件失败:', error);
        showToast('删除邮件失败: ' + error.message, 'error');
      }
    }
  );
}

/**
 * 复制邮箱地址
 */
async function copyMailboxAddress() {
  if (!currentMailbox) return;
  
  try {
    await navigator.clipboard.writeText(currentMailbox);
    showToast('邮箱地址已复制到剪贴板', 'success');
  } catch (error) {
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = currentMailbox;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('邮箱地址已复制到剪贴板', 'success');
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
    }
    document.body.removeChild(textArea);
  }
}

/**
 * 刷新邮件
 */
async function refreshEmails() {
  await loadEmails(currentPage);
  showToast('邮件已刷新', 'success');
}

/**
 * 切换页面
 */
function changePage(page) {
  if (page < 1) return;
  loadEmails(page);
}

/**
 * 更新分页信息
 */
function updatePagination() {
  if (!elements.listPager) return;
  
  const hasEmails = emails.length > 0;
  const hasMorePages = emails.length >= pageSize;
  
  if (hasEmails && (currentPage > 1 || hasMorePages)) {
    elements.listPager.style.display = 'flex';
    
    if (elements.prevPageBtn) {
      elements.prevPageBtn.disabled = currentPage <= 1;
    }
    
    if (elements.nextPageBtn) {
      elements.nextPageBtn.disabled = emails.length < pageSize;
    }
    
    if (elements.pageInfo) {
      elements.pageInfo.textContent = `第 ${currentPage} 页`;
    }
  } else {
    elements.listPager.style.display = 'none';
  }
}

/**
 * 退出登录
 */
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    redirectToLogin('已退出登录');
  } catch (error) {
    console.error('退出登录失败:', error);
    redirectToLogin('退出登录');
  }
}

/**
 * 重定向到登录页面
 */
function redirectToLogin(message) {
  const url = message ? `/html/login.html?message=${encodeURIComponent(message)}` : '/html/login.html';
  window.location.href = url;
}

/**
 * 显示确认模态框
 */
function showConfirmModal(message, onConfirm) {
  if (!elements.confirmModal || !elements.confirmMessage || !elements.confirmOkBtn) return;
  
  elements.confirmMessage.textContent = message;
  elements.confirmOkBtn.onclick = () => {
    closeConfirmModal();
    if (onConfirm) onConfirm();
  };
  
  elements.confirmModal.classList.add('show');
}

/**
 * 关闭确认模态框
 */
function closeConfirmModal() {
  if (elements.confirmModal) {
    elements.confirmModal.classList.remove('show');
  }
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
  if (elements.listLoading) {
    elements.listLoading.style.display = show ? 'flex' : 'none';
  }
}

/**
 * 显示Toast消息 - 使用全局toast模板
 */
async function showToast(message, type = 'success') {
  try {
    const res = await fetch('/templates/toast.html', { cache: 'no-cache' });
    const tpl = await res.text();
    const html = tpl.replace('{{type}}', String(type || 'info')).replace('{{message}}', String(message || ''));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    
    // 注入样式（仅一次）
    const styleEl = wrapper.querySelector('#toast-style');
    if (styleEl && !document.getElementById('toast-style')) {
      document.head.appendChild(styleEl);
    }
    
    // 插入 toast 元素
    const toastEl = wrapper.querySelector('.toast-item');
    if (toastEl) {
      let container = elements.toast;
      if (!container) {
        container = document.getElementById('toast');
      }
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast';
        container.className = 'toast';
        document.body.appendChild(container);
      }
      container.appendChild(toastEl);
      setTimeout(() => {
        toastEl.style.transition = 'opacity .3s ease';
        toastEl.style.opacity = '0';
        setTimeout(() => toastEl.remove(), 300);
      }, 2000);
      return;
    }
  } catch (_) {
    // 降级到简易提示
    const div = document.createElement('div');
    div.className = `toast-item ${type}`;
    div.textContent = message;
    let container = elements.toast;
    if (!container) {
      container = document.getElementById('toast');
    }
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast';
      container.className = 'toast';
      document.body.appendChild(container);
    }
    container.appendChild(div);
    setTimeout(() => {
      div.style.transition = 'opacity .3s ease';
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 300);
    }, 2000);
  }
}

/**
 * 显示修改密码模态框
 */
function showPasswordModal() {
  if (elements.passwordModal) {
    elements.passwordModal.style.display = 'flex';
    elements.currentPasswordInput?.focus();
  }
}

/**
 * 关闭修改密码模态框
 */
function closePasswordModal() {
  if (elements.passwordModal) {
    elements.passwordModal.style.display = 'none';
    // 清空表单
    if (elements.passwordForm) {
      elements.passwordForm.reset();
    }
  }
}

/**
 * 处理密码修改
 */
async function handlePasswordChange(e) {
  e.preventDefault();
  
  const currentPassword = elements.currentPasswordInput?.value?.trim();
  const newPassword = elements.newPasswordInput?.value?.trim();
  const confirmPassword = elements.confirmPasswordInput?.value?.trim();
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('请填写所有字段', 'error');
    return;
  }
  
  if (newPassword.length < 6) {
    showToast('新密码长度至少6位', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('两次输入的新密码不一致', 'error');
    return;
  }
  
  try {
    showLoading(true);
    
    const response = await fetch('/api/mailbox/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      showToast('密码修改成功', 'success');
      closePasswordModal();
    } else {
      showToast(result.message || '密码修改失败', 'error');
    }
  } catch (error) {
    console.error('修改密码失败:', error);
    showToast('网络错误，请重试', 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * 格式化时间
 */
function formatTime(timeStr) {
  if (!timeStr) return '未知时间';
  
  try {
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 小于1分钟
      return '刚刚';
    } else if (diff < 3600000) { // 小于1小时
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 小于1天
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 7 * 86400000) { // 小于7天
      return Math.floor(diff / 86400000) + '天前';
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  } catch (error) {
    return '时间格式错误';
  }
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 暴露全局函数
window.viewEmailDetail = viewEmailDetail;
window.deleteEmail = deleteEmail;
