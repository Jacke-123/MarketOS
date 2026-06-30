/**
 * orders.js — 用户订单页面模块
 * ============================================================================
 * 功能概述：
 *   1. 订单列表加载：根据当前登录用户 ID 从后端拉取所有订单及商品明细
 *   2. 状态筛选：通过统计卡片按"全部/待支付/已支付/已取消"过滤订单
 *   3. 搜索：按订单号/订单ID/商品名称模糊搜索
 *   4. 分页：前端分页，每页 10 条，支持首页/上一页/下一页/末页导航
 *   5. 订单操作：支付（含地址选择弹窗）、取消（恢复库存）、查看详情（弹窗展示明细）
 *   6. 清除已处理订单：一键清除已支付和已取消的订单（保留待支付）
 *
 * 依赖：
 *   - 后端 API 服务（默认 http://localhost:9000/api）
 *   - localStorage（marketos_token 用于认证，marketos_user 用于用户标识）
 * ============================================================================
 */

const API_BASE = 'http://localhost:9000/api';
const token = localStorage.getItem('marketos_token');

// ============================================================================
// 认证与身份校验
// ============================================================================

/**
 * 构建统一的认证请求头（Bearer Token）
 * 从 localStorage 实时读取 token，确保始终使用最新值
 * @returns {object} 包含 Authorization 头的对象，如 token 不存在则返回空对象
 */
function authHeaders() {
  const t = localStorage.getItem('marketos_token') || token || '';
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}
const userStr = localStorage.getItem('marketos_user');
// 校验 JWT 与用户数据一致性，防止跨标签页身份混乱
// 解码 JWT payload 中的 sub（用户名）字段，与 localStorage 中存储的 username 对比
// 不一致则清除所有认证信息并跳转到登录页
(function() {
  if (!token || !userStr) return;
  try {
    // JWT 结构：header.payload.signature，取中间部分解码
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = JSON.parse(userStr);
    if (payload.sub && user.username && payload.sub !== user.username) {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      window.location.href = 'login.html';
    }
  } catch (e) { /* JWT 解码或 JSON 解析失败时忽略，避免影响正常流程 */ }
})();

// ============================================================================
// 全局状态
// ============================================================================
let allOrders = [];               // 当前用户的全部订单列表
let currentStatusFilter = null;   // 当前状态筛选条件（null 表示全部）
let currentPage = 1;              // 当前页码
const PAGE_SIZE = 10;             // 每页显示条数
let orderItemsCache = {};         // 订单商品明细缓存，key 为订单 ID，value 为明细数组

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 从 localStorage 获取当前登录用户的 ID
 * @returns {number|null} 用户 ID，获取失败返回 null
 */
function getUserId() {
  try { const user = JSON.parse(userStr); return user?.id || user?.userId || null; } catch (e) { return null; }
}

/**
 * 显示错误提示条，6 秒后自动消失
 * @param {string} msg - 错误消息文本
 */
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

/**
 * 格式化时间字符串：将 ISO 格式的 'T' 替换为空格，截取到秒
 * @param {string} t - 原始时间字符串（如 "2024-01-01T12:00:00"）
 * @returns {string} 格式化后的时间（如 "2024-01-01 12:00:00"），空值返回 '-'
 */
function formatTime(t) { return t ? t.replace('T', ' ').substring(0, 19) : '-'; }

/**
 * 根据订单状态码返回对应的 HTML 标签
 * @param {number} s - 订单状态码：0=待支付，1=已支付，2=已取消
 * @returns {string} 带有对应 CSS class 的 span 标签 HTML
 */
function statusLabel(s) {
  if (s === 0) return '<span class="status-pill status-pending">待支付</span>';
  if (s === 1) return '<span class="status-pill status-paid">已支付</span>';
  if (s === 2) return '<span class="status-pill status-cancelled">已取消</span>';
  return '<span class="status-pill">未知</span>';
}

// ============================================================================
// 状态筛选
// ============================================================================

/**
 * 按订单状态筛选列表
 * 重置到第一页，高亮当前选中的统计卡片
 * @param {number|string} status - 状态值：0/1/2 或 'all'（全部）
 */
function filterByStatus(status) {
  currentStatusFilter = (status === 'all' || status === 'all') ? null : status;
  currentPage = 1;
  renderStatsAndTable();
  // 高亮当前选中的统计卡片（绿色边框）
  document.querySelectorAll('.stat-card').forEach(c => {
    c.style.boxShadow = (c.dataset.status == String(status)) ? '0 0 0 2px #1e574f' : '';
  });
}

// ============================================================================
// 订单数据加载
// ============================================================================

/**
 * 加载当前用户的所有订单及商品明细
 * 流程：
 *   1. 获取用户 ID（未登录则提示并显示空状态）
 *   2. 请求用户订单列表
 *   3. 并发预加载所有订单的商品明细缓存（供搜索和表格渲染使用）
 *   4. 渲染统计数据和表格
 */
async function loadOrders() {
  const userId = getUserId();
  if (!userId) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('empty').style.display = 'block';
    showError('请先登录后查看订单。');
    return;
  }
  document.getElementById('loading').style.display = 'block';
  document.getElementById('table-wrap').style.display = 'none';
  try {
    const resp = await fetch(`${API_BASE}/orders/user/${userId}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error('请求失败 (' + resp.status + ')');
    const data = await resp.json();
    allOrders = data?.data || [];
    currentPage = 1; currentStatusFilter = null;
    // 预加载所有订单的商品明细缓存，供搜索和渲染使用
    // 使用 Promise.all 并发加载，提升性能
    orderItemsCache = {};
    await Promise.all(allOrders.map(async o => {
      try {
        const r = await fetch(`${API_BASE}/orders/${o.id}/items`, { headers: authHeaders() });
        orderItemsCache[o.id] = r.ok ? ((await r.json())?.data || []) : [];
      } catch { orderItemsCache[o.id] = []; }
    }));
    // 清除统计卡片的高亮状态
    document.querySelectorAll('.stat-card').forEach(c => c.style.boxShadow = '');
    renderStatsAndTable();
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    showError('加载订单失败：' + err.message);
  }
}

/**
 * 根据当前状态筛选条件过滤订单列表
 * @returns {object[]} 过滤后的订单数组
 */
function getFilteredOrders() {
  let list = allOrders;
  if (currentStatusFilter !== null && currentStatusFilter !== 'all') {
    list = list.filter(o => o.status === currentStatusFilter);
  }
  return list;
}

// ============================================================================
// 表格渲染与分页
// ============================================================================

/**
 * 渲染统计数据和订单表格
 * 包含：
 *   - 更新顶部的统计卡片（全部/待支付/已支付/已取消数量）
 *   - 渲染当前页的订单表格行
 *   - 生成分页导航按钮
 * 统计数据始终基于全部订单（allOrders），表格内容基于筛选后的订单（getFilteredOrders）
 */
function renderStatsAndTable() {
  const filtered = getFilteredOrders();
  document.getElementById('loading').style.display = 'none';
  // 统计数据始终显示全部订单的数量
  document.getElementById('stats-row').style.display = allOrders.length ? 'grid' : 'none';
  document.getElementById('stat-total').textContent = allOrders.length;
  document.getElementById('stat-pending').textContent = allOrders.filter(o => o.status === 0).length;
  document.getElementById('stat-paid').textContent = allOrders.filter(o => o.status === 1).length;
  document.getElementById('stat-cancelled').textContent = allOrders.filter(o => o.status === 2).length;

  // 无筛选结果时显示空状态
  if (!filtered.length) {
    document.getElementById('empty').style.display = 'block';
    document.getElementById('table-wrap').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
    return;
  }
  document.getElementById('empty').style.display = 'none';
  document.getElementById('table-wrap').style.display = 'block';

  // 分页计算
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  // 防止当前页超出总页数（如删除后）
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  // 使用缓存 orderItemsCache 获取订单商品明细，渲染表格行
  document.getElementById('order-tbody').innerHTML = pageItems.map(o => {
    const items = orderItemsCache[o.id] || [];
    const summary = items.length
      ? items.map(i => `${i.productName || '商品'}<small>x${i.quantity}</small>`).join(', ')
      : '<span style="color:#999;">(无明细)</span>';
    return `
    <tr>
      <td>#${o.id}</td>
      <td style="max-width:200px;font-size:13px;">${summary}</td>
      <td class="amount">¥${o.totalAmount != null ? Number(o.totalAmount).toFixed(2) : '0.00'}</td>
      <td>${statusLabel(o.status)}</td>
      <td>${formatTime(o.createTime)}</td>
      <td class="actions">
        <button onclick="viewOrderItems(${o.id})">📋 详情</button>
        <button class="pay-btn" onclick="payOrder(${o.id})" ${o.status !== 0 ? 'disabled' : ''}>💳 支付</button>
        <button class="cancel-btn" onclick="cancelOrder(${o.id})" ${o.status !== 0 ? 'disabled' : ''}>❌ 取消</button>
      </td>
    </tr>
  `}).join('');

  // 分页导航控件（只有超过一页时显示）
  const pagDiv = document.getElementById('pagination');
  pagDiv.style.display = totalPages > 1 ? 'flex' : 'none';
  pagDiv.innerHTML = `
    <button onclick="goPage(1)" ${currentPage<=1?'disabled':''}>首页</button>
    <button onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>上一页</button>
    <span>第 ${currentPage} / ${totalPages} 页（共 ${filtered.length} 条）</span>
    <button onclick="goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>下一页</button>
    <button onclick="goPage(${totalPages})" ${currentPage>=totalPages?'disabled':''}>末页</button>
  `;
}

/**
 * 跳转到指定页码并重新渲染
 * @param {number} p - 目标页码
 */
function goPage(p) { currentPage = p; renderStatsAndTable(); }

// ============================================================================
// 清除已处理订单
// ============================================================================

/**
 * 清除已支付和已取消的订单（仅保留待支付订单）
 * 操作仅在内存中进行，用于清理当前视图
 */
function clearOrders() {
  const pendingOrders = allOrders.filter(o => o.status === 0);
  const clearableOrders = allOrders.filter(o => o.status !== 0);
  if (clearableOrders.length === 0) {
    alert('当前没有可清除的订单（待支付订单不会被清除）。');
    return;
  }
  if (!confirm(`确认清除已支付/已取消的订单吗？将清除 ${clearableOrders.length} 条订单，${pendingOrders.length} 条待支付订单将保留。`)) return;
  allOrders = pendingOrders;
  currentPage = 1;
  currentStatusFilter = null;
  document.querySelectorAll('.stat-card').forEach(c => c.style.boxShadow = '');
  document.getElementById('search-order-id').value = '';
  if (allOrders.length === 0) {
    document.getElementById('stats-row').style.display = 'none';
    document.getElementById('table-wrap').style.display = 'none';
    document.getElementById('empty').style.display = 'block';
    document.getElementById('pagination').style.display = 'none';
  } else {
    renderStatsAndTable();
  }
}

// ============================================================================
// 搜索
// ============================================================================

/**
 * 搜索订单
 * 策略：
 *   1. 输入为空时重新加载全部订单
 *   2. 输入为纯数字时，先尝试按订单 ID 精确查询（调用单个订单接口）
 *   3. 精确查询无结果或输入非数字时，拉取全部订单后按订单号/ID/商品名称模糊匹配
 * 搜索前会重新预加载商品明细缓存，确保搜索能匹配到商品名称
 */
async function searchOrder() {
  const input = document.getElementById('search-order-id').value.trim();
  if (!input) { loadOrders(); return; }
  const orderId = Number(input);
  // 尝试按订单 ID 精确查询
  if (!isNaN(orderId) && orderId > 0) {
    try {
      const resp = await fetch(`${API_BASE}/orders/${orderId}`, { headers: authHeaders() });
      if (resp.ok) {
        const order = (await resp.json())?.data;
        if (order) { allOrders = [order]; currentPage = 1; currentStatusFilter = null; renderStatsAndTable(); return; }
      }
    } catch (err) { showError('查询失败：' + err.message); return; }
  }
  // 精确查询未命中，执行全量模糊搜索
  const userId = getUserId();
  if (!userId) return;
  try {
    const resp = await fetch(`${API_BASE}/orders/user/${userId}`, { headers: authHeaders() });
    const orders = (await resp.json())?.data || [];
    // 预加载所有订单的商品明细缓存
    orderItemsCache = {};
    await Promise.all(orders.map(async o => {
      try {
        const r = await fetch(`${API_BASE}/orders/${o.id}/items`, { headers: authHeaders() });
        orderItemsCache[o.id] = r.ok ? ((await r.json())?.data || []) : [];
      } catch { orderItemsCache[o.id] = []; }
    }));
    // 按订单号/ID/商品名称匹配（大小写不敏感）
    const keyword = input.toLowerCase();
    allOrders = orders.filter(o => {
      // 订单号/ID 匹配
      if (String(o.orderNo).includes(input) || String(o.id).includes(input)) return true;
      // 商品名称匹配（利用缓存的商品明细）
      const items = orderItemsCache[o.id] || [];
      return items.some(item => (item.productName || '').toLowerCase().includes(keyword));
    });
    currentPage = 1; currentStatusFilter = null;
    if (!allOrders.length) showError(`未找到匹配"${input}"的订单`);
    renderStatsAndTable();
  } catch (err) { showError('搜索失败：' + err.message); }
}

// ============================================================================
// 页面初始化
// ============================================================================

// 绑定搜索框回车键事件，DOM 就绪后自动加载订单列表
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-order-id');
  if (searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') searchOrder();
    });
  }
  loadOrders();
});

// ============================================================================
// 订单操作：支付
// ============================================================================

/**
 * 支付订单
 * 流程：
 *   1. 获取用户收货地址列表
 *   2. 无地址时引导用户前往地址管理页添加
 *   3. 弹出地址选择弹窗，用户确认后执行两步操作：
 *      a. 更新订单收货信息（PUT /orders/{id}/receiver）
 *      b. 调用支付接口（PUT /orders/{id}/pay）
 *   4. 支付成功后刷新订单列表
 * @param {number} orderId - 要支付的订单 ID
 */
async function payOrder(orderId) {
  // 获取地址列表
  let addrs = [];
  try {
    const aR = await fetch(`${API_BASE}/addresses`, { headers: authHeaders() });
    addrs = (await aR.json())?.data || [];
  } catch (err) { showError('获取地址失败：' + err.message); return; }

  // 无地址时引导用户前去添加
  if (!addrs.length) {
    if (confirm('您还没有收货地址，是否现在去添加？')) {
      window.location.href = 'address.html';
    }
    return;
  }

  showAddrModal(addrs, async (addr) => {
    if (!addr) return;  // 用户取消选择
    try {
      // 第一步：先更新收货信息（拼接省市区+详细地址）
      const p = `receiverName=${encodeURIComponent(addr.receiverName)}&phone=${encodeURIComponent(addr.phone)}&address=${encodeURIComponent(addr.province+addr.city+addr.district+' '+(addr.detailAddress||''))}`;
      const uR = await fetch(`${API_BASE}/orders/${orderId}/receiver?${p}`, { method: 'PUT', headers: authHeaders() });
      if (!uR.ok) { const t = await uR.text(); let m = t; try { m = JSON.parse(t).message || t; } catch(e) {} throw new Error(m); }
      // 第二步：再支付
      const resp = await fetch(`${API_BASE}/orders/${orderId}/pay`, { method: 'PUT', headers: authHeaders() });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.message || '支付失败');
      }
      alert('✅ 订单支付成功！');
      loadOrders();
    } catch (err) {
      showError('支付失败：' + err.message);
    }
  });
}

// ============================================================================
// 订单操作：取消
// ============================================================================

/**
 * 取消订单（仅待支付状态的订单可取消）
 * 取消后后端会自动恢复该订单关联的商品库存
 * @param {number} orderId - 要取消的订单 ID
 */
async function cancelOrder(orderId) {
  if (!confirm('确认取消该订单吗？取消后将恢复库存。')) return;
  try {
    const resp = await fetch(`${API_BASE}/orders/${orderId}/cancel`, { method: 'PUT', headers: authHeaders() });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || '取消失败');
    }
    alert('订单已取消，库存已恢复。');
    loadOrders();
  } catch (err) {
    showError('取消失败：' + err.message);
  }
}

// ============================================================================
// 订单详情弹窗
// ============================================================================

/**
 * 查看订单详情（弹窗展示）
 * 并发请求订单基本信息（/orders/{id}）和商品明细（/orders/{id}/items）
 * 在弹窗中渲染：
 *   - 订单概览：编号、ID、金额、状态
 *   - 收货信息：收货人、电话、地址
 *   - 商品明细表格：商品名称、单价、数量、小计
 * @param {number} orderId - 订单 ID
 */
async function viewOrderItems(orderId) {
  const modal = document.getElementById('items-modal');
  const content = document.getElementById('items-modal-content');
  // 先显示加载中状态
  content.innerHTML = '<p style="text-align:center;color:#999;">加载中...</p>';
  modal.style.display = 'flex';

  try {
    // 并发请求订单信息和商品明细，减少等待时间
    const [orderResp, itemsResp] = await Promise.all([
      fetch(`${API_BASE}/orders/${orderId}`, { headers: authHeaders() }),
      fetch(`${API_BASE}/orders/${orderId}/items`, { headers: authHeaders() })
    ]);
    const orderData = await orderResp.json();
    const order = orderData?.data || {};
    const itemsData = await itemsResp.json();
    const items = itemsData?.data || [];

    // 构建订单概览区域 HTML
    let html = '<div class="order-info-row">';
    html += `<div><span class="label">订单编号</span><br><span class="value" style="font-family:monospace;">${order.orderNo || '-'}</span></div>`;
    html += `<div><span class="label">订单ID</span><br><span class="value">#${orderId}</span></div>`;
    html += `<div><span class="label">金额</span><br><span class="value amount">¥${order.totalAmount != null ? Number(order.totalAmount).toFixed(2) : '-'}</span></div>`;
    html += `<div><span class="label">状态</span><br>${statusLabel(order.status)}</span></div>`;
    html += '</div>';
    // 构建收货信息区域 HTML
    html += '<div class="order-info-row" style="margin-top:12px;">';
    html += `<div><span class="label">收货人</span><br><span class="value">${order.receiverName || '-'}</span></div>`;
    html += `<div><span class="label">电话</span><br><span class="value">${order.phone || '-'}</span></div>`;
    // 地址字段占满整行
    html += `<div style="grid-column:1/-1;"><span class="label">地址</span><br><span class="value">${order.address || '-'}</span></div>`;
    html += '</div>';

    // 商品明细表格
    if (items.length === 0) {
      html += '<p style="text-align:center;color:#999;">暂无明细数据</p>';
    } else {
      html += `<table><thead><tr><th>商品名称</th><th>单价</th><th>数量</th><th>小计</th></tr></thead><tbody>`;
      items.forEach(item => {
        html += `<tr>
          <td>${item.productName || '商品#' + item.productId}</td>
          <td>¥${item.unitPrice != null ? Number(item.unitPrice).toFixed(2) : '-'}</td>
          <td>${item.quantity}</td>
          <td class="amount">¥${item.totalPrice != null ? Number(item.totalPrice).toFixed(2) : '-'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<p style="color:#c0392b;">加载失败：${err.message}</p>`;
  }
}

/**
 * 关闭订单详情弹窗
 */
function closeItemsModal() {
  document.getElementById('items-modal').style.display = 'none';
}

// ============================================================================
// 地址选择弹窗（支付时使用）
// ============================================================================

/**
 * 显示地址选择弹窗
 * 如果只有一个地址则直接展示详情；多个地址时提供下拉选择器
 * 弹窗包含"确认"、"取消"和"管理地址"三个操作按钮
 *
 * @param {object[]} addrs    - 用户收货地址数组
 * @param {Function} callback - 回调函数，参数为选中的地址对象或 null（取消时）
 */
function showAddrModal(addrs, callback) {
  // 默认选中地址：优先取 isDefault 为 true 的地址，否则取第一个
  const def = addrs.find(a => a.isDefault) || addrs[0];
  let selected = def;
  const card = document.getElementById('addr-card');

  /**
   * 渲染单个地址的详细信息 HTML
   * @param {object} addr - 地址对象
   * @returns {string} 地址详情的 HTML 字符串
   */
  function renderAddrDetail(addr) {
    return `
      <div class="addr-field">
        <span class="addr-label">收货人</span>
        <span class="addr-value">${addr.receiverName || ''}</span>
      </div>
      <div class="addr-field">
        <span class="addr-label">联系电话</span>
        <span class="addr-value">${addr.phone || ''}</span>
      </div>
      <div class="addr-field">
        <span class="addr-label">所在地区</span>
        <span class="addr-value">${addr.province || ''} ${addr.city || ''} ${addr.district || ''}</span>
      </div>
      <div class="addr-field">
        <span class="addr-label">详细地址</span>
        <span class="addr-value">${addr.detailAddress || ''}</span>
      </div>
    `;
  }

  if (addrs.length === 1) {
    // 只有一个地址时直接展示详情
    card.innerHTML = renderAddrDetail(def);
  } else {
    // 多个地址时提供下拉选择器
    const opts = addrs.map((a, i) => `<option value="${i}" ${a.id === def.id ? 'selected' : ''}>${a.receiverName} — ${a.province || ''}${a.city || ''}${a.district || ''} ${a.detailAddress || ''}</option>`).join('');
    card.innerHTML = `
      <select id="addr-select" style="width:100%;padding:10px;border-radius:12px;border:1px solid #d7e5df;font-size:14px;margin-bottom:14px;">${opts}</select>
      <div id="addr-detail">${renderAddrDetail(selected)}</div>
    `;
  }
  document.getElementById('addr-modal').style.display = 'flex';

  // 下拉选择切换时更新详情区域
  if (addrs.length > 1) {
    document.getElementById('addr-select').onchange = (e) => {
      selected = addrs[parseInt(e.target.value)];
      document.getElementById('addr-detail').innerHTML = renderAddrDetail(selected);
    };
  }

  // 确认按钮：关闭弹窗并回调选中的地址
  document.getElementById('addr-confirm').onclick = () => {
    if (addrs.length > 1) selected = addrs[parseInt(document.getElementById('addr-select').value)];
    document.getElementById('addr-modal').style.display = 'none';
    callback(selected);
  };
  // 取消按钮：关闭弹窗并回调 null
  document.getElementById('addr-cancel').onclick = () => { document.getElementById('addr-modal').style.display = 'none'; callback(null); };
  // 管理地址按钮：跳转到地址管理页面
  document.getElementById('addr-manage').onclick = () => { window.location.href = 'address.html'; };
}
