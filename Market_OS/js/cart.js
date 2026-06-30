/**
 * ===========================================================================
 * cart.js — 购物车管理模块
 * ===========================================================================
 *
 * 功能概览：
 *   1. 购物车商品列表获取与渲染（fetchCart）
 *   2. 商品数量增减与删除（updateQuantity / removeItem）
 *   3. 商品勾选/取消勾选（toggleChecked / toggleCheckAll）
 *   4. 清空购物车（clearCart）
 *   5. 结算下单流程（含地址选择弹窗 showAddressModal）
 *   6. 图片 URL 修复与适配（fixImgUrl）
 *   7. JWT 认证与用户信息校验
 *
 * 依赖：
 *   - 后端 API 基地址：http://localhost:9000/api
 *   - 图片资源基地址：http://localhost:9000
 *   - localStorage 中的 marketos_token 和 marketos_user
 *   - 对应页面 DOM 元素（cart-items, cart-summary, checkout-button 等）
 * ===========================================================================
 */

const token = localStorage.getItem('marketos_token');
const userStr = localStorage.getItem('marketos_user');

// ========== JWT 与用户数据一致性校验（防跨标签页身份混乱）==========
// 解析 JWT payload 中的 sub 字段与缓存的 username 对比，不匹配则清空登录态并跳转登录页
(function() {
  if (!token || !userStr) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = JSON.parse(userStr);
    if (payload.sub && user.username && payload.sub !== user.username) {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      window.location.href = 'login.html';
    }
  } catch (e) { /* JWT 解析失败或数据异常时忽略，不影响页面正常渲染 */ }
})();

// ========== DOM 元素引用 ==========
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const cartItems = document.getElementById('cart-items');
const cartSummary = document.getElementById('cart-summary');
const totalPriceEl = document.getElementById('total-price');
const checkoutButton = document.getElementById('checkout-button');

// ========== UI 状态切换工具函数 ==========

/**
 * 显示"购物车为空"状态
 * 隐藏 loading 和结算栏，显示空状态占位并清空列表内容
 */
function showEmpty() {
  loading.style.display = 'none';
  cartSummary.style.display = 'none';
  empty.style.display = 'block';
  cartItems.innerHTML = '';
}

/**
 * 在 loading 区域显示错误提示文本
 * @param {string} message - 错误提示信息
 */
function showError(message) {
  loading.textContent = message;
}

// ========== API 与资源基地址 ==========
const apiHost = 'http://localhost:9000/api';
const IMG_BASE = 'http://localhost:9000';

// ========== 工具函数 ==========

/**
 * 构造统一认证请求头
 * 如果存在 JWT Token 则附加 Authorization: Bearer 头
 * @returns {Object} HTTP 请求头对象
 */
function authHeaders() {
  const t = localStorage.getItem('marketos_token') || '';
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}
/**
 * 修复图片 URL，统一拼接为可访问的完整地址
 * 处理逻辑：
 *   1. 多图逗号分隔时取第一张
 *   2. 已是 localhost:9000 的地址保持不变（兼容数据中已存的旧格式）
 *   3. /uploads/ 开头的相对路径补全 IMG_BASE
 *   4. 其他 http(s) 完整 URL 原样返回
 *   5. 其余情况补全 IMG_BASE
 * @param {string} url - 原始图片 URL（可能包含多张图片，逗号分隔）
 * @returns {string} 修复后的完整图片 URL
 */
function fixImgUrl(url) {
  if (!url) return '';
  // 取第一张图，并统一走网关 9000
  const first = url.split(',')[0].trim();
  if (!first) return '';
  // 兜底替换：确保已包含 localhost:9000 的 URL 不变（兼容遗留数据）
  if (first.includes('localhost:9000')) return first.replace('localhost:9000', 'localhost:9000');
  if (first.startsWith('/uploads/')) return IMG_BASE + first;
  if (first.startsWith('http')) return first;
  return IMG_BASE + first;
}

// ========== 购物车数据获取与渲染 ==========

/**
 * 从后端获取购物车列表并渲染
 * - 未登录时提示并返回
 * - 空列表显示空状态
 * - 渲染商品卡片：复选框、图片、名称、单价、数量加减、行总价、删除按钮
 * - 计算已勾选商品总价，更新全选复选框状态
 * @returns {Promise<void>}
 */
async function fetchCart() {
  if (!token || !userStr) {
    showError('请先登录后查看购物车。');
    return;
  }
  try {
    const user = JSON.parse(userStr);
    const response = await fetch(`${apiHost}/carts/list/${user.id}`, { headers: authHeaders() });
    const data = await response.json();
    const items = data?.data || [];
    loading.style.display = 'none';
    if (!items.length) {
      showEmpty();
      return;
    }
    empty.style.display = 'none';
    cartItems.innerHTML = items.map(item => `
      <div class="item-row" data-id="${item.id}" data-product-id="${item.productId}">
        <input type="checkbox" class="item-check" data-id="${item.id}" ${item.checked ? 'checked' : ''} />
        ${ fixImgUrl(item.productImage)
          ? `<img src="${fixImgUrl(item.productImage)}" alt="${item.productName}" />`
          : '<div style="width:120px;height:100px;background:#e8ecea;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#b0bdb6;font-size:12px;">暂无图片</div>' }
        <div class="item-info">
          <h3>${item.productName}</h3>
          <p>单价 ¥${item.price}</p>
          <div class="qty-row">
            <button class="qty-decrease" data-id="${item.id}">−</button>
            <span class="qty-num qty" data-id="${item.id}">${item.quantity}</span>
            <button class="qty-increase" data-id="${item.id}">+</button>
          </div>
        </div>
        <div class="item-price">¥${(item.price * item.quantity).toFixed(2)}</div>
        <div class="item-actions">
          <button type="button" data-action="remove" data-id="${item.id}">删除</button>
        </div>
      </div>
    `).join('');
    // 只计算已选中的商品总价
    const total = items.filter(i => i.checked).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    totalPriceEl.textContent = total.toFixed(2);
    // 更新全选复选框状态
    const selectAllEl = document.getElementById('select-all');
    if (selectAllEl) selectAllEl.checked = items.length > 0 && items.every(i => i.checked);
    cartSummary.style.display = 'flex';
  } catch (error) {
    showError('加载购物车失败，请稍后重试。' + (error?.message ? ' 错误：' + error.message : ''));
    console.error('fetchCart error:', error);
  }
}

// ========== 购物车商品操作 ==========

/**
 * 删除购物车中的指定商品
 * 操作前弹出确认对话框，成功后自动刷新购物车列表
 * @param {string|number} cartId - 购物车项 ID
 * @returns {Promise<void>}
 */
async function removeItem(cartId) {
  if (!confirm('确认删除该商品吗？')) return;
  try {
    const response = await fetch(`${apiHost}/carts/delete/${cartId}`, {
      method: 'DELETE', headers: authHeaders()
    });
    if (response.ok) {
      fetchCart();
    } else {
      alert('删除失败，请稍后重试');
    }
  } catch (error) {
    alert('删除购物车项失败：' + error.message);
  }
}

/**
 * 更新购物车中某商品的数量
 * 数量必须大于 0，更新成功后刷新购物车
 * @param {string|number} cartId - 购物车项 ID
 * @param {number} quantity - 新的数量值
 * @returns {Promise<void>}
 */
async function updateQuantity(cartId, quantity) {
  if (quantity <= 0) {
    alert('数量必须大于0');
    return;
  }
  try {
    const response = await fetch(`${apiHost}/carts/update/${cartId}?quantity=${quantity}`, { method: 'PUT', headers: authHeaders() });
    if (response.ok) fetchCart(); else alert('更新数量失败');
  } catch (e) { alert('更新数量失败：' + e.message); }
}

/**
 * 切换单个购物车商品的选中/取消选中状态
 * @param {string|number} cartId - 购物车项 ID
 * @param {boolean} checked - 新的选中状态
 * @returns {Promise<void>}
 */
async function toggleChecked(cartId, checked) {
  try {
    const response = await fetch(`${apiHost}/carts/check/${cartId}?checked=${checked}`, { method: 'PUT', headers: authHeaders() });
    if (response.ok) fetchCart(); else alert('修改选中状态失败');
  } catch (e) { alert('修改选中状态失败：' + e.message); }
}

/**
 * 全选/取消全选购物车中的所有商品
 * @param {string|number} userId - 当前用户 ID
 * @param {boolean} checked - true 全选 / false 取消全选
 * @returns {Promise<void>}
 */
async function toggleCheckAll(userId, checked) {
  try {
    const response = await fetch(`${apiHost}/carts/checkAll/${userId}?checked=${checked}`, { method: 'PUT', headers: authHeaders() });
    if (response.ok) fetchCart(); else alert('全选/取消全选失败');
  } catch (e) { alert('全选操作失败：' + e.message); }
}

/**
 * 清空当前用户购物车中的所有商品
 * 操作前弹出确认对话框
 * @param {string|number} userId - 当前用户 ID
 * @returns {Promise<void>}
 */
async function clearCart(userId) {
  if (!confirm('确认清空购物车吗？')) return;
  try {
    const response = await fetch(`${apiHost}/carts/clear/${userId}`, { method: 'DELETE', headers: authHeaders() });
    if (response.ok) fetchCart(); else alert('清空购物车失败');
  } catch (e) { alert('清空失败：' + e.message); }
}

// ========== 事件委托：购物车列表内的点击事件 ==========
// 统一处理三种操作：删除商品、数量增加、数量减少
cartItems.addEventListener('click', (event) => {
  const target = event.target;
  // 删除按钮
  if (target.dataset.action === 'remove') {
    removeItem(target.dataset.id);
    return;
  }
  // 数量增加/减少
  if (target.classList.contains('qty-increase')) {
    const id = target.dataset.id;
    const span = document.querySelector(`.qty[data-id="${id}"]`);
    const current = Number(span.textContent || '0');
    updateQuantity(id, current + 1);
    return;
  }
  if (target.classList.contains('qty-decrease')) {
    const id = target.dataset.id;
    const span = document.querySelector(`.qty[data-id="${id}"]`);
    const current = Number(span.textContent || '0');
    if (current - 1 <= 0) { if (confirm('数量将为0，是否删除该商品？')) removeItem(id); return; }
    updateQuantity(id, current - 1);
    return;
  }
});

// ========== 事件委托：购物车复选框变化监听 ==========
// 当任意商品复选框勾选状态变化时，调用后端接口同步
cartItems.addEventListener('change', (event) => {
  const target = event.target;
  if (target.classList.contains('item-check')) {
    const id = target.dataset.id;
    toggleChecked(id, target.checked);
  }
});

// ========== 结算地址弹窗 ==========

/**
 * 显示收货地址选择弹窗
 * - 仅一个地址时直接显示详情，省略下拉选择
 * - 多个地址时渲染 <select> 下拉框 + 详情区域，切换选项时动态更新详情
 * - 提供"确认""取消""管理地址"三种操作按钮
 * - 确认后调用 callback(selectedAddress)，取消时 callback(null)
 * @param {Array} addrs - 当前用户的收货地址数组
 * @param {function} callback - 确认/取消后的回调，接收选中的地址对象或 null
 */
function showAddressModal(addrs, callback) {
  // 优先选择默认地址，无默认地址时取第一个
  const def = addrs.find(a => a.isDefault) || addrs[0];
  let selected = def;
  const card = document.getElementById('addr-card');

  /**
   * 渲染单个地址的详细信息 HTML 片段
   * @param {Object} addr - 地址对象
   * @returns {string} HTML 字符串
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
    card.innerHTML = renderAddrDetail(def);
  } else {
    const opts = addrs.map((a, i) => `<option value="${i}" ${a.id === def.id ? 'selected' : ''}>${a.receiverName} — ${a.province || ''}${a.city || ''}${a.district || ''} ${a.detailAddress || ''}</option>`).join('');
    card.innerHTML = `
      <select id="addr-select" style="width:100%;padding:10px;border-radius:12px;border:1px solid #d7e5df;font-size:14px;margin-bottom:14px;">${opts}</select>
      <div id="addr-detail">${renderAddrDetail(selected)}</div>
    `;
  }
  document.getElementById('addr-modal').style.display = 'flex';

  if (addrs.length > 1) {
    document.getElementById('addr-select').onchange = (e) => {
      selected = addrs[parseInt(e.target.value)];
      document.getElementById('addr-detail').innerHTML = renderAddrDetail(selected);
    };
  }

  document.getElementById('addr-confirm').onclick = () => {
    if (addrs.length > 1) selected = addrs[parseInt(document.getElementById('addr-select').value)];
    document.getElementById('addr-modal').style.display = 'none';
    callback(selected);
  };
  document.getElementById('addr-cancel').onclick = () => { document.getElementById('addr-modal').style.display = 'none'; callback(null); };
  document.getElementById('addr-manage').onclick = () => { window.location.href = 'address.html'; };
}

// ========== 结算下单流程 ==========

/**
 * 结算按钮点击事件处理
 * 完整流程：
 *   1. 校验登录态
 *   2. 获取用户 ID
 *   3. 从后端获取当前已勾选的购物车项
 *   4. 加载用户收货地址，弹出地址选择弹窗
 *   5. 用户确认地址后，构造订单请求体并 POST 创建订单
 *   6. 订单创建成功后，删除已结算的购物车项
 *   7. 提示用户并跳转到订单列表页
 */
checkoutButton.addEventListener('click', async () => {
  if (!token || !userStr) { alert('请先登录后再结算。'); window.location.href = 'login.html'; return; }
  let user;
  try { user = JSON.parse(userStr); } catch (e) { alert('登录信息异常，请重新登录。'); return; }
  const userId = user.id || user.userId;
  if (!userId) { alert('无法获取用户ID，请重新登录。'); return; }

  let checkedItems = [];
  try {
    const cR = await fetch(`${apiHost}/carts/list/${userId}`, { headers: authHeaders() });
    checkedItems = ((await cR.json())?.data || []).filter(i => i.checked);
  } catch (err) { alert('获取购物车数据失败'); return; }

  if (!checkedItems.length) { alert('请先在购物车中勾选要结算的商品。'); return; }

  const orderItems = checkedItems.map(item => ({
    productId: item.productId, quantity: item.quantity,
    unitPrice: Number(item.price), totalPrice: Number((item.price * item.quantity).toFixed(2))
  }));
  try {
    // 向订单服务 POST 创建订单
    const resp = await fetch(`${apiHost}/orders?userId=${userId}`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(orderItems) });
    // 响应非 ok 时尝试提取后端返回的错误消息
    if (!resp.ok) { const t = await resp.text(); let m = t; try { m = JSON.parse(t).message || t; } catch(e) {} throw new Error(m); }
    const order = (await resp.json())?.data;
    // 订单创建成功后，删除已结算的购物车项（忽略单个删除失败）
    for (const item of checkedItems) { try { await fetch(`${apiHost}/carts/delete/${item.id}`, { method: 'DELETE', headers: authHeaders() }); } catch (e) {} }
    alert(`📋 订单已生成，支付时请确认收货地址\n订单编号：${order.orderNo}\n总金额：¥${Number(order.totalAmount).toFixed(2)}`);
    window.location.href = 'orders.html';
  } catch (err) { alert('创建订单失败：' + err.message); }
});

// ========== 全选与清空按钮 ==========
const selectAllEl = document.getElementById('select-all');
const clearButton = document.getElementById('clear-button');

// 全选复选框变化时，同步所有购物车项的选中状态
selectAllEl.addEventListener('change', () => {
  if (!userStr) return;
  const user = JSON.parse(userStr);
  toggleCheckAll(user.id, selectAllEl.checked);
});

// 清空按钮点击时，弹出确认后清空购物车
clearButton.addEventListener('click', () => {
  if (!userStr) return;
  const user = JSON.parse(userStr);
  clearCart(user.id);
});

// ========== 页面初始化：加载购物车数据 ==========
fetchCart();
