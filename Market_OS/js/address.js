/**
 * ===========================================================================
 * address.js — 收货地址管理模块
 * ===========================================================================
 *
 * 功能概览：
 *   1. 收货地址的 CRUD（创建、读取、设为默认、删除）
 *   2. JWT Token 与 localStorage 用户数据一致性校验（防跨标签页身份混乱）
 *   3. 网络诊断功能（诊断 CORS / 后端连通性）
 *   4. 表单校验与友好错误提示
 *
 * 依赖：
 *   - 后端 API 基地址：http://localhost:9000/api
 *   - localStorage 中的 marketos_token（JWT）和 marketos_user（用户信息）
 *   - 对应页面 DOM 元素（address-list, no-address, 各输入框及按钮）
 *
 * 全局变量：
 *   - API_BASE: 后端 API 根路径
 *   - token: 当前登录用户的 JWT Token
 *   - storedUser: localStorage 中缓存的用户对象 JSON 字符串
 * ===========================================================================
 */

const API_BASE = 'http://localhost:9000/api';
// ========== 认证信息初始化 ==========
const token = localStorage.getItem('marketos_token');
const storedUser = localStorage.getItem('marketos_user');

// ========== JWT 与用户数据一致性校验（防跨标签页身份混乱）==========
// 解析 JWT payload 中的 sub 字段与缓存的 username 对比，不匹配则清空登录态并跳转登录页
(function() {
  if (!token || !storedUser) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = JSON.parse(storedUser);
    if (payload.sub && user.username && payload.sub !== user.username) {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      window.location.href = 'login.html';
    }
  } catch (e) { /* JWT 解析失败或数据异常时忽略，不影响页面正常渲染 */ }
})();
// ========== DOM 元素引用 ==========
const addressList = document.getElementById('address-list');
const noAddress = document.getElementById('no-address');
const receiverName = document.getElementById('receiverName');
const phone = document.getElementById('phone');
const province = document.getElementById('province');
const city = document.getElementById('city');
const district = document.getElementById('district');
const detailAddress = document.getElementById('detailAddress');
const saveButton = document.getElementById('save-address');
const refreshButton = document.getElementById('refresh-address');

// ========== 工具函数 ==========

/**
 * 构造带 JWT 认证的请求头
 * 如果已登录则附加 Authorization: Bearer <token>，同时设置 Content-Type 为 application/json
 * @returns {Object} HTTP 请求头对象
 */
function authHeaders() {
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/**
 * 显示提示消息（使用浏览器 alert）
 * @param {string} message - 要显示的提示文本
 */
function showMessage(message) {
  alert(message);
}

// ========== 地址列表加载 ==========

/**
 * 从后端加载当前用户的收货地址列表并渲染到页面
 * - 未登录时提示并返回
 * - 列表为空时显示"暂无地址"占位
 * - 每条地址显示姓名、电话、省市区详细地址，并附设默认/删除按钮
 * @returns {Promise<void>}
 */
async function loadAddresses() {
  if (!token || !storedUser) {
    showMessage('请先登录后管理地址。');
    return;
  }
  addressList.innerHTML = '<p style="color:#4f6f69;">正在加载地址...</p>';
  try {
    const response = await fetch(`${API_BASE}/addresses`, { headers: authHeaders() });
    const data = await response.json();
    const items = data?.data || [];
    if (!items.length) {
      addressList.innerHTML = '';
      noAddress.style.display = 'block';
      return;
    }
    noAddress.style.display = 'none';
    addressList.innerHTML = items.map(item => `
      <div class="address-card">
        <strong>姓名：${item.receiverName || '收货人'}</strong>
        <p>电话：${item.phone || '未填写'}</p>
        <div class="address-row">
          <p>地址：${item.province || ''} ${item.city || ''} ${item.district || ''} ${item.detailAddress || ''}</p>
          ${item.isDefault ? '<span class="default-badge">默认地址</span>' : ''}
        </div>
        <div class="address-actions">
          <button type="button" data-action="default" data-id="${item.id}">设为默认</button>
          <button type="button" data-action="delete" data-id="${item.id}">删除</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    addressList.innerHTML = `<p style="color:#c23c2f;">加载失败：${error.message}</p>`;
  }
}

// ========== 新增收货地址 ==========

/**
 * 保存新收货地址到后端
 * 从表单各输入框收集收货人、电话、省/市/区及详细地址，做必填校验后 POST 到 /api/addresses
 * 保存成功后清空表单并重新加载地址列表
 * 同时对网络错误（如 CORS/后端未启动）提供详细的排查提示
 * @returns {Promise<void>}
 */
async function saveAddress() {
  if (!token || !storedUser) {
    showMessage('请先登录后管理地址。');
    return;
  }
  // 组装请求体，所有字段做 trim 处理
  const body = {
    receiverName: receiverName.value.trim(),
    phone: phone.value.trim(),
    province: province.value.trim(),
    city: city.value.trim(),
    district: district.value.trim(),
    detailAddress: detailAddress.value.trim(),
    isDefault: false
  };
  if (!body.receiverName || !body.phone || !body.province || !body.city || !body.district || !body.detailAddress) {
    showMessage('请填写收货人、手机号、省、市、区和详细地址。');
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/addresses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (response.ok && (data.code === 200 || data.code === 201)) {
      showMessage('地址已保存');
      receiverName.value = '';
      phone.value = '';
      province.value = '';
      city.value = '';
      district.value = '';
      detailAddress.value = '';
      loadAddresses();
    } else {
      showMessage(data.message || '保存地址失败');
    }
  } catch (error) {
      console.error('保存地址失败：', error);
      // 区分 TypeError（通常为 fetch 失败，如 CORS/后端未启动）和其他异常
      if (error instanceof TypeError) {
        showMessage('保存地址失败：网络请求被阻止（可能是后端未启动或浏览器 CORS 限制），请检查后端和浏览器控制台 Network 面板。错误信息：' + error.message);
      } else {
        showMessage('保存地址失败：' + (error.message || JSON.stringify(error)));
      }
  }
}

// ========== 地址操作（设为默认 / 删除）==========

/**
 * 对指定地址执行操作：设为默认地址 或 删除
 * - action='default': PUT /api/addresses/{id}/default
 * - action='delete':  DELETE /api/addresses/{id}
 * 操作成功后自动刷新地址列表
 * @param {string} action - 操作类型，'default' 或 'delete'
 * @param {string|number} id - 地址 ID
 * @returns {Promise<void>}
 */
async function updateAddress(action, id) {
  if (!token) return;
  try {
    // 根据操作类型构造不同的 URL 和 HTTP 方法
    const url = action === 'default' ? `${API_BASE}/addresses/${id}/default` : `${API_BASE}/addresses/${id}`;
    const options = { method: action === 'default' ? 'PUT' : 'DELETE', headers: authHeaders() };
    const response = await fetch(url, options);
    if (response.ok) {
      loadAddresses();
    } else {
      showMessage(action === 'default' ? '设置默认地址失败' : '删除地址失败');
    }
  } catch (error) {
    showMessage('操作失败：' + error.message);
  }
}

// ========== 事件绑定 ==========
// 地址列表点击事件委托：通过 data-action / data-id 属性识别按钮操作
addressList.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action && id) updateAddress(action, id);
});

saveButton.addEventListener('click', saveAddress);
refreshButton.addEventListener('click', loadAddresses);

// ========== 网络诊断 ==========
// 诊断按钮引用
const diagButton = document.getElementById('diag-button');

/**
 * 网络诊断函数
 * 发起一个简单的 GET /api/addresses 请求，用于检查：
 *   1. 后端服务是否在运行
 *   2. CORS 配置是否正确
 *   3. JWT Token 是否有效
 * 诊断结束后会自动重新加载地址列表
 * @returns {Promise<void>}
 */
async function runDiag() {
  if (!token) {
    alert('未检测到登录信息，请先登录后再诊断。');
    return;
  }
  addressList.innerHTML = '<p style="color:#4f6f69;">正在执行网络诊断：尝试请求 /api/addresses ...</p>';
  try {
    const resp = await fetch(`${API_BASE}/addresses`, { headers: authHeaders() });
    const txt = await resp.text();
    console.log('诊断请求响应 status:', resp.status, 'body:', txt);
    alert('诊断完成：已收到响应（查看控制台详情）。如果仍显示 Failed to fetch，说明请求被浏览器阻止（可能为 CORS 或后端未运行）。');
  } catch (e) {
    console.error('诊断请求失败：', e);
    alert('诊断失败：' + e.message + '\n可能原因：后端未启动、端口错误、或浏览器因跨域(CORS)阻止请求。请在控制台 Network 查看详细信息。');
  } finally {
    loadAddresses();
  }
}
diagButton.addEventListener('click', runDiag);

// ========== 页面初始化：加载地址列表 ==========
loadAddresses();
