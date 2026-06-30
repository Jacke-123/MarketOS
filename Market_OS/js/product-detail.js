/**
 * product-detail.js - 商品详情页模块
 * 基于 Vue 3 构建，提供商品详情展示、图片轮播、数量选择、
 * 加入购物车、收藏切换（localStorage 持久化）、JWT 身份校验等功能。
 * 通过 CDN 引入 Vue 3 和 Axios，无需构建工具即可运行。
 */

/* ============================
 * 全局配置
 * ============================ */

const API_BASE = 'http://localhost:9000/api';

// 自动从 API_BASE 提取图片服务器地址，兜底为 localhost:9000
  const IMAGE_SERVER = (() => {
try {
  const url = new URL(API_BASE);
  return url.origin;
} catch {
  return 'http://localhost:9000';
}
  })();
  const { createApp } = Vue;

/* ============================
 * Vue 应用初始化
 * ============================ */

  createApp({
  /**
   * data() - Vue 组件响应式数据定义
   * @returns {Object} 组件初始状态数据
   */
data() {
  return {
    /** 品牌 Logo 图片地址，优先从 localStorage 读取 */
    logoImage: localStorage.getItem('marketos_logo') || 'https://placehold.co/40x40/1e574f/white?text=广',
    /** 当前商品 ID，从 URL 参数中获取 */
    productId: null,
    /** 商品详情对象 */
    product: {},
    /** 商品库存数量 */
    stockQuantity: 0,
    /** 用户选择的数量，默认 1 */
    quantity: 1,
    /** 页面加载状态标识 */
    loading: true,
    /** 错误信息，非空时页面显示错误提示 */
    error: '',
    /** 商品图片地址列表（已处理为完整 URL） */
    imageList: [],
    /** 当前轮播图索引 */
    currentIndex: 0,
    /** 当前商品是否已收藏 */
    isFavorited: false,
    /** 图片加载失败时的占位图地址 */
    placeholderImage: ''
  };
},
  /**
   * computed - 计算属性
   * 基于响应式数据自动派生 UI 所需的状态值
   */
computed: {
  /**
   * stockClass - 根据库存数量返回对应的 CSS 类名
   * @returns {string} 'out'（缺货）| 'low'（库存紧张，<10）| 'available'（有货）
   */
  stockClass() {
    if (this.stockQuantity <= 0) return 'out';
    if (this.stockQuantity < 10) return 'low';
    return 'available';
  },
  /**
   * stockText - 根据库存数量返回展示文本
   * @returns {string} 库存状态描述文案
   */
  stockText() {
    if (this.stockQuantity <= 0) return '缺货';
    return `库存 ${this.stockQuantity} 件`;
  }
},
  /**
   * mounted() - 组件挂载后的生命周期钩子
   * 执行流程：
   * 1. 校验 JWT Token 与 localStorage 用户数据一致性（防止跨标签页身份混乱）
   * 2. 加载 Logo 图片
   * 3. 从 URL 参数中读取商品 ID
   * 4. 初始化收藏状态并加载商品详情
   */
mounted() {
  // 校验 JWT 与用户数据一致性，防止跨标签页身份混乱
  const t = localStorage.getItem('marketos_token');
  const u = localStorage.getItem('marketos_user');
  if (t && u) {
    try {
      // 解析 JWT payload 部分（Token 格式：header.payload.signature）
      const payload = JSON.parse(atob(t.split('.')[1]));
      const user = JSON.parse(u);
      // 比较 JWT 中的用户名与 localStorage 中的用户名是否一致
      if (payload.sub && user.username && payload.sub !== user.username) {
        // 不一致则清除登录状态，强制跳转到登录页
        localStorage.removeItem('marketos_token');
        localStorage.removeItem('marketos_user');
        window.location.href = 'login.html';
        return;
      }
    } catch (e) { /* JWT 解析失败时静默忽略，继续正常流程 */ }
  }
  // 从 localStorage 恢复自定义 Logo
  this.loadLogo();
  // 从 URL 查询参数中提取商品 ID
  const params = new URLSearchParams(window.location.search);
  this.productId = params.get('id');
  if (!this.productId) {
    this.error = '未指定商品ID';
    this.loading = false;
    return;
  }
  // 检查该商品是否已被当前用户收藏
  this.checkFavorite();
  // 加载商品详情及库存数据
  this.loadDetail();
},
methods: {

    /* ============================
     * 认证与工具方法
     * ============================ */

    /**
     * authHeader - 构造带有 JWT Token 的请求头
     * @returns {Object} 若 Token 存在则返回 { Authorization: 'Bearer <token>' }，否则返回空对象
     */
    authHeader() {
      const t = localStorage.getItem('marketos_token') || '';
      return t ? { Authorization: `Bearer ${t}` } : {};
    },

  /**
   * loadLogo - 从 localStorage 加载自定义品牌 Logo 地址
   */
  loadLogo() {
    const saved = localStorage.getItem('marketos_logo');
    if (saved) this.logoImage = saved;
  },

  /**
   * loadDetail - 加载商品详情及库存数据
   * 同时发起两个 API 请求（商品详情 + 库存），使用 Promise.all 并行等待。
   * 响应统一适配 product 结构，并处理图片 URL 的拼接（多图以逗号分隔）。
   * 库存数据优先从商品详情中读取，其次从独立库存接口获取。
   */
  loadDetail() {
    this.loading = true;
    // 并行请求：商品详情 + 库存
    const productReq = axios.get(`${API_BASE}/products/${this.productId}`);
    // 库存请求失败时返回 null，不影响商品详情展示
    const stockReq = axios.get(`${API_BASE}/stocks/product/${this.productId}`).catch(() => null);

    Promise.all([productReq, stockReq])
      .then(([productResp, stockResp]) => {
        // 适配不同的 API 响应格式：优先取 data.data，兜底取 data
        const item = productResp.data?.data || productResp.data;
        if (!item) { this.error = '商品不存在'; return; }

        // 规范化商品对象字段
        this.product = {
          id: item.id,
          name: item.name,
          description: item.description || '',
          // 价格保留两位小数（若为数字类型）
          price: item.price?.toFixed ? item.price.toFixed(2) : item.price,
          categoryName: item.categoryName || '',
          status: Number(item.status)
        };

        // 库存数量：优先取商品详情中的 stockQuantity，兜底取库存接口返回的 quantity
        const sq = item.stockQuantity ?? stockResp?.data?.data?.quantity;
        this.stockQuantity = sq != null ? sq : 0;

        // 图片处理：支持逗号分隔的多图 URL
        const rawUrl = item.imageUrl || item.image_url || '';
        if (rawUrl) {
          this.imageList = rawUrl.split(',').map(u => {
            const trimmed = u.trim();
            if (!trimmed) return '';
            // 已是完整 URL（http/https/blob/data）则直接使用
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
            // 相对路径：去除开头的斜杠后拼接图片服务器地址
            const cleanUrl = trimmed.replace(/^\/+/, '');
            return IMAGE_SERVER + '/' + cleanUrl;
          }).filter(Boolean); // 过滤掉空字符串
        } else {
          this.imageList = [];
        }
        this.currentIndex = 0;
      })
      .catch(err => {
        console.error('加载商品详情失败', err);
        this.error = '加载商品详情失败，请稍后重试';
      })
      .finally(() => { this.loading = false; });
  },

    /* ============================
     * 图片轮播
     * ============================ */

  prevImage() {
    // 边界保护：已在第一张时不继续递减
    if (this.currentIndex > 0) this.currentIndex--;
  },
  nextImage() {
    // 边界保护：已在最后一张时不继续递增
    if (this.currentIndex < this.imageList.length - 1) this.currentIndex++;
  },

    /* ============================
     * 数量选择
     * ============================ */

  /**
   * decreaseQty - 减少数量，最小值为 1
   */
  decreaseQty() { if (this.quantity > 1) this.quantity--; },
  /**
   * increaseQty - 增加数量，无上限
   */
  increaseQty() { this.quantity++; },

    /* ============================
     * 收藏管理（localStorage 持久化）
     * 收藏数据以 JSON 数组形式存储在 marketos_favorites 键中
     * ============================ */

  /**
   * getFavoriteKey - 获取 localStorage 中收藏列表的键名
   * @returns {string} 'marketos_favorites'
   */
  getFavoriteKey() { return 'marketos_favorites'; },

  /**
   * getFavorites - 从 localStorage 读取收藏列表
   * @returns {Array} 收藏商品数组，解析失败或不存在时返回空数组
   */
  getFavorites() {
    try { return JSON.parse(localStorage.getItem(this.getFavoriteKey())) || []; }
    catch { return []; }
  },

  /**
   * saveFavorites - 将收藏列表保存到 localStorage
   * @param {Array} list - 收藏商品数组
   */
  saveFavorites(list) {
    localStorage.setItem(this.getFavoriteKey(), JSON.stringify(list));
  },

  /**
   * checkFavorite - 检查当前商品是否已收藏，更新 isFavorited 状态
   */
  checkFavorite() {
    const favs = this.getFavorites();
    this.isFavorited = favs.some(f => f.productId == this.productId);
  },

  /**
   * toggleFavorite - 切换当前商品的收藏状态
   * 收藏时记录商品基本信息和收藏时间戳，取消收藏时从列表中移除。
   */
  toggleFavorite() {
    const favs = this.getFavorites();
    if (this.isFavorited) {
      // 取消收藏：从列表中过滤掉当前商品
      this.saveFavorites(favs.filter(f => f.productId != this.productId));
      this.isFavorited = false;
    } else {
      // 添加收藏：记录商品 ID、名称、价格、首张图片、分类和收藏时间
      favs.push({
        productId: this.product.id,
        name: this.product.name,
        price: this.product.price,
        image: this.imageList[0] || '',
        categoryName: this.product.categoryName || '',
        favoritedAt: new Date().toISOString()
      });
      this.saveFavorites(favs);
      this.isFavorited = true;
    }
  },

    /* ============================
     * 用户与会话
     * ============================ */

  /**
   * getCurrentUser - 从 localStorage 获取当前登录用户信息
   * @returns {Object|null} 包含 id 等字段的用户对象，未登录或数据异常时返回 null
   */
  getCurrentUser() {
    const stored = localStorage.getItem('marketos_user');
    if (!stored) return null;
    try { const u = JSON.parse(stored); return (u && u.id) ? u : null; }
    catch { return null; }
  },

    /* ============================
     * 购物车操作
     * ============================ */

  /**
   * addToCart - 将当前商品加入购物车
   * 需要用户已登录（携带 JWT Token 发起请求），未登录时弹出提示并跳转登录页。
   * 请求负载包含用户 ID、商品信息、数量、选中状态等字段。
   */
  addToCart() {
    const user = this.getCurrentUser();
    // 未登录时提示并重定向到登录页
    if (!user) { alert('请先登录'); window.location.href = 'login.html'; return; }
    const payload = {
      userId: user.id,
      productId: this.product.id,
      productName: this.product.name,
      productImage: this.imageList[0] || '',
      price: Number(this.product.price) || 0,
      quantity: this.quantity,
      checked: true // 新加入购物车的商品默认选中
    };
    axios.post(`${API_BASE}/carts/add`, payload, { headers: this.authHeader() })
      .then(() => alert('已加入购物车 🛒'))
      .catch(err => alert(err.response?.data?.message || '加入购物车失败'));
  }
}
  }).mount('#app');
