/**
 * ===========================================================================
 * favorites.js — 商品收藏管理模块
 * ===========================================================================
 *
 * 功能概览：
 *   1. 基于 localStorage 的收藏商品持久化存储（getFavorites / saveFavorites）
 *   2. 收藏列表渲染（renderFavorites）：显示商品图片、名称、分类、收藏时间、单价
 *   3. 取消收藏（removeFavorite）：从 localStorage 中移除指定商品
 *   4. 从收藏夹加入购物车（addToCart）：POST 到后端 /api/carts/add
 *   5. 一键清空所有收藏
 *   6. JWT 与用户数据一致性校验
 *
 * 存储键：'marketos_favorites' — 存储 JSON 序列化的收藏商品数组
 * 每个收藏项包含：productId, name, image, price, categoryName, favoritedAt
 *
 * 依赖：
 *   - 后端 API 基地址：http://localhost:9000/api
 *   - localStorage 中的 marketos_token、marketos_user、marketos_favorites
 *   - 对应页面 DOM 元素（favorites-list, empty, summary 等）
 * ===========================================================================
 */

const FAVORITE_KEY = 'marketos_favorites';
const API_BASE = 'http://localhost:9000/api';

// ========== DOM 元素引用 ==========
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const favoritesList = document.getElementById('favorites-list');
const summary = document.getElementById('summary');
const favoriteCount = document.getElementById('favorite-count');
const clearAllBtn = document.getElementById('clear-all');

// ========== JWT 与用户数据一致性校验（防跨标签页身份混乱）==========
// 解析 JWT payload 中的 sub 字段与缓存的 username 对比，不匹配则清空登录态并跳转登录页
(function() {
  const t = localStorage.getItem('marketos_token');
  const u = localStorage.getItem('marketos_user');
  if (!t || !u) return;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    const user = JSON.parse(u);
    if (payload.sub && user.username && payload.sub !== user.username) {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      window.location.href = 'login.html';
    }
  } catch (e) { /* JWT 解析失败或数据异常时忽略，不影响页面正常渲染 */ }
})();

// ========== localStorage 收藏数据读写 ==========

/**
 * 从 localStorage 获取收藏商品列表
 * @returns {Array} 收藏商品数组，解析失败时返回空数组
 */
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITE_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * 将收藏列表序列化并保存到 localStorage
 * @param {Array} list - 收藏商品数组
 */
function saveFavorites(list) {
  localStorage.setItem(FAVORITE_KEY, JSON.stringify(list));
}

/**
 * 获取当前登录用户信息
 * 从 localStorage 读取 marketos_token 和 marketos_user 并校验一致性
 * @returns {Object|null} 用户对象，未登录或数据异常时返回 null
 */
function getCurrentUser() {
  const token = localStorage.getItem('marketos_token');
  const storedUser = localStorage.getItem('marketos_user');
  if (!token || !storedUser) return null;
  try { return JSON.parse(storedUser); } catch { return null; }
}

/**
 * 格式化价格为两位小数字符串
 * @param {number|string} price - 原始价格值
 * @returns {string} 格式化后的价格（如 "19.90"），非数字则返回 "0.00"
 */
function formatPrice(price) {
  const num = Number(price);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

// ========== 收藏列表渲染 ==========

/**
 * 渲染收藏商品列表到页面
 * - 无收藏时显示空状态
 * - 每条收藏显示：商品图片（或占位图）、名称、分类、收藏时间、单价
 * - 同时更新顶部计数和操作按钮（加入购物车 / 取消收藏）
 */
function renderFavorites() {
  const favorites = getFavorites();
  loading.style.display = 'none';
  if (!favorites.length) {
    empty.style.display = 'block';
    favoritesList.innerHTML = '';
    summary.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  favoritesList.innerHTML = favorites.map(item => `
    <div class="favorite-item" data-product-id="${item.productId}">
      ${ item.image
          ? `<img src="${item.image}" alt="${item.name || '商品'}" />`
          : '<div style="height:140px;background:#e8ecea;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#b0bdb6;font-size:12px;">暂无图片</div>' }
      <div class="item-info">
        <h3>${item.name || '商品名称'}</h3>
        <p>${item.categoryName ? '分类：' + item.categoryName : ''}</p>
        <div class="item-meta">
          <span>收藏时间：${item.favoritedAt ? new Date(item.favoritedAt).toLocaleString() : '-'}</span>
        </div>
        <div class="item-price">¥${formatPrice(item.price)}</div>
      </div>
      <div class="item-actions">
        <button class="cart-btn" type="button" data-action="add-cart" data-product-id="${item.productId}">加入购物车</button>
        <button class="remove-btn" type="button" data-action="remove" data-product-id="${item.productId}">取消收藏</button>
      </div>
    </div>
  `).join('');
  favoriteCount.textContent = `共 ${favorites.length} 个收藏商品`;
  summary.style.display = 'flex';
}

// ========== 收藏操作 ==========

/**
 * 取消收藏指定商品
 * 从 localStorage 中过滤掉该 productId，保存后重新渲染
 * @param {string|number} productId - 要移除的商品 ID
 */
function removeFavorite(productId) {
  const favorites = getFavorites().filter(item => item.productId != productId);
  saveFavorites(favorites);
  renderFavorites();
}

/**
 * 将收藏商品加入购物车
 * 需要用户已登录。从 localStorage 中查找对应商品信息，构造购物车添加请求
 * 请求体包含：userId, productId, productName, productImage, price, quantity(默认1), checked(默认true)
 * @param {string|number} productId - 要加入购物车的商品 ID
 * @returns {Promise<void>}
 */
async function addToCart(productId) {
  const user = getCurrentUser();
  if (!user) {
    alert('请先登录后再加入购物车');
    window.location.href = 'login.html';
    return;
  }
  const favorites = getFavorites();
  const product = favorites.find(item => item.productId == productId);
  if (!product) {
    alert('未找到收藏商品，请刷新页面重试');
    return;
  }
  // 构造购物车添加请求体
  const payload = {
    userId: user.id,
    productId: product.productId,
    productName: product.name,
    productImage: product.image || '',
    price: Number(product.price) || 0,
    quantity: 1,       // 默认数量为 1
    checked: true      // 默认已勾选
  };
  try {
    const response = await fetch(`${API_BASE}/carts/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (response.ok) {
      alert('已加入购物车 🛒');
    } else {
      alert(data?.message || '加入购物车失败');
    }
  } catch (error) {
    alert('加入购物车失败：' + (error?.message || '网络错误'));
  }
}

// ========== 事件委托：收藏列表按钮点击 ==========
// 识别 data-action="remove" → 取消收藏；data-action="add-cart" → 加入购物车
favoritesList.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  const productId = button.dataset.productId;
  if (!productId) return;
  if (action === 'remove') {
    removeFavorite(productId);
  } else if (action === 'add-cart') {
    addToCart(productId);
  }
});

// ========== 一键清空收藏 ==========
clearAllBtn.addEventListener('click', () => {
  if (!confirm('确认清空所有收藏吗？')) return;
  saveFavorites([]);
  renderFavorites();
});

// ========== 页面初始化：渲染收藏列表 ==========
renderFavorites();
