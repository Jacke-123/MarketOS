/**
 * login.js — 登录/注册页面模块
 * ============================================================================
 * 功能概述：
 *   1. 登录/注册表单切换：通过标签页和链接在登录与注册之间切换
 *   2. 登录：调用 POST /auth/login，成功后存储 JWT Token 和用户信息到 localStorage
 *   3. 注册：调用 POST /auth/register，包含前端密码校验（长度 8-16 位、确认密码一致）
 *   4. 路由跳转：登录后根据用户角色（isAdmin）跳转到 admin.html 或 index.html
 *   5. 消息提示：统一的错误/成功信息展示（alertBox）
 *
 * 依赖：
 *   - 后端 API 服务（默认 http://localhost:9000/api）
 *   - localStorage（存储 marketos_token 和 marketos_user）
 * ============================================================================
 */

const API_BASE = 'http://localhost:9000/api';
const alertBox = document.getElementById('alert-box');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabs = document.querySelectorAll('.auth-tab');
const openRegister = document.getElementById('open-register');
const openLogin = document.getElementById('open-login');

// ============================================================================
// 表单切换与消息提示
// ============================================================================

/**
 * 切换当前激活的表单（登录 / 注册）
 * 同时更新标签页的 active 状态，并隐藏消息提示框
 * @param {string} name - 表单名称，'login' 或 'register'
 */
function setActiveForm(name) {
  const showLogin = name === 'login';
  loginForm.classList.toggle('active', showLogin);
  registerForm.classList.toggle('active', !showLogin);
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.form === name));
  // 切换表单时清除之前的提示消息
  alertBox.style.display = 'none';
}

/**
 * 在页面顶部显示提示消息（成功/失败使用不同配色）
 * @param {string}  message - 提示文本内容
 * @param {boolean} isError - 是否为错误消息（默认 false 表示成功）
 */
function showMessage(message, isError = false) {
  alertBox.textContent = message;
  alertBox.style.display = 'block';
  // 错误消息：浅红底色；成功消息：浅绿底色
  alertBox.style.background = isError ? '#ffe8e1' : '#f4fffa';
  alertBox.style.borderColor = isError ? '#f7c2b0' : '#d6ebe4';
  alertBox.style.color = isError ? '#8f2d1d' : '#1e574f';
}

// ============================================================================
// 表单切换事件绑定
// ============================================================================

// 标签页点击切换（登录 / 注册）
tabs.forEach(tab => {
  tab.addEventListener('click', () => setActiveForm(tab.dataset.form));
});
// 表单内"去注册"链接
openRegister.addEventListener('click', event => {
  event.preventDefault();
  setActiveForm('register');
});
// 表单内"去登录"链接
openLogin.addEventListener('click', event => {
  event.preventDefault();
  setActiveForm('login');
});

// ============================================================================
// 登录表单提交
// ============================================================================

/**
 * 登录表单提交处理
 * 流程：
 *   1. 前端校验用户名和密码非空
 *   2. POST /auth/login 发送登录请求
 *   3. 成功时存储 JWT token 和用户信息到 localStorage
 *   4. 根据 isAdmin 判断跳转目标页面（管理员 → admin.html，普通用户 → index.html）
 *   5. 失败时根据后端返回的错误信息匹配中文化提示
 */
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  // 前端非空校验
  if (!username) { showMessage('请输入用户名', true); return; }
  if (!password) { showMessage('请输入密码', true); return; }
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.success && data.data?.token) {
      // 构建用户信息对象（扁平化，方便后续使用）
      const userInfo = {
        id: data.data.id,
        username: data.data.username,
        email: data.data.email,
        role: data.data.role,
        realName: data.data.realName,
        roles: data.data.roles,
        isAdmin: data.data.isAdmin
      };
      // 持久化存储：token 用于 API 认证，user 用于界面展示和权限判断
      localStorage.setItem('marketos_token', data.data.token);
      localStorage.setItem('marketos_user', JSON.stringify(userInfo));

      /**
       * 判断当前用户是否为管理员
       * 优先级：isAdmin 字段 > role 字符串包含 'admin' > roles 数组任一包含 'admin'
       * @param {object} info - 用户信息对象
       * @returns {boolean}
       */
      function isAdmin(info) {
        if (!info) return false;
        // 优先使用后端返回的 isAdmin 字段（最权威）
        if (info.isAdmin === true) return true;
        // 检查主要角色是否包含 admin
        const roleValue = String(info.role || '').toLowerCase();
        if (roleValue.includes('admin')) return true;
        // 检查角色列表（多角色场景）
        if (Array.isArray(info.roles)) {
          return info.roles.some(r => String(r).toLowerCase().includes('admin'));
        }
        return false;
      }

      // 管理员跳转后台，普通用户跳转首页
      const targetUrl = isAdmin(userInfo) ? 'admin.html' : 'index.html';
      window.location.href = targetUrl;
    } else {
      // 登录失败：根据后端错误信息进行中文化匹配
      const msg = data.message || data.error || '';
      if (msg.includes('Bad credentials') || msg.includes('用户名或密码')) {
        showMessage('用户名或密码错误，请检查后重试', true);
      } else if (msg.includes('locked') || msg.includes('disabled')) {
        showMessage('该账号已被禁用，请联系管理员', true);
      } else if (msg) {
        showMessage(msg, true);
      } else {
        showMessage('登录失败，请检查用户名和密码是否正确', true);
      }
    }
  } catch (error) {
    // 网络异常或接口不可达
    showMessage('登录接口调用失败：' + error.message, true);
  }
});

// ============================================================================
// 注册表单提交
// ============================================================================

/**
 * 注册表单提交处理
 * 前端校验规则：
 *   - 用户名和密码为必填项
 *   - 密码长度 8-16 位
 *   - 两次输入的密码必须一致
 * 成功后自动切换到登录表单并清空注册字段
 * 可选字段（email、phoneNumber、realName）为空时传 undefined 而非空字符串
 */
registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value.trim();
  const confirmPassword = document.getElementById('register-confirm-password').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const phoneNumber = document.getElementById('register-phone').value.trim();
  const realName = document.getElementById('register-realname').value.trim();

  // --- 前端校验 ---
  if (!username || !password || !confirmPassword) {
    showMessage('用户名和密码为必填项', true);
    return;
  }
  if (password.length < 8 || password.length > 16) {
    showMessage('密码长度必须在8-16位之间', true);
    return;
  }
  if (password !== confirmPassword) {
    showMessage('两次输入的密码不一致', true);
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        // 可选字段：空字符串转为 undefined，避免后端误存空字符串
        email: email || undefined,
        phoneNumber: phoneNumber || undefined,
        realName: realName || undefined
      })
    });
    const data = await response.json();
    if (data.success || data.message === '注册成功') {
      showMessage('注册成功！请使用新账号登录');
      // 自动切换到登录表单，方便用户立即登录
      setActiveForm('login');
      // 清空注册表单字段，避免敏感信息残留
      document.getElementById('register-username').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm-password').value = '';
    } else {
      // 注册失败：根据后端错误信息进行中文化匹配
      const msg = data.message || data.error || '';
      if (msg.includes('已存在')) {
        showMessage('该用户名已被注册，请换一个用户名', true);
      } else if (msg.includes('密码强度')) {
        showMessage(msg, true);
      } else if (msg) {
        showMessage(msg, true);
      } else {
        showMessage('注册失败，请稍后重试', true);
      }
    }
  } catch (error) {
    // 网络异常或接口不可达
    showMessage('注册接口调用失败：' + error.message, true);
  }
});
