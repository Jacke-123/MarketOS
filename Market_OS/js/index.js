/**
 * index.js — 广应科校园超市 (Market OS) 首页 Vue 3 应用
 * ====================================================================
 * 功能概述：
 *   1. 用户认证：JWT Token 校验、登录/登出、多标签页同步登录态
 *   2. 首页轮播：自动播放、手动切换、localStorage 持久化
 *   3. 分类侧边栏：加载后端分类、按分类筛选商品、平滑滚动到商品区
 *   4. 商品搜索：关键词搜索、搜索反馈提示、结果联动滚动
 *   5. 商品网格展示：缩略图处理、多图支持、库存/价格格式化
 *   6. 购物车操作：数量增减、加入购物车、购物车角标数量
 *   7. 立即购买：跳过购物车直接下单、收货地址确认弹窗
 *   8. 界面交互：滚动吸顶搜索栏、bfcache 兼容、页面可见性检测
 *
 * 依赖：
 *   - Vue 3 (CDN) 通过 createApp API
 *   - Axios (CDN) 用于 HTTP 请求
 *   - localStorage 用于客户端持久化和跨标签页通信
 *
 * API 约定：
 *   - 基础路径：API_BASE (默认 http://localhost:9000/api)
 *   - 图片服务：IMAGE_SERVER 从 API_BASE 自动推导 origin
 *
 * @file index.js
 * @author Market OS Team
 * @version 1.0.0
 */

/* ====================================================================
 *                        全局配置 & 常量
 * ==================================================================== */

/** @constant {string} API_BASE - 后端 API 基础路径 */
const API_BASE = 'http://localhost:9000/api';

/**
 * @constant {string} IMAGE_SERVER - 图片服务器地址
 * 通过解析 API_BASE 的 origin 自动推导，避免与后端地址不同步
 * 如果 API_BASE 格式不正确，回退到默认 localhost:9000
 */
const IMAGE_SERVER = (() => {
  try {
    const url = new URL(API_BASE);
    return url.origin;
  } catch {
    return 'http://localhost:9000';
  }
})();

/** 解构获取 Vue 3 的 createApp 方法 */
const { createApp } = Vue;

/* ====================================================================
 *                        Vue 3 应用实例
 * ==================================================================== */

createApp({

  /* ====================================================================
   *                          data() — 响应式数据
   * ==================================================================== */

  data() {
    return {

      /* ---------- 搜索 ---------- */
      /** @property {string} searchQuery - 搜索输入框绑定的关键词 */
      searchQuery: '',

      /* ---------- 轮播图 ---------- */
      /** @property {number} currentIndex - 当前轮播图索引 (0-based) */
      currentIndex: 0,
      /**
       * @property {Object[]} carouselImages - 当前生效的轮播图数据
       * 可从后端或 localStorage 加载，加载失败时回退到 defaultCarousel
       */
      carouselImages: [
        { id: 1, url: '', title: '广应科校园日常补给', bg: '#e8f5e9' },
        { id: 2, url: '', title: '学生优惠专区', bg: '#fff3e0' },
        { id: 3, url: '', title: '宿舍直送服务', bg: '#e3f2fd' }
      ],
      /** @property {Object[]} defaultCarousel - 轮播图默认数据（兜底用，不会被修改） */
      defaultCarousel: [
        { id: 1, url: '', title: '广应科校园日常补给', bg: '#e8f5e9' },
        { id: 2, url: '', title: '学生优惠专区', bg: '#fff3e0' },
        { id: 3, url: '', title: '宿舍直送服务', bg: '#e3f2fd' }
      ],

      /* ---------- 商品列表 ---------- */
      /**
       * @property {Object[]} products - 当前展示的商品列表
       * 结构: { id, name, desc, price, imageUrl, stock, bg }
       * 初始三条为占位默认数据，实际数据由 API 替换
       */
      products: [
        { id: 1, name: '营养早餐麦片', desc: '快速早餐搭配，补充元气。', price: '16.80', imageUrl: '', stock: 128, bg: '#fff8e1' },
        { id: 2, name: '鲜榨果汁', desc: '校园午后解渴必备。', price: '12.00', imageUrl: '', stock: 64, bg: '#fce4ec' },
        { id: 3, name: '优选矿泉水', desc: '学习期间随时补充水分。', price: '5.50', imageUrl: '', stock: 234, bg: '#e0f7fa' }
      ],

      /* ---------- 用户 & 认证 ---------- */
      /** @property {Object|null} user - 当前登录用户对象 (来自 localStorage) */
      user: null,
      /** @property {string} userName - 界面展示的用户名 (未登录时："游客") */
      userName: '游客',
      /** @property {boolean} isLoggedIn - 是否处于已登录状态 */
      isLoggedIn: false,
      /** @property {boolean} showLogoutModal - 是否显示退出登录确认弹窗 */
      showLogoutModal: false,
      /** @property {string} token - JWT 访问令牌 (来自 localStorage) */
      token: localStorage.getItem('marketos_token') || '',

      /* ---------- 品牌 / Logo ---------- */
      /**
       * @property {string} logoImage - Logo 图片 URL
       * 优先从 localStorage 读取，无缓存时使用 placeholder 占位图
       */
      logoImage: localStorage.getItem('marketos_logo') || 'https://placehold.co/40x40/1e574f/white?text=广',
      /** @property {string} placeholderImage - 商品图片占位图 (可后续配置) */
      placeholderImage: '',

      /* ---------- UI 状态 ---------- */
      /** @property {string} searchFeedback - 搜索结果的用户反馈文本 */
      searchFeedback: '',
      /** @property {boolean} isSearchSticky - 搜索栏是否处于吸顶状态 */
      isSearchSticky: false,
      /**
       * @property {number} searchBarOffsetTop - 搜索栏在文档中的初始 Y 偏移
       * 用于判断滚动距离是否达到吸顶阈值
       */
      searchBarOffsetTop: 0,

      /* ---------- 分类 ---------- */
      /** @property {Object[]} categories - 后端返回的分类列表 */
      categories: [],
      /** @property {number|null} activeCategoryId - 当前激活的分类 ID (null = 全部分类) */
      activeCategoryId: null,
      /** @property {string[]} categoryIcons - 分类图标 emoji 数组 (按顺序对应) */
      categoryIcons: ['🏠','🍿','🍎','📚','🛏️','⚡','🧴','📱','🧹','🥤'],

      /* ---------- 购物车 ---------- */
      /** @property {number} cartCount - 购物车商品总数 (显示在导航栏角标) */
      cartCount: 0,
      /**
       * @property {Object} itemQty - 各商品的临时选购数量，key 为商品 ID
       * 惰性初始化：首次访问时自动设为 1
       */
      itemQty: {},

      /* ---------- 地址确认弹窗 ---------- */
      /** @property {boolean} showAddressModal - 是否显示地址确认弹窗 */
      showAddressModal: false,
      /** @property {Object|null} confirmAddress - 当前确认的收货地址对象 */
      confirmAddress: null,
      /** @property {Object[]} addressList - 用户的所有收货地址列表 */
      addressList: []
    };
  },
  /* ====================================================================
   *                       computed — 计算属性
   * ==================================================================== */

  computed: {
    /**
     * 当前轮播图对象
     * @returns {Object} 包含 id, url, title, bg 的轮播图数据
     */
    currentImage() {
      return this.carouselImages[this.currentIndex];
    }
  },

  /* ====================================================================
   *                       methods — 方法定义
   * ==================================================================== */

  methods: {

    /* ==================== 工具 / 辅助 ==================== */

    /**
     * 构造包含 JWT Token 的 Authorization 请求头
     * 未登录时返回空对象，避免发送无效的 Bearer 字符串
     * @returns {Object} headers 对象，如 { Authorization: 'Bearer ...' } 或 {}
     */
    authHeader() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    },

    /* ==================== Logo 加载 ==================== */

    /**
     * 从 localStorage 加载 Logo 图片 URL
     */
    loadLogo() {
      const saved = localStorage.getItem('marketos_logo');
      if (saved) this.logoImage = saved;
    },

    /* ==================== 页面导航 ==================== */

    /**
     * 平滑滚动到商品列表区域 (#products)
     */
    scrollToProducts() {
      document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
    },

    /**
     * 跳转到地址管理页面
     */
    openAddress() {
      window.location.href = 'address.html';
    },

    /* ==================== 轮播图加载 ==================== */

    /**
     * 加载轮播图数据
     * 优先从 localStorage (marketos_carousel 键) 读取，解析失败或数据无效时
     * 回退到 defaultCarousel 的深拷贝
     */
    loadCarousel() {
      try {
        const saved = localStorage.getItem('marketos_carousel');
        if (saved) {
          const data = JSON.parse(saved);
          if (Array.isArray(data) && data.length > 0) {
            this.carouselImages = data;
            return;
          }
        }
      } catch (e) { /* JSON 解析异常时忽略，回退默认数据 */ }
      this.carouselImages = [...this.defaultCarousel];
    },
    /* ==================== 用户认证 ==================== */

    /**
     * 加载并校验当前用户身份
     *
     * 流程：
     *   1. 从 localStorage 读取 token 和 user 对象
     *   2. 解码 JWT payload (Base64 解码中间段)，提取 sub 字段
     *   3. 比对 JWT sub 与 localStorage user.username 是否一致
     *      - 不一致说明 token 与用户数据来自不同会话，清除登录态
     *      - JWT 解析失败时降级信任 localStorage 数据
     *   4. 设置界面显示的用户名 (realName > username > "用户")
     *   5. 加载购物车角标数量
     */
    loadUser() {
      const stored = localStorage.getItem('marketos_user');
      if (this.token && stored) {
        try {
          const user = JSON.parse(stored);
          // 解码 JWT 校验身份一致性：防止 token 与用户数据来自不同登录会话
          try {
            // JWT 由三段 Base64 组成：header.payload.signature，取 payload (index 1)
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            if (payload.sub && user.username && payload.sub !== user.username) {
              // JWT 主体与本地用户不匹配，清除过期/串号的登录态
              localStorage.removeItem('marketos_token');
              localStorage.removeItem('marketos_user');
              this.token = '';
              this.user = null;
              this.userName = '游客';
              this.isLoggedIn = false;
              return;
            }
          } catch (e) { /* JWT 解析失败，降级使用 localStorage 数据 */ }
          this.user = user;
          // 优先显示真实姓名，其次用户名，最后兜底 "用户"
          this.userName = user.realName || user.username || '用户';
          this.isLoggedIn = true;
          this.loadCartCount();
        } catch {
          this.isLoggedIn = false;
        }
      }
    },

    /* ==================== 商品加载 ==================== */

    /**
     * 从后端加载商品列表
     *
     * 行为：
     *   - 无 activeCategoryId 时请求全部商品 (GET /products)
     *   - 有 activeCategoryId 时请求分类商品 (GET /products/category/:id)
     *   - 将后端返回字段映射为前端统一格式 (兼容 camelCase / snake_case)
     *   - 请求失败时保留现有列表，避免空白抖动
     */
    loadProducts() {
      let url = `${API_BASE}/products`;
      if (this.activeCategoryId) {
        url = `${API_BASE}/products/category/${this.activeCategoryId}`;
      }
      axios.get(url, { headers: this.authHeader() })
        .then(response => {
          const data = response.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            this.products = data.map(item => ({
              id: item.id,
              name: item.name,
              desc: item.description || item.name,
              // 价格统一格式化为两位小数；非数字类型原样保留
              price: item.price?.toFixed ? item.price.toFixed(2) : item.price,
              // 兼容 imageUrl (camelCase) 和 image_url (snake_case) 两种后端风格
              imageUrl: this.normalizeProductImages(item.imageUrl || item.image_url || ''),
              stock: item.stockQuantity != null ? item.stockQuantity : 0
            }));
          } else {
            this.products = [];
          }
        })
        .catch((err) => {
          console.warn('加载商品失败，展示默认商品', err);
          // 如果是"全部商品"请求失败，保留现有数据不清空
          if (!this.activeCategoryId && this.products.length === 0) {
            // 仅在产品列表完全为空时才回退默认数据
          }
        });
    },

    /**
     * 从后端加载商品分类列表
     * 请求失败时清空分类列表（不影响商品展示）
     */
    loadCategories() {
      axios.get(`${API_BASE}/categories`, { headers: this.authHeader() })
        .then(resp => {
          const data = resp.data?.data;
          this.categories = Array.isArray(data) ? data : [];
        })
        .catch(() => { this.categories = []; });
    },

    /* ==================== 分类筛选 ==================== */

    /**
     * 按分类 ID 筛选商品
     * 设置 activeCategoryId 后重新加载商品，并在 DOM 更新后平滑滚动到商品区
     *
     * @param {number} categoryId - 分类 ID
     */
    filterByCategory(categoryId) {
      this.activeCategoryId = categoryId;
      this.loadProducts();
      this.$nextTick(() => {
        const el = document.getElementById('products');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    },

    /**
     * 获取当前激活分类的名称
     * @returns {string} 分类名，无匹配时返回 "分类商品"
     */
    getCategoryName() {
      const cat = this.categories.find(c => c.id === this.activeCategoryId);
      return cat ? cat.name : '分类商品';
    },
    /* ==================== 商品搜索 ==================== */

    /**
     * 执行商品关键词搜索
     *
     * 行为：
     *   - 关键词为空时恢复全量商品列表
     *   - 搜索成功后将结果映射为统一格式，显示结果数量并滚动到商品区
     *   - 搜索结果为空时显示提示，失败时显示错误信息
     */
    search() {
      const keyword = this.searchQuery.trim();
      this.searchFeedback = '';
      if (!keyword) {
        // 无关键词时恢复显示全部商品
        this.loadProducts();
        return;
      }
      axios.get(`${API_BASE}/products/search`, { params: { keyword }, headers: this.authHeader() })
        .then(response => {
          const data = response.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            this.products = data.map(item => ({
              id: item.id,
              name: item.name,
              desc: item.description || item.name,
              price: item.price?.toFixed ? item.price.toFixed(2) : item.price,
              imageUrl: this.normalizeProductImages(item.imageUrl || item.image_url || ''),
              stock: item.stockQuantity != null ? item.stockQuantity : 0
            }));
            this.searchFeedback = `已找到 ${data.length} 个商品，已跳转到商品列表`;
            // DOM 更新后自动滚动到商品列表区域
            this.$nextTick(() => {
              const productsEl = document.getElementById('products');
              if (productsEl) productsEl.scrollIntoView({ behavior: 'smooth' });
            });
          } else {
            this.products = [];
            this.searchFeedback = '未找到该商品，请尝试其他关键词。';
          }
        })
        .catch(() => {
          this.searchFeedback = '搜索失败，请稍后重试。';
        });
    },

    /* ==================== 图片处理 ==================== */

    /**
     * 规范化商品图片 URL
     *
     * 处理逻辑：
     *   1. 多图以逗号分隔，逐张处理
     *   2. 绝对 URL (http/https)、blob:、data: 协议直出
     *   3. 相对路径去掉前导斜杠后拼接 IMAGE_SERVER
     *   4. 过滤掉空字符串
     *
     * @param {string} rawUrl - 原始图片 URL (可能含逗号分隔的多张图)
     * @returns {string} 规范化后的图片 URL 字符串 (逗号分隔)
     */
    normalizeProductImages(rawUrl) {
      if (!rawUrl) return '';
      return rawUrl.split(',').map(u => {
        const url = u.trim();
        if (!url) return '';
        // 已经是完整 URL 或特殊协议 (blob/data)，直接返回
        if (/^(https?:|blob:|data:)/i.test(url)) return url;
        // 相对路径：去掉多余的 / 前缀，拼接图片服务器地址
        const cleanUrl = url.replace(/^\/+/, '');
        return IMAGE_SERVER + '/' + cleanUrl;
      }).filter(Boolean).join(',');
    },

    /**
     * 获取商品缩略图 (多图中的第一张)
     * 无图片时返回空字符串，模板中会转而显示彩色占位背景
     *
     * @param {Object} item - 商品对象
     * @returns {string} 第一张图片的 URL，无图片时为空
     */
    getThumbnail(item) {
      const raw = item.imageUrl || '';
      const firstUrl = raw.split(',')[0].trim();
      if (firstUrl) return firstUrl;
      return '';
    },

    /* ==================== 商品详情导航 ==================== */

    /**
     * 跳转到商品详情页
     * @param {number} productId - 商品 ID
     */
    goDetail(productId) {
      window.location.href = `product-detail.html?id=${productId}`;
    },
    /* ==================== 商品数量控制 ==================== */

    /**
     * 获取指定商品的当前选购数量（惰性初始化为 1）
     * @param {number} pid - 商品 ID
     * @returns {number} 当前数量
     */
    getQty(pid) { if (!this.itemQty[pid]) this.itemQty[pid] = 1; return this.itemQty[pid]; },

    /**
     * 增加指定商品的选购数量 (+1)
     * @param {number} pid - 商品 ID
     */
    incQty(pid) { if (!this.itemQty[pid]) this.itemQty[pid] = 1; this.itemQty[pid]++; },

    /**
     * 减少指定商品的选购数量 (-1)，最低为 1
     * @param {number} pid - 商品 ID
     */
    decQty(pid) { if (!this.itemQty[pid]) this.itemQty[pid] = 1; if (this.itemQty[pid] > 1) this.itemQty[pid]--; },

    /* ==================== 加入购物车 ==================== */

    /**
     * 将商品加入购物车
     *
     * 前置检查：
     *   - 库存为零时阻止操作
     *   - 未登录或 token 缺失时跳转到登录页
     *   - 用户信息不完整时跳转到登录页
     *
     * 错误处理分三层：
     *   1. err.response 存在 → 后端返回了错误响应，提取 message
     *   2. err.request 存在但无 response → 请求已发出但无响应 (网络/跨域)
     *   3. 其他 → JS 运行时错误，显示 err.message
     *
     * @param {Object} item - 要购买的商品对象
     */
    buy(item) {
      if (item.stock === 0) { alert('该商品已售完'); return; }
      const stored = localStorage.getItem('marketos_user');
      if (!this.token || !stored) { alert('请先登录'); window.location.href = 'login.html'; return; }
      try {
        const user = JSON.parse(stored);
        if (!user || !user.id) { alert('用户信息不完整'); window.location.href = 'login.html'; return; }
        const qty = this.getQty(item.id);
        const payload = {
          userId: user.id, productId: item.id, productName: item.name || '',
          productImage: item.imageUrl || '', price: Number(item.price) || 0,
          quantity: qty, checked: true // checked 默认勾选，用于购物车页面的全选逻辑
        };

        axios.post(`${API_BASE}/carts/add`, payload, { headers: this.authHeader() })
          .then(response => {
            // 如果后端返回统一结构，优先显示后端消息
            const data = response.data || {};
            if (response.status >= 200 && response.status < 300) {
              alert(data.message || `已加入购物车：${item.name}`);
              this.loadCartCount(); // 刷新导航栏购物车角标
            } else {
              console.error('加入购物车异常响应：', response);
              alert(data.message || `加入购物车失败（状态 ${response.status}）`);
            }
          })
          .catch(err => {
            // 更详细的错误提示，帮助排查（如跨域、网络、后端校验失败）
            console.error('加入购物车请求失败：', err);
            if (err.response) {
              // 后端返回了响应但状态码非 2xx
              const msg = err.response.data?.message || err.response.statusText || ('HTTP ' + err.response.status);
              alert('加入购物车失败：' + msg);
            } else if (err.request) {
              // 请求已发出但未收到响应
              alert('加入购物车失败：未收到后端响应（可能是网络或跨域问题）');
            } else {
              // 请求构造阶段出错
              alert('加入购物车失败：' + err.message);
            }
          });
      } catch (e) { alert('操作失败，请重新登录'); window.location.href = 'login.html'; }
    },

    /* ==================== 收货地址确认弹窗 ==================== */

    /**
     * 获取用户地址列表并弹出确认弹窗
     *
     * 流程：
     *   1. 请求地址列表 API
     *   2. 无地址时提示并跳转添加地址页
     *   3. 默认选中 isDefault 地址，其次选第一条
     *   4. 返回 Promise，由调用方 await 获取用户确认的地址
     *
     * @returns {Promise<Object|null>} 用户确认的地址对象，取消时 resolve(null)
     */
    async ensureAddress() {
      try {
        const resp = await axios.get(`${API_BASE}/addresses`, { headers: this.authHeader() });
        const addrs = resp.data?.data || [];
        if (!addrs.length) { alert('请先添加收货地址'); window.location.href = 'address.html'; return null; }
        this.addressList = addrs;
        // 优先选中默认地址，否则选中第一个
        this.confirmAddress = addrs.find(a => a.isDefault) || addrs[0];
        this.showAddressModal = true;
        // 返回 Promise 挂起，等待用户点击"确认"或"取消"
        return new Promise(resolve => { this._addrResolve = resolve; });
      } catch (e) { alert('获取地址失败，请稍后重试'); return null; }
    },

    /**
     * 用户点击地址弹窗的"确认"按钮
     * 关闭弹窗并 resolve 当前选中地址
     */
    confirmAddressOk() {
      this.showAddressModal = false;
      if (this._addrResolve) this._addrResolve(this.confirmAddress);
    },

    /**
     * 用户点击地址弹窗的"取消"按钮
     * 关闭弹窗并 resolve(null) 表示取消操作
     */
    confirmAddressCancel() {
      this.showAddressModal = false;
      if (this._addrResolve) this._addrResolve(null);
    },

    /**
     * 跳转到地址管理页面 (从弹窗触发)
     */
    goAddressPage() { window.location.href = 'address.html'; },
    /* ==================== 立即购买 (Buy Now) ==================== */

    /**
     * 跳过购物车直接下单购买
     *
     * 流程：
     *   1. 库存 / 登录校验
     *   2. 计算总价 = 单价 * 数量
     *   3. 调用下单 API (POST /orders?userId=...)
     *   4. 成功后显示订单号，重置数量，跳转到订单列表页
     *
     * 注意：下单请求体为数组格式，支持多商品一起下单（当前仅单个商品）
     *
     * @param {Object} item - 要购买的商品对象
     */
    async buyNow(item) {
      if (item.stock === 0) { alert('该商品已售完'); return; }
      if (!this.token || !localStorage.getItem('marketos_user')) { alert('请先登录'); window.location.href = 'login.html'; return; }
      const user = JSON.parse(localStorage.getItem('marketos_user'));
      const qty = this.getQty(item.id);
      // 计算总价并保留两位小数
      const total = (Number(item.price) * qty).toFixed(2);
      try {
        const resp = await axios.post(`${API_BASE}/orders?userId=${user.id}`, [{
          productId: item.id, quantity: qty, unitPrice: Number(item.price), totalPrice: Number(total)
        }], { headers: this.authHeader() });
        if (resp.data?.data) {
          alert('📋 订单已生成，支付时请确认收货地址\n\n订单号：' + resp.data.data.orderNo);
          this.itemQty[item.id] = 1; // 重置该商品选购数量
          window.location.href = 'orders.html';
        }
      } catch (err) {
        alert('购买失败：' + (err.response?.data?.message || err.message));
      }
    },

    /* ==================== 购物车角标 ==================== */

    /**
     * 加载当前用户的购物车商品数量，更新导航栏角标
     * 仅在用户已登录时调用（未登录跳过）
     */
    loadCartCount() {
      if (!this.user) return;
      axios.get(`${API_BASE}/carts/list/${this.user.id}`, { headers: this.authHeader() })
        .then(response => {
          const data = response.data?.data;
          // 购物车商品数量 = 条目数组长度
          this.cartCount = Array.isArray(data) ? data.length : 0;
        })
        .catch(() => {
          console.warn('加载购物车数量失败');
        });
    },

    /* ==================== 退出登录 ==================== */

    /**
     * 打开退出登录确认弹窗
     */
    openLogoutModal() {
      this.showLogoutModal = true;
    },

    /**
     * 关闭退出登录确认弹窗
     */
    closeLogoutModal() {
      this.showLogoutModal = false;
    },

    /**
     * 确认退出登录：关闭弹窗并执行 logout()
     */
    confirmLogout() {
      this.closeLogoutModal();
      this.logout();
    },

    /**
     * 执行退出登录：
     *   清除 localStorage 中的 token 和用户数据
     *   重置组件状态并跳转到登录页
     */
    logout() {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      this.user = null;
      this.isLoggedIn = false;
      this.userName = '游客';
      this.showLogoutModal = false;
      window.location.href = 'login.html';
    },

    /* ==================== 轮播图控制 ==================== */

    /**
     * 切换到下一张轮播图 (循环：最后一张 → 第一张)
     */
    nextSlide() {
      // 使用取模运算实现循环切换
      this.currentIndex = (this.currentIndex + 1) % this.carouselImages.length;
    },

    /**
     * 切换到上一张轮播图 (循环：第一张 → 最后一张)
     */
    prevSlide() {
      // + length 防止负索引，取模实现循环
      this.currentIndex = (this.currentIndex - 1 + this.carouselImages.length) % this.carouselImages.length;
    },

    /**
     * 通过指示器圆点跳转到指定轮播图
     * @param {number} index - 目标索引
     */
    goSlide(index) {
      this.currentIndex = index;
    },

    /**
     * 启动轮播图自动播放，每 4200ms 切换到下一张
     */
    startAutoPlay() {
      this.timer = setInterval(this.nextSlide, 4200);
    },

    /**
     * 停止轮播图自动播放，清除定时器
     */
    stopAutoPlay() {
      clearInterval(this.timer);
      this.timer = null;
    },

    /* ==================== 搜索栏滚动吸顶 ==================== */

    /**
     * 更新搜索栏的初始文档偏移位置
     * 在 mounted 和窗口 resize 时调用，确保定位准确
     */
    updateSearchBarTop() {
      const el = document.querySelector('.search-bar');
      if (el) {
        // getBoundingClientRect().top 是相对视口的偏移
        // 加上 window.pageYOffset 得到相对文档顶部的绝对偏移
        this.searchBarOffsetTop = el.getBoundingClientRect().top + window.pageYOffset;
      }
    },

    /**
     * 滚动事件处理：判断搜索栏是否应进入吸顶状态
     * 当前滚动位置 >= 搜索栏原始位置 - 8px 缓冲时触发吸顶
     */
    handleScroll() {
      if (!this.searchBarOffsetTop) this.updateSearchBarTop();
      // 8px 缓冲避免过早吸顶的抖动
      this.isSearchSticky = window.pageYOffset >= this.searchBarOffsetTop - 8;
    }
  },
  /* ====================================================================
   *                   mounted() — 挂载后生命周期
   * ==================================================================== */

  mounted() {
    // --- 初始化数据加载 ---
    this.loadLogo();
    this.loadCarousel();
    this.loadProducts();
    this.loadCategories();
    this.loadUser();

    // --- 启动轮播自动播放 ---
    this.startAutoPlay();

    // --- 初始化搜索栏吸顶相关 ---
    this.updateSearchBarTop();
    // 使用 passive: true 提升滚动性能（告知浏览器不会调用 preventDefault）
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    // 窗口大小变化时重新计算搜索栏位置
    window.addEventListener('resize', () => {
      this.updateSearchBarTop();
    });
    // 初始执行一次滚动检测，避免页面刷新时已处于滚动位置而状态不一致
    this.handleScroll();

    // --- 跨标签页同步 ---
    // 监听 localStorage 变化（其他标签页改了 Logo / 登录状态后自动刷新）
    window.addEventListener('storage', (e) => {
      if (e.key === 'marketos_logo') this.loadLogo();
      if (e.key === 'marketos_token' || e.key === 'marketos_user') {
        this.token = localStorage.getItem('marketos_token') || '';
        this.loadUser();
      }
    });

    // --- bfcache 兼容 ---
    // 解决浏览器后退缓存（bfcache）导致数据不更新的问题
    // e.persisted 为 true 表示页面是从 bfcache 恢复的（而非首次加载）
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        this.token = localStorage.getItem('marketos_token') || '';
        this.loadLogo();
        this.loadUser();
      }
    });

    // --- 页面可见性变化兜底 ---
    // 标签页重新可见时刷新用户身份（兜底 pageshow 未覆盖的场景）
    // 例如用户从其他标签页切换回来，或浏览器重新获得焦点
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.token = localStorage.getItem('marketos_token') || '';
        this.loadUser();
      }
    });
  },

  /* ====================================================================
   *             beforeUnmount() — 卸载前清理
   * ==================================================================== */

  beforeUnmount() {
    // 停止轮播定时器，防止内存泄漏
    this.stopAutoPlay();
    // 移除滚动监听，避免组件销毁后仍触发回调
    window.removeEventListener('scroll', this.handleScroll);
    // 移除 resize 监听
    window.removeEventListener('resize', this.updateSearchBarTop);
  }
}).mount('#app');
