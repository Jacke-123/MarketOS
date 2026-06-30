/**
 * ============================================================================
 * 广应科校园超市 - 管理后台 (Admin Panel)
 * ============================================================================
 * 基于 Vue 3 + Chart.js 构建的单页管理后台，提供对校园超市系统的
 * 全面管理功能。所有数据通过 Axios 调用后端 RESTful API 交互。
 *
 * 核心功能模块：
 *   1. 员工管理 —— 增删改查、批量删除、表单校验、自动生成员工编号
 *   2. 部门管理 —— 增删改查、批量删除
 *   3. 薪资管理 —— 增删改查、批量发放（含明细表格预览）、自动计算实发薪资
 *   4. 商品管理 —— 列表展示、状态筛选卡片（已上架/已下架/无库存）、分类管理弹窗、批量删除
 *   5. 库存日志 —— 商品库存变动记录查看
 *   6. 订单管理 —— 列表、状态筛选、搜索（订单号/ID/商品名）、订单明细弹窗、取消订单
 *   7. 店铺管理 —— 轮播图拖拽排序编辑器、营业数据分析（柱状图 + 环形图 + 年度折叠视图）
 *
 * 权限模型：
 *   - 页面挂载时校验 JWT token 有效性及管理员身份
 *   - 非管理员自动重定向至首页
 *   - 无 token 自动重定向至登录页
 *
 * 数据流：
 *   - 全局状态托管于 Vue data()，页面切换时按需加载对应模块数据
 *   - 轮播图数据持久化至 localStorage
 *   - 营业数据优先从后端 /orders/analytics 获取，失败时使用模拟数据兜底
 *
 * @file       admin.js
 * @project    广应科校园超市 (Market_OS)
 * @version    1.0.0
 * @author     广应科开发团队
 * ============================================================================
 */

const API_BASE = 'http://localhost:9000/api';
const { createApp } = Vue;
createApp({
  /**
   * ====================================================================
   * data() —— 全局状态管理
   * ====================================================================
   * 集中管理所有模块的列表数据、分页状态、表单模型、筛选条件、
   * 选中集合、弹窗状态及 UI 辅助变量。
   *
   * 关键字段速览：
   *   section           —— 当前激活的顶级导航模块
   *   token             —— JWT 认证令牌（存于 localStorage）
   *   employees[]       —— 员工列表（全量）
   *   departments[]     —— 部门列表（全量）
   *   salaryRecords[]   —— 薪资记录列表
   *   products[]        —— 商品列表（全量，按更新时间降序）
   *   orders[]          —— 订单列表
   *   stockLogs[]       —— 库存日志列表
   *   carouselImages[]  —— 轮播图配置（持久化至 localStorage）
   *   salesData[]       —— 每日营业数据（原始）
   *   monthlySalesData[]—— 月度聚合营业数据
   *   dailySalesData[]  —— 每日聚合营业数据（柱状图用）
   *   yearlySalesData[] —— 按年→月→日组织的嵌套数据（折叠菜单用）
   *   salesChart        —— Chart.js 柱状图实例引用
   *   salesDoughnut     —— Chart.js 环形图实例引用
   *   confirmModal      —— 通用确认弹窗配置对象
   * ====================================================================
   */
  data() {
    return {
      // 当前激活的导航模块（支持 URL hash 初始化）
      section: (window.location.hash && ['employees','departments','salaries','products','orders','shop'].includes(window.location.hash.slice(1))) ? window.location.hash.slice(1) : 'employees',

      // ======================== 员工管理数据 ========================
      employees: [],
      departments: [],
      searchEmployeeName: '',
      searchEmployeeDept: '',
      // ======================== 薪资管理数据 ========================
      salaryRecords: [],
      salaryEmployeeId: null,
      salaryMonth: '',
      selectedEmployeeName: '',
      // ======================== 商品管理数据 ========================
      products: [],
      productPage: 1,
      productSize: 10,
      // ======================== 薪资表单数据 ========================
      // salaryForm 用于薪资新增/编辑弹窗，含所有薪资构成字段
      // actualSalary 由 calcSalaryFormActual() 自动计算
      salaryFormVisible: false,
      editingSalaryId: null,
      salarySubmitLoading: false,
      salaryFormDirty: false,
      salaryFormActualHighlight: false,  // 实发薪资高亮动画开关
      salaryFormErrors: {},
      salaryForm: {
        employeeId: null,
        yearMonth: '',
        baseSalary: null,
        performanceBonus: null,
        allowance: null,
        deduction: null,
        socialSecurity: null,
        tax: null,
        actualSalary: null,
        paymentDate: '',
        status: 'PENDING',
        remark: ''
      },
      // ======================== 商品表单数据 ========================
      productFormVisible: false,
      editingProductId: null,
      productForm: {
        name: '',
        categoryId: '',
        categoryName: '',
        description: '',
        price: null,
        imageUrl: '',
        status: 1,
        stockQuantity: null,
        remark: ''
      },
      // ======================== 员工表单数据 ========================
      employeeFormVisible: false,
      employeeFormDirty: false,        // 用于"有修改未保存"时的离开确认
      editingEmployeeId: null,
      submitLoading: false,
      formErrors: {},
      employeeForm: {
        realName: '',
        gender: 'MALE',
        position: '',
        department: '',
        departmentId: null,
        baseSalary: null,
        performanceBonus: 0,
        allowance: 0,
        deduction: 0,
        socialSecurity: 0,
        tax: 0,
        phone: '',
        email: '',
        bankCardNo: ''
      },
      // ======================== 分页数据 ========================
      employeePage: 1,
      departmentPage: 1,
      salaryPage: 1,
      stockLogPage: 1,
      pageSize: 10,
      // ======================== 部门表单数据 ========================
      departmentFormVisible: false,
      departmentFormDirty: false,
      editingDepartmentId: null,
      departmentForm: {
        name: '',
        description: ''
      },
      // ======================== 认证与品牌数据 ========================
      // token——从 localStorage 读取的 JWT 令牌，每次 API 请求通过 Authorization 头发送
      token: localStorage.getItem('marketos_token') || '',
      // logoImage——店铺 Logo 的 Base64 字符串，支持管理员上传自定义
      logoImage: localStorage.getItem('marketos_logo') || 'https://placehold.co/36x36/1e574f/white?text=广',
      // 模块级错误标记（用于模板中显示错误提示）
      departmentError: false,
      employeeError: false,
      // ======================== 订单管理数据 ========================
      orders: [],
      orderStatusFilter: '',
      orderUserIdFilter: '',
      orderSearchText: '',
      orderPage: 1,
      orderPageSize: 10,
      orderItemsCache: {},
      adminOrderItemsModalVisible: false,
      adminOrderItems: [],
      adminOrderItemsLoading: false,
      adminOrderItemsOrderId: null,
      adminOrderReceiverName: '',
      adminOrderPhone: '',
      adminOrderAddress: '',
      adminOrderOrderNo: '',
      // ======================== 库存日志数据 ========================
      stockLogs: [],
      stockLogFilter: '',
      // ======================== 分类管理数据 ========================
      // categoryModalVisible 控制分类管理弹窗的显示/隐藏
      // newCategoryParentId 为 null 时表示创建顶级分类
      categoryModalVisible: false,
      newCategoryName: '',
      newCategoryDesc: '',
      newCategoryParentId: null,
      productCategories: [],
      productSearchKeyword: '',
      productCategoryFilter: '',
      // 商品状态筛选：null='全部', 'listed'='已上架', 'delisted'='已下架', 'outofstock'='无库存'
      productStatusFilter: null,  // null='全部', 'listed'='已上架', 'delisted'='已下架', 'outofstock'='无库存'
      // ======================== 导航子菜单状态 ========================
      productMenuOpen: false,
      productSubSection: 'list',   // 'list'=商品列表, 'stocks'=库存日志
      // ======================== 批量选择集合 ========================
      // 各模块的全选/单选状态，按 ID 数组存储
      selectedEmployees: [],
      selectedDepartments: [],
      selectedSalaries: [],
      selectedProducts: [],
      // ======================== 店铺子菜单与营业数据 ========================
      shopMenuOpen: false,
      shopSubSection: 'sales',    // 'sales'=营业数据, 'carousel'=轮播图管理
      // 营业数据：salesData 为每日原始数据，monthlySalesData/dailySalesData/yearlySalesData 为聚合视图
      salesData: [],
      monthlySalesData: [],       // 月度聚合
      dailySalesData: [],         // 每日聚合（柱状图数据源）
      yearlySalesData: [],        // 按年→月→日嵌套数据（折叠菜单用）
      expandedYear: null,         // 当前展开的年份
      expandedMonth: null,        // 当前展开的月份
      salesChart: null,           // Chart.js 柱状图实例
      salesDoughnut: null,        // Chart.js 环形图实例
      // ======================== 轮播图管理数据 ========================
      // 轮播图数据持久化至 localStorage，默认展示 3 张占位轮播图
      carouselImages: [
        { id: 1, url: '', title: '广应科校园日常补给', bg: '#e8f5e9' },
        { id: 2, url: '', title: '学生优惠专区', bg: '#fff3e0' },
        { id: 3, url: '', title: '宿舍直送服务', bg: '#e3f2fd' }
      ],
      carouselIdCounter: 3,       // 自增 ID 计数器，新增轮播图时 +1
      carouselSavedMsg: '',       // 「已保存」提示文本，1500ms 后自动清除
      dragIndex: -1,              // 拖拽排序中正在拖动的项的原始索引
      // ======================== 通用确认弹窗数据 ========================
      // 各模块的批量删除/发放等危险操作统一使用此弹窗
      confirmModal: {
        visible: false,
        type: 'danger',
        title: '',
        message: '',
        detail: '',
        confirmText: '确认',
        onConfirm: () => {}
      }
    };
  },
  /**
   * ====================================================================
   * computed —— 派生状态
   * ====================================================================
   * 集中定义各模块的分页切片、筛选结果、统计指标等派生计算属性。
   * 核心策略：原始数据（全量）→ filtered → paginated 三段式管道。
   * ====================================================================
   */
  computed: {
    /**
     * 员工涉及部门数量（去重统计）
     * 用于仪表盘展示"覆盖部门数"卡片
     */
    employeeDeptCount() {
      const departments = new Set(this.employees.map(item => item.department || '未知'));
      return departments.size;
    },
    /** 月度营业总收入 */
    salesTotalRevenue() {
      return this.monthlySalesData.reduce((s, d) => s + Number(d.total_revenue || 0), 0);
    },
    /** 月度总订单数 */
    salesTotalOrders() {
      return this.monthlySalesData.reduce((s, d) => s + Number(d.order_count || 0), 0);
    },
    /** 月均营收（用于仪表盘平均客单价/月均指标） */
    salesAvgRevenue() {
      if (!this.monthlySalesData.length) return '0.00';
      return (this.salesTotalRevenue / this.monthlySalesData.length).toFixed(2);
    },
    /** 已支付订单数（status === 1） */
    salesPaidOrders() {
      return this.orders.filter(o => o.status === 1).length;
    },
    /** 有营业数据的天数 */
    salesDays() {
      return this.monthlySalesData.length;
    },
    /** 营业数据覆盖的日期范围，格式 "2026-01-01 至 2026-06-23" */
    salesDateRange() {
      if (!this.salesData.length) return '';
      const dates = this.salesData.map(d => d.date).sort();
      return dates[0] + ' 至 ' + dates[dates.length - 1];
    },
    /** 日期字符串格式化为中文格式 "2026年6月23日" */
    formatDate(dateStr) {
      if (!dateStr) return '-';
      const [y, m, d] = dateStr.split('-');
      return y + '年' + parseInt(m) + '月' + parseInt(d) + '日';
    },
    /** 库存日志筛选：按商品名/操作类型/商品ID 模糊匹配 */
    filteredStockLogs() {
      if (!this.stockLogFilter) return this.stockLogs;
      const f = this.stockLogFilter.toLowerCase();
      return this.stockLogs.filter(item =>
        (item.productName || '').toLowerCase().includes(f) ||
        (item.operationType || '').toLowerCase().includes(f) ||
        String(item.productId).includes(f)
      );
    },
    /**
     * 订单筛选 + 搜索 + 排序管道
     * 支持：状态筛选、订单号/ID/用户ID 搜索、缓存中的商品名搜索
     * 结果按 ID 降序排列（最新在前）
     */
    filteredOrders() {
      const searchText = this.orderSearchText;
      return this.orders.filter(item => {
        const sf = this.orderStatusFilter;
        const statusMatch = (sf !== '' && sf != null) ? item.status === Number(sf) : true;
        let searchMatch = true;
        if (searchText) {
          // 按订单号/ID/用户ID 匹配
          searchMatch = String(item.orderNo).includes(searchText)
                     || String(item.id).includes(searchText)
                     || String(item.userId).includes(searchText);
          // 按订单内商品名称匹配
          if (!searchMatch) {
            const cached = this.orderItemsCache[item.id];
            if (cached && Array.isArray(cached)) {
              searchMatch = cached.some(oi => (oi.productName || '').toLowerCase().includes(searchText.toLowerCase()));
            }
          }
        }
        return statusMatch && searchMatch;
      }).sort((a, b) => (b.id || 0) - (a.id || 0));
    },
    /** 订单分页切片 */
    paginatedOrders() {
      const s = (this.orderPage - 1) * this.orderPageSize;
      return this.filteredOrders.slice(s, s + this.orderPageSize);
    },
    /** 订单总页数 */
    orderTotalPages() {
      return Math.ceil(this.filteredOrders.length / this.orderPageSize) || 1;
    },
    /** 员工筛选：按姓名模糊搜索 + 按部门精准筛选 */
    filteredEmployees() {
      return this.employees.filter(item => {
        const nameMatch = this.searchEmployeeName ? item.realName?.includes(this.searchEmployeeName) : true;
        const deptMatch = this.searchEmployeeDept ? item.department === this.searchEmployeeDept : true;
        return nameMatch && deptMatch;
      });
    },
    /** 员工分页切片 */
    paginatedEmployees() {
      const s = (this.employeePage - 1) * this.pageSize;
      return this.filteredEmployees.slice(s, s + this.pageSize);
    },
    /** 员工总页数 */
    employeeTotalPages() {
      return Math.ceil(this.filteredEmployees.length / this.pageSize) || 1;
    },
    /** 薪资记录分页切片 */
    paginatedSalaries() {
      const s = (this.salaryPage - 1) * this.pageSize;
      return this.salaryRecords.slice(s, s + this.pageSize);
    },
    /** 薪资总页数 */
    salaryTotalPages() {
      return Math.ceil(this.salaryRecords.length / this.pageSize) || 1;
    },
    /** 部门分页切片 */
    paginatedDepartments() {
      const s = (this.departmentPage - 1) * this.pageSize;
      return this.departments.slice(s, s + this.pageSize);
    },
    /** 部门总页数 */
    departmentTotalPages() {
      return Math.ceil(this.departments.length / this.pageSize) || 1;
    },
    /** 库存日志分页切片 */
    paginatedStockLogs() {
      const s = (this.stockLogPage - 1) * this.pageSize;
      return this.filteredStockLogs.slice(s, s + this.pageSize);
    },
    /** 库存日志总页数 */
    stockLogTotalPages() {
      return Math.ceil(this.filteredStockLogs.length / this.pageSize) || 1;
    },
    /**
     * 商品筛选 + 排序管道
     * 支持：关键词搜索（名称/ID）、状态卡片筛选、分类筛选
     * 结果按更新时间降序（无更新时间则用创建时间）
     */
    filteredProducts() {
      let result = this.products;
      if (this.productSearchKeyword) {
        const kw = this.productSearchKeyword.toLowerCase();
        result = this.products.filter(p =>
          (p.name || '').toLowerCase().includes(kw) ||
          String(p.id).includes(kw)
        );
      }
      // 根据状态筛选卡片过滤（与搜索关键词联动）
      if (this.productStatusFilter === 'listed') {
        result = result.filter(p => p.status === 1);
      } else if (this.productStatusFilter === 'delisted') {
        result = result.filter(p => p.status !== 1);
      } else if (this.productStatusFilter === 'outofstock') {
        result = result.filter(p => p.stockQuantity != null && p.stockQuantity <= 0);
      }
      // 按更新时间降序排列（最新在前），无更新时间则用创建时间
      return result.slice().sort((a, b) => {
        const ta = a.updateTime || a.createTime || '';
        const tb = b.updateTime || b.createTime || '';
        return tb.localeCompare(ta);
      });
    },
    /** 商品分页切片 */
    paginatedProducts() {
      const s = (this.productPage - 1) * this.productSize;
      return this.filteredProducts.slice(s, s + this.productSize);
    },
    /** 商品总页数 */
    productTotalPages() {
      return Math.ceil(this.filteredProducts.length / this.productSize) || 1;
    },
    // ======================== 按状态统计商品数量 ========================
    // 基于全量 products 数组计算，不受当前筛选影响（用于状态卡片徽标）
    /** 已上架商品数（status === 1） */
    listedProductCount() {
      return this.products.filter(p => p.status === 1).length;
    },
    /** 已下架商品数（status !== 1） */
    delistedProductCount() {
      return this.products.filter(p => p.status !== 1).length;
    },
    /** 无库存商品数（库存 <= 0） */
    outOfStockProductCount() {
      return this.products.filter(p => p.stockQuantity != null && p.stockQuantity <= 0).length;
    },
  },
  /**
   * ====================================================================
   * methods —— 业务方法
   * ====================================================================
   * 按功能模块组织，各模块内部顺序为：
   *   数据加载 → 表单显示/取消 → 校验 → 提交（新增/编辑） → 删除
   * ====================================================================
   */
  methods: {
    // ======================== 认证与工具方法 ========================

    /** 构造带 Bearer token 的请求头对象 */
    authHeader() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    },
    /** 从 localStorage 加载已保存的品牌 Logo */
    loadLogo() {
      const saved = localStorage.getItem('marketos_logo');
      if (saved) this.logoImage = saved;
    },
    /**
     * 上传品牌 Logo 文件并转为 Base64 存储
     * 通过 FileReader 读取文件，直接写入 logoImage 和 localStorage
     * @param {Event} e - 文件 input 的 change 事件
     */
    uploadLogo(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        this.logoImage = base64;
        localStorage.setItem('marketos_logo', base64);
      };
      reader.readAsDataURL(file);
    },
    /**
     * 切换顶级导航模块
     * 商品/店铺有子菜单，点击已激活的模块仅切换展开/收起而不重新加载数据
     * 其他模块直接切换并加载对应数据
     * @param {string} section - 目标模块名
     */
    switchSection(section) {
      // 商品/店铺管理特殊处理：点击已激活的则切换展开/收起
      if ((section === 'products' || section === 'shop') && this.section === section) {
        if (section === 'products') this.productMenuOpen = !this.productMenuOpen;
        if (section === 'shop') this.shopMenuOpen = !this.shopMenuOpen;
      } else {
        this.section = section;
        if (section === 'products') {
          this.productMenuOpen = true;
          if (this.productSubSection === 'list') { this.loadProducts(); this.loadProductCategories(); }
          else this.loadStockLogs();
        }
        if (section === 'shop') {
          this.shopMenuOpen = true;
          if (this.shopSubSection === 'carousel') this.loadCarouselFromStorage();
          else this.loadSalesData();
        }
      }
      // 更新顶级导航按钮高亮
      document.querySelectorAll('.nav-list > .nav-item > button').forEach(btn => {
        const isActive = btn.dataset.section === this.section &&
          ((this.section === 'products' && this.productMenuOpen) ||
           (this.section === 'shop' && this.shopMenuOpen) ||
           (this.section !== 'products' && this.section !== 'shop'));
        btn.classList.toggle('active', isActive);
      });
      this.selectedEmployees = [];
      this.selectedDepartments = [];
      this.selectedSalaries = [];
      this.selectedProducts = [];
      // 加载各模块数据
      if (section === 'employees') { this.loadEmployees(); this.loadDepartments().catch(() => {}); }
      if (section === 'departments') this.loadDepartments().catch(() => {});
      if (section === 'salaries') { this.loadEmployees().catch(() => {}); this.loadSalaryAll(); }
      if (section === 'orders') this.loadAllOrders();
      if (section === 'shop') {
      if (this.shopSubSection === 'carousel') this.loadCarouselFromStorage();
      else this.loadSalesData();
    }
    },
    /**
     * 切换商品子菜单（商品列表 / 库存日志）
     * 强制将 section 设为 'products' 并展开子菜单
     * @param {string} sub - 'list' | 'stocks'
     */
    switchProductSub(sub) {
      this.productSubSection = sub;
      this.section = 'products';
      this.productMenuOpen = true;
      document.querySelectorAll('.nav-list > .nav-item > button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === 'products');
      });
      if (sub === 'list') { this.loadProducts(); this.loadProductCategories(); }
      else this.loadStockLogs();
    },
    /**
     * 切换店铺子菜单（营业数据 / 轮播图管理）
     * 强制将 section 设为 'shop' 并展开子菜单
     * @param {string} sub - 'sales' | 'carousel'
     */
    switchShopSub(sub) {
      this.shopSubSection = sub;
      this.section = 'shop';
      this.shopMenuOpen = true;
      document.querySelectorAll('.nav-list > .nav-item > button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === 'shop');
      });
      if (sub === 'carousel') this.loadCarouselFromStorage();
      else this.loadSalesData();
    },
    // ======================== 营业数据加载与聚合 ========================

    /**
     * 加载营业数据 —— 并行请求 /orders/analytics 与 /orders
     * API 不可用时自动使用模拟数据兜底，确保仪表盘始终有数据展示
     * 加载完成后自动按月度/每日/年度三级聚合
     */
    loadSalesData() {
      // 并行加载营业数据和订单数据（订单用于环形图状态分布）
      const analyticsPromise = axios.get(`${API_BASE}/orders/analytics`, {
        headers: this.authHeader()
      }).then(resp => {
        this.salesData = Array.isArray(resp.data?.data) ? resp.data.data : [];
      }).catch(() => {
        console.warn('[营业数据] API 不可用，使用模拟数据');
        this.salesData = this.generateDemoSalesData();
      });

      const ordersPromise = this.orders.length === 0
        ? axios.get(`${API_BASE}/orders`, {
            headers: this.authHeader()
          }).then(resp => {
            this.orders = Array.isArray(resp.data?.data) ? resp.data.data : [];
          }).catch(() => { /* 非关键 */ })
        : Promise.resolve();

      Promise.all([analyticsPromise, ordersPromise]).then(() => {
        this.monthlySalesData = this.aggregateMonthly(this.salesData);
        this.dailySalesData = this.aggregateDaily(this.salesData);
        this.yearlySalesData = this.aggregateYearly(this.salesData);
        // 默认展开最新年份
        if (this.yearlySalesData.length && !this.expandedYear) {
          this.expandedYear = this.yearlySalesData[this.yearlySalesData.length - 1].year;
        }
        this.renderSalesChartAfterDOM();
      });
    },
    /**
     * 延迟渲染图表 —— 等待 Vue v-show/v-if 完成 DOM 更新
     * 使用 setTimeout 防抖，避免在 DOM 未就绪时获取不到 canvas 元素
     */
    renderSalesChartAfterDOM() {
      // 等待 DOM 完全就绪后再渲染（v-show 切换需要时间）
      clearTimeout(this._salesChartTimer);
      this._salesChartTimer = setTimeout(() => this.renderSalesChart(), 500);
    },
    /**
     * 生成模拟营业数据（API 不可用时的兜底方案）
     * 生成近 180 天的每日数据，含周末销量加权（1.4x），使图表展示有合理的起伏
     * @returns {Array} 每日包含 date、order_count、total_revenue
     */
    generateDemoSalesData() {
      const data = [];
      const now = new Date();
      // 生成近 180 天的每日模拟数据，以便月度聚合有足够样本
      for (let i = 179; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        // 模拟周末销量略高、工作日略低的规律
        const dayOfWeek = d.getDay();
        const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.4 : 1.0;
        const baseOrders = Math.floor(Math.random() * 25) + 8;
        const avgOrderValue = Math.floor(Math.random() * 40) + 25;
        data.push({
          date: dateStr,
          order_count: Math.floor(baseOrders * weekendBoost),
          total_revenue: Math.floor(baseOrders * weekendBoost * avgOrderValue)
        });
      }
      return data;
    },
    /**
     * 将每日营业数据聚合为月度数据
     * 取最近 6 个月，每项含 label（中文年月）、avg_daily_orders（日均订单）
     * @param {Array} dailyData - 每日原始数据
     * @returns {Array} 月度聚合数组
     */
    aggregateMonthly(dailyData) {
      if (!dailyData || !dailyData.length) return [];
      const monthly = {};
      dailyData.forEach(d => {
        const monthKey = d.date.substring(0, 7); // "2024-06"
        if (!monthly[monthKey]) {
          monthly[monthKey] = { month: monthKey, order_count: 0, total_revenue: 0, days: 0 };
        }
        monthly[monthKey].order_count += Number(d.order_count) || 0;
        monthly[monthKey].total_revenue += Number(d.total_revenue) || 0;
        monthly[monthKey].days++;
      });
      return Object.values(monthly)
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6)
        .map(m => ({
          month: m.month,
          label: this.formatMonthLabel(m.month),
          order_count: m.order_count,
          total_revenue: Math.round(m.total_revenue * 100) / 100,
          avg_daily_orders: Math.round(m.order_count / m.days)
        }));
    },
    /**
     * 聚合每日销售数据（最近 7 天）
     * 用于柱状图每日营业额对比，每条含 label（中文日期）、order_count、total_revenue
     * @param {Array} dailyData - 每日原始数据
     * @returns {Array} 每日聚合数组（最近 7 天）
     */
    aggregateDaily(dailyData) {
      if (!dailyData || !dailyData.length) return [];
      // 按日期聚合
      const dayMap = {};
      dailyData.forEach(d => {
        const dateKey = d.date; // "2026-06-17"
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = { date: dateKey, order_count: 0, total_revenue: 0 };
        }
        dayMap[dateKey].order_count += Number(d.order_count) || 0;
        dayMap[dateKey].total_revenue += Number(d.total_revenue) || 0;
      });
      // 转为数组，按日期排序，取最近7天
      return Object.values(dayMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7)
        .map(d => ({
          date: d.date,
          label: this.formatDayLabel(d.date),
          order_count: d.order_count,
          total_revenue: Math.round(d.total_revenue * 100) / 100
        }));
    },
    /** 格式化日期为中文短格式 "6月17日" */
    formatDayLabel(dateStr) {
      const parts = dateStr.split('-');
      return parseInt(parts[1], 10) + '月' + parseInt(parts[2], 10) + '日';
    },
    /** 根据日期字符串返回中文星期几 */
    formatWeekday(dateStr) {
      const d = new Date(dateStr);
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[d.getDay()];
    },
    /**
     * 按 年 → 月 → 日 三级嵌套聚合销售数据
     * 用于年度折叠菜单视图，每级均含 total_revenue 和 order_count 汇总
     * @param {Array} dailyData - 每日原始数据
     * @returns {Array} [{ year, label, total_revenue, order_count, months: [...] }]
     */
    aggregateYearly(dailyData) {
      if (!dailyData || !dailyData.length) return [];
      const yearMap = {};
      dailyData.forEach(d => {
        const y = d.date.substring(0, 4);  // "2026"
        const m = d.date.substring(5, 7);  // "06"
        const day = d.date;                 // "2026-06-17"
        if (!yearMap[y]) yearMap[y] = { months: {} };
        if (!yearMap[y].months[m]) yearMap[y].months[m] = { days: {} };
        if (!yearMap[y].months[m].days[day]) {
          yearMap[y].months[m].days[day] = { date: day, order_count: 0, total_revenue: 0 };
        }
        yearMap[y].months[m].days[day].order_count += Number(d.order_count) || 0;
        yearMap[y].months[m].days[day].total_revenue += Number(d.total_revenue) || 0;
      });
      // 转为嵌套数组
      const years = Object.keys(yearMap).sort().map(y => {
        const monthKeys = Object.keys(yearMap[y].months).sort();
        const months = monthKeys.map(m => {
          const dayKeys = Object.keys(yearMap[y].months[m].days).sort();
          const days = dayKeys.map(d => ({
            ...yearMap[y].months[m].days[d],
            label: this.formatDayLabel(d),
            weekday: this.formatWeekday(d)
          }));
          const mTotal = days.reduce((s, d) => s + d.total_revenue, 0);
          const mOrders = days.reduce((s, d) => s + d.order_count, 0);
          return { month: m, label: parseInt(m, 10) + '月', total_revenue: mTotal, order_count: mOrders, days };
        });
        const yTotal = months.reduce((s, m) => s + m.total_revenue, 0);
        const yOrders = months.reduce((s, m) => s + m.order_count, 0);
        return { year: y, label: y + '年', total_revenue: yTotal, order_count: yOrders, months };
      });
      return years;
    },
    /**
     * 切换年度折叠面板的展开状态
     * 展开另一年份时自动收起月份视图
     * @param {string} year - 年份字符串，如 "2026"
     */
    toggleYear(year) {
      this.expandedYear = this.expandedYear === year ? null : year;
      this.expandedMonth = null;
    },
    /**
     * 切换月度折叠面板，并联动更新柱状图为该月每日数据
     * 收起时恢复最近 7 天的默认视图
     * @param {string} monthKey - 格式 "YYYY-MM"
     */
    toggleMonth(monthKey) {
      this.expandedMonth = this.expandedMonth === monthKey ? null : monthKey;
      // 点月份时更新柱状图为该月每日数据
      if (this.expandedMonth) {
        const [y, m] = this.expandedMonth.split('-');
        const yearData = this.yearlySalesData.find(yd => yd.year === y);
        if (yearData) {
          const monData = yearData.months.find(md => md.month === m);
          if (monData && monData.days.length) {
            this.dailySalesData = monData.days;
            this.renderSalesChartAfterDOM();
          }
        }
      } else {
        // 收起后恢复最近7天
        this.dailySalesData = this.aggregateDaily(this.salesData);
        this.renderSalesChartAfterDOM();
      }
    },
    /** 数字千分位格式化，保留两位小数，如 12345 → "12,345.00" */
    formatNumber(v) {
      return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    /** 格式化月度键为中文标签 "2026年6月" */
    formatMonthLabel(monthKey) {
      const [y, m] = monthKey.split('-');
      return y + '年' + parseInt(m, 10) + '月';
    },
    /**
     * 渲染营业数据图表 —— 柱状图（每日营业额）+ 环形图（订单状态分布）
     *
     * 柱状图使用自定义 Chart.js 插件实现：
     *   - barGradientFill：每根柱子独立线性渐变（从浅到深立体质感）
     *   - barDayLabels：柱子顶部金额标签 + 最高柱的 MAX 冠军标记
     *   最高柱使用深色主题色渐变，其他柱子使用标准渐变
     *
     * 环形图分主备两套方案：
     *   - 有订单数据 → 展示「待支付/已支付/已取消」订单状态分布饼图
     *   - 无订单数据 → 展示月度营收占比兜底方案
     *   两套均含中心文字自定义插件（doughnutCenterText）
     */
    renderSalesChart() {
      const barCanvas = document.getElementById('salesChart');
      const doughnutCanvas = document.getElementById('salesDoughnut');
      if (!barCanvas || !doughnutCanvas) {
        console.warn('[营业数据] Canvas 元素未找到，可能 DOM 尚未就绪');
        return;
      }
      // 确保数据存在（每日 + 月度 + 年度），API 失败时用模拟数据兜底
      if (!this.monthlySalesData.length) {
        if (!this.salesData.length) this.salesData = this.generateDemoSalesData();
        this.monthlySalesData = this.aggregateMonthly(this.salesData);
      }
      if (!this.dailySalesData.length) {
        this.dailySalesData = this.aggregateDaily(this.salesData);
      }
      if (!this.yearlySalesData.length) {
        this.yearlySalesData = this.aggregateYearly(this.salesData);
      }

      // 销毁旧图表实例，避免内存泄漏和重复渲染
      try { if (this.salesChart) this.salesChart.destroy(); } catch (e) {}
      try { if (this.salesDoughnut) this.salesDoughnut.destroy(); } catch (e) {}
      this.salesChart = null;
      this.salesDoughnut = null;

      const days = this.dailySalesData;      // 每日数据
      const months = this.monthlySalesData; // 月度汇总（环形图用）
      const totalRevenue = days.reduce((s, d) => s + d.total_revenue, 0);
      const fmt = (v) => '¥' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      // 判断当前查看的是否为某个月份
      const activeMonthLabel = this.expandedMonth
        ? (() => { const [y, m] = this.expandedMonth.split('-'); return y + '年' + parseInt(m, 10) + '月'; })()
        : null;

      // ======================== 柱状图：每日营业额对比 ========================
      if (barCanvas) {
        /**
         * 为每根柱子生成垂直渐变填充色
         * 使用 linearGradient（从上到下）实现立体质感
         * 最高柱使用深色调突出，其余柱子使用标准渐变
         * @param {Chart} chart - Chart.js 实例
         * @param {number} dataIndex - 柱子索引
         * @param {boolean} isMax - 是否为最高营业额柱
         * @returns {CanvasGradient|string} 渐变对象或纯色字符串
         */
        function createBarGradient(chart, dataIndex, isMax) {
          const meta = chart.getDatasetMeta(0);
          if (!meta.data[dataIndex]) return isMax ? '#1e574f' : '#2d7a6a';
          const bar = meta.data[dataIndex];
          const gradient = chart.ctx.createLinearGradient(bar.x, bar.y, bar.x, bar.base);
          if (isMax) {
            // 最高月份：主题色加深突出
            gradient.addColorStop(0, '#2d7a6a');
            gradient.addColorStop(0.45, '#1e574f');
            gradient.addColorStop(1, '#0f3d36');
          } else {
            // 标准月份：主题色渐变
            gradient.addColorStop(0, '#58b899');
            gradient.addColorStop(0.4, '#2d7a6a');
            gradient.addColorStop(0.75, '#1e574f');
            gradient.addColorStop(1, '#1a3d36');
          }
          return gradient;
        }

        // 找出最高营业额日期的索引
        const maxIdx = days.reduce((maxI, d, i, arr) =>
          d.total_revenue > arr[maxI].total_revenue ? i : maxI, 0);

        // 先用透明色创建图表，柱子的渐变色由自定义插件 barGradientFill 在 afterDatasetsDraw 中动态绘制
        const transparent = 'rgba(0,0,0,0.01)';

        this.salesChart = new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels: days.map(d => d.label),
            datasets: [{
              label: '日营业额',
              data: days.map(d => d.total_revenue),
              backgroundColor: transparent,
              borderColor: transparent,
              borderWidth: 0,
              borderRadius: 8,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 32 } },
            interaction: { mode: 'index', intersect: false },
            onHover: (e, els) => {
              e.native.target.style.cursor = els.length ? 'pointer' : 'default';
            },
            plugins: {
              title: {
                display: true,
                text: activeMonthLabel
                  ? '' + activeMonthLabel + ' 每日营业额（' + days.length + ' 天）'
                  : '每日营业额对比（最近 ' + days.length + ' 天）',
                font: { size: 16, weight: 'bold' },
                color: '#1a3d36',
                padding: { bottom: 14 }
              },
              subtitle: {
                display: true,
                text: '累计 ' + fmt(totalRevenue) + '  ·  ' + days.reduce((s, d) => s + d.order_count, 0) + ' 单',
                font: { size: 12 },
                color: '#7a9a90',
                padding: { bottom: 6 }
              },
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15,23,42,0.92)',
                titleFont: { size: 13, weight: 'bold' },
                bodyFont: { size: 13 },
                padding: 14,
                cornerRadius: 12,
                displayColors: true,
                boxPadding: 6,
                callbacks: {
                  title(items) {
                    const idx = items[0].dataIndex;
                    const d = days[idx];
                    return '' + d.label + '  ' + formatWeekday(d.date);
                  },
                  label(ctx) {
                  return '营业额：' + fmt(ctx.raw);
                  },
                  afterLabel(ctx) {
                    const d = days[ctx.dataIndex];
                  return '订单数：' + d.order_count + ' 单';
                  }
                }
              }
            },
            scales: {
              y: {
                // Y 轴最大值取最高柱的 1.3 倍，向上取整到百，为顶部标签留空间
                max: Math.ceil(Math.max(...days.map(d => d.total_revenue), 1) * 1.3 / 100) * 100,
                beginAtZero: true,
                max: Math.ceil(Math.max(...days.map(d => d.total_revenue), 1) * 1.3 / 100) * 100,
                grid: { color: '#eef3f0' },
                ticks: {
                  // Y 轴刻度格式化：>=10000 用「w」（万），>=1000 用「k」（千），否则直接显示
                  callback: (v) => v >= 10000 ? '¥' + (v / 10000).toFixed(1) + 'w' : (v >= 1000 ? '¥' + (v / 1000).toFixed(1) + 'k' : '¥' + v),
                  font: { size: 11 },
                  color: '#94a3b8'
                },
                title: {
                  display: true,
                  text: '营业额（元）',
                  font: { size: 11 },
                  color: '#94a3b8'
                }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 12 }, color: '#64748b' }
              }
            }
          },
          plugins: [
            /**
             * 自定义插件：柱子渐变填充
             * 在 Chart.js 绘制数据集之后，用 Canvas 2D 渐变重绘每根柱子
             * 圆角矩形路径（上方圆角, 下方直角）+ 顶部高光线
             */
            {
              id: 'barGradientFill',
              afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                if (!meta.data.length) return;
                meta.data.forEach((bar, i) => {
                  const isMax = i === maxIdx;
                  const gradient = createBarGradient(chart, i, isMax);
                  // 用 Canvas 2D 在柱子坐标范围内绘制渐变矩形
                  const { ctx } = chart;
                  ctx.save();
                  // 用圆角矩形路径重绘
                  const { x, y, base, width } = bar;
                  const r = 8;
                  const h = base - y;
                  const w = width;
                  ctx.fillStyle = gradient;
                  ctx.beginPath();
                  // 圆角矩形（上方圆角，下方直角）
                  ctx.moveTo(x - w / 2 + r, y);
                  ctx.lineTo(x + w / 2 - r, y);
                  ctx.quadraticCurveTo(x + w / 2, y, x + w / 2, y + r);
                  ctx.lineTo(x + w / 2, base);
                  ctx.lineTo(x - w / 2, base);
                  ctx.lineTo(x - w / 2, y + r);
                  ctx.quadraticCurveTo(x - w / 2, y, x - w / 2 + r, y);
                  ctx.closePath();
                  ctx.fill();

                  // 顶部高光线
                  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                  ctx.lineWidth = 1;
                  ctx.beginPath();
                  ctx.moveTo(x - w / 2 + r + 2, y + 1);
                  ctx.lineTo(x + w / 2 - r - 2, y + 1);
                  ctx.stroke();

                  ctx.restore();
                });
              }
            },
            /**
             * 自定义插件：柱子上方金额标签 + 最高柱的「MAX」冠军标记
             * 最高柱用醒目的橙色（#d97706）显示大号金额 + MAX 标签
             * 其余柱子用小号绿色（#0f766e）显示金额
             */
            {
              id: 'barDayLabels',
              afterDatasetsDraw(chart) {
                const { ctx } = chart;
                const meta = chart.getDatasetMeta(0);
                if (meta.hidden) return;
                meta.data.forEach((bar, i) => {
                  const val = chart.data.datasets[0].data[i];
                  const isMax = i === maxIdx;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'bottom';
                  if (isMax) {
                    ctx.font = 'bold 13px "Segoe UI", sans-serif';
                    ctx.fillStyle = '#d97706';
                    ctx.fillText('¥ ' + Number(val).toLocaleString('zh-CN'), bar.x, bar.y - 8);
                    ctx.font = '16px "Segoe UI", sans-serif';
                  ctx.fillText('MAX', bar.x, bar.y - 28);
                  } else {
                    ctx.font = '11px "Segoe UI", sans-serif';
                    ctx.fillStyle = '#0f766e';
                    ctx.fillText('¥ ' + Number(val).toLocaleString('zh-CN'), bar.x, bar.y - 8);
                  }
                });
              }
            }]
        });
      }

      // ======================== 环形图：订单状态分布 ========================
      // 主方案：展示订单状态（待支付/已支付/已取消）分布
      // 兜底方案：当无订单数据时展示月度营收占比
      if (doughnutCanvas) {
        // 统计三类订单状态数量
        const pendingOrders  = this.orders.filter(o => o.status === 0).length;
        const paidOrders     = this.orders.filter(o => o.status === 1).length;
        const cancelledOrders = this.orders.filter(o => o.status === 2).length;
        const totalOrders    = this.orders.length;

        // 如果没有订单数据，使用营收月度占比兜底
        if (totalOrders === 0) {
          this.salesDoughnut = new Chart(doughnutCanvas, {
            type: 'doughnut',
            data: {
              labels: months.map(m => m.label),
              datasets: [{
                data: months.map(m => m.total_revenue),
                backgroundColor: ['#1e574f','#2d7a6a','#419d81','#58b899','#74c9aa','#92d7bc'],
                borderColor: '#fff',
                borderWidth: 2.5,
                hoverOffset: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '62%',
              plugins: {
                title: {
                  display: true,
                text: '月度营收占比',
                  font: { size: 16, weight: 'bold' },
                  color: '#1a3d36',
                  padding: { bottom: 14 }
                },
                subtitle: {
                  display: true,
                  text: '暂无订单数据，展示营收分布',
                  font: { size: 11 },
                  color: '#a0b5ad',
                  padding: { bottom: 4 }
                },
                legend: {
                  position: 'bottom',
                  labels: { padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 }, color: '#4a6b61' }
                },
                tooltip: {
                  backgroundColor: 'rgba(26,61,54,0.93)',
                  callbacks: {
                    label(ctx) {
                      const val = Number(ctx.raw);
                      const pct = totalRevenue > 0 ? ((val / totalRevenue) * 100).toFixed(1) : 0;
                      return fmt(val) + '  (' + pct + '%)';
                    }
                  }
                }
              }
            },
            plugins: [{
              /** 自定义插件：环形图中心显示总营收金额（兜底方案用） */
              id: 'doughnutCenterText',
              afterDraw(chart) {
                const { ctx, chartArea: { width, height, top, left } } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 18px "Segoe UI", Tahoma, sans-serif';
                ctx.fillStyle = '#1a3d36';
                ctx.fillText(fmt(totalRevenue), left + width / 2, top + height / 2 - 6);
                ctx.font = '12px "Segoe UI", Tahoma, sans-serif';
                ctx.fillStyle = '#8a9f97';
                ctx.fillText(months.length + ' 个月合计', left + width / 2, top + height / 2 + 16);
                ctx.restore();
              }
            }]
          });
        } else {
          // 主方案：订单状态分布
          const statusLabels = ['待支付', '已支付', '已取消'];
          const statusData   = [pendingOrders, paidOrders, cancelledOrders];
          const statusColors = ['#f0a050', '#2d7a6a', '#b0b0b0'];
          this.salesDoughnut = new Chart(doughnutCanvas, {
            type: 'doughnut',
            data: {
              labels: statusLabels,
              datasets: [{
                data: statusData,
                backgroundColor: statusColors,
                borderColor: '#fff',
                borderWidth: 3,
                hoverBorderWidth: 4,
                hoverBorderColor: '#f5faf7',
                hoverOffset: 10
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '60%',
              plugins: {
                title: {
                  display: true,
                text: '订单状态分布',
                  font: { size: 16, weight: 'bold' },
                  color: '#1a3d36',
                  padding: { bottom: 14 }
                },
                subtitle: {
                  display: true,
                  text: '全部 ' + totalOrders + ' 笔订单',
                  font: { size: 12 },
                  color: '#7a9a90',
                  padding: { bottom: 4 }
                },
                legend: {
                  position: 'bottom',
                  labels: {
                    padding: 16,
                    usePointStyle: true,
                    pointStyleWidth: 12,
                    pointStyleHeight: 12,
                    font: { size: 13 },
                    color: '#4a6b61',
                    generateLabels(chart) {
                      const data = chart.data;
                      return data.labels.map((label, i) => ({
                        text: label + '：' + data.datasets[0].data[i] + ' 单',
                        fillStyle: data.datasets[0].backgroundColor[i],
                        strokeStyle: data.datasets[0].backgroundColor[i],
                        lineWidth: 0,
                        hidden: false,
                        index: i,
                        pointStyle: 'circle',
                        rotation: 0
                      }));
                    }
                  }
                },
                tooltip: {
                  backgroundColor: 'rgba(26,61,54,0.93)',
                  titleFont: { size: 14, weight: 'bold' },
                  bodyFont: { size: 14 },
                  padding: 14,
                  cornerRadius: 12,
                  displayColors: true,
                  boxPadding: 6,
                  callbacks: {
                    title(items) {
                      return items[0].label;
                    },
                    label(ctx) {
                      const count = ctx.raw;
                      const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : 0;
                      if (ctx.dataIndex === 0) return count + ' 笔待处理  ·  占比 ' + pct + '%';
                      if (ctx.dataIndex === 1) return count + ' 笔已完成  ·  占比 ' + pct + '%';
                      return count + ' 笔已取消  ·  占比 ' + pct + '%';
                    }
                  }
                }
              }
            },
            plugins: [{
              /**
               * 自定义插件：环形图中心多行文本
               * 显示：总订单数 / "全部订单" / 完成率百分比
               */
              id: 'doughnutCenterText',
              afterDraw(chart) {
                const { ctx, chartArea: { width, height, top, left } } = chart;
                const centerX = left + width / 2;
                const centerY = top + height / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 28px "Segoe UI", Tahoma, sans-serif';
                ctx.fillStyle = '#1a3d36';
                ctx.fillText(totalOrders, centerX, centerY - 8);
                ctx.font = '13px "Segoe UI", Tahoma, sans-serif';
                ctx.fillStyle = '#8a9f97';
                ctx.fillText('全部订单', centerX, centerY + 16);
                // 完成率
                const doneRate = totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0;
                ctx.font = 'bold 13px "Segoe UI", Tahoma, sans-serif';
                ctx.fillStyle = '#2d7a6a';
                ctx.fillText('完成率 ' + doneRate + '%', centerX, centerY + 36);
                ctx.restore();
              }
            }]
          });
        }
      }
    },
    // ======================== 库存日志管理 ========================

    /** 加载所有库存变动日志，按操作时间倒序 */
    loadStockLogs() {
      axios.get(`${API_BASE}/stocks/logs`, {
        headers: this.authHeader()
      })
        .then(resp => {
          this.stockLogs = Array.isArray(resp.data?.data) ? resp.data.data : [];
        })
        .catch(err => {
          console.error('[库存日志] 加载失败:', err);
          this.stockLogs = [];
        });
    },
    // ======================== 分类管理 ========================

    /** 加载所有商品分类列表 */
    loadProductCategories() {
      axios.get(`${API_BASE}/categories`, { headers: this.authHeader() })
        .then(resp => {
          this.productCategories = Array.isArray(resp.data?.data) ? resp.data.data : [];
        })
        .catch(() => { this.productCategories = []; });
    },
    /**
     * 创建新商品分类
     * 校验分类名非空后通过 POST /categories 提交
     * 创建成功后重置表单并刷新分类列表
     */
    createCategory() {
      if (!this.newCategoryName.trim()) {
        alert('分类名称不能为空');
        return;
      }
      const payload = {
        name: this.newCategoryName.trim(),
        description: this.newCategoryDesc.trim() || undefined,
        parentId: this.newCategoryParentId || null
      };
      axios.post(`${API_BASE}/categories`, payload, {
        headers: this.authHeader()
      })
        .then(() => {
          alert('分类创建成功');
          this.newCategoryName = '';
          this.newCategoryDesc = '';
          this.newCategoryParentId = null;
          this.categoryModalVisible = false;
          this.loadProductCategories();
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '创建分类失败';
          alert(msg);
        });
    },
    // ======================== 批量操作：全选/确认/执行 ========================
    // 各模块的批量操作遵循统一模式：toggleSelectAll → confirmBatch → batch
    // 危险操作统一使用 confirmModal 通用弹窗，提供明细预览

    /** 员工列表全选/取消全选 */
    toggleSelectAllEmployees(e) {
      this.selectedEmployees = e.target.checked ? this.paginatedEmployees.map(i => i.id) : [];
    },
    /**
     * 确认批量删除员工 —— 弹出通用确认弹窗，预览前 5 名员工
     * 超出 5 人的显示省略提示
     */
    confirmBatchDeleteEmployees() {
      if (this.selectedEmployees.length === 0) return;
      const names = this.selectedEmployees.slice(0, 5).map(id => {
        const emp = this.employees.find(e => e.id === id);
        return emp ? `#${id} ${emp.realName}` : `#${id}`;
      }).join('\n');
      this.confirmModal = {
        visible: true,
        type: 'danger',
        title: '确认批量删除员工',
        message: `将删除 ${this.selectedEmployees.length} 名员工，此操作不可恢复。`,
        detail: names + (this.selectedEmployees.length > 5 ? `\n... 还有 ${this.selectedEmployees.length - 5} 名` : ''),
        confirmText: '确认删除',
        onConfirm: () => this.batchDeleteEmployees()
      };
    },
    /**
     * 执行批量删除员工（逐条串行调用 API）
     * 失败时静默跳过，刷新列表后由用户自行确认结果
     */
    async batchDeleteEmployees() {
      for (const id of this.selectedEmployees) {
        try { await axios.delete(`${API_BASE}/employee/${id}`, { headers: this.authHeader() }); } catch (e) {}
      }
      this.selectedEmployees = [];
      this.loadEmployees();
    },
    /** 部门列表全选/取消全选 */
    toggleSelectAllDepartments(e) {
      this.selectedDepartments = e.target.checked ? this.paginatedDepartments.map(i => i.id) : [];
    },
    /** 确认批量删除部门 —— 预览含各部门员工数 */
    confirmBatchDeleteDepartments() {
      if (this.selectedDepartments.length === 0) return;
      const names = this.selectedDepartments.slice(0, 5).map(id => {
        const dept = this.departments.find(d => d.id === id);
        return dept ? `${dept.name}（${dept.employeeCount || 0}人）` : `#${id}`;
      }).join('\n');
      this.confirmModal = {
        visible: true,
        type: 'danger',
        title: '确认批量删除部门',
        message: `将删除 ${this.selectedDepartments.length} 个部门，员工将不受影响。`,
        detail: names + (this.selectedDepartments.length > 5 ? `\n... 还有 ${this.selectedDepartments.length - 5} 个` : ''),
        confirmText: '确认删除',
        onConfirm: () => this.batchDeleteDepartments()
      };
    },
    async batchDeleteDepartments() {
      for (const id of this.selectedDepartments) {
        try { await axios.delete(`${API_BASE}/department/${id}`, { headers: this.authHeader() }); } catch (e) {}
      }
      this.selectedDepartments = [];
      this.loadDepartments();
    },
    toggleSelectAllSalaries(e) {
      this.selectedSalaries = e.target.checked ? this.paginatedSalaries.map(i => i.id) : [];
    },
    /** 确认批量删除薪资记录 */
    confirmBatchDeleteSalaries() {
      if (this.selectedSalaries.length === 0) return;
      const preview = this.selectedSalaries.slice(0, 5).map(id => {
        const rec = this.salaryRecords.find(r => r.id === id);
        return rec ? `#${id} 员工#${rec.employeeId} ${rec.yearMonth} ¥${Number(rec.actualSalary || 0).toFixed(2)}` : `#${id}`;
      }).join('\n');
      this.confirmModal = {
        visible: true,
        type: 'danger',
        title: '确认批量删除薪资记录',
        message: `将删除 ${this.selectedSalaries.length} 条薪资记录，此操作不可恢复。`,
        detail: preview + (this.selectedSalaries.length > 5 ? `\n... 还有 ${this.selectedSalaries.length - 5} 条` : ''),
        confirmText: '确认删除',
        onConfirm: () => this.batchDeleteSalaries()
      };
    },
    async batchDeleteSalaries() {
      for (const id of this.selectedSalaries) {
        try { await axios.delete(`${API_BASE}/salary/${id}`, { headers: this.authHeader() }); } catch (e) {}
      }
      this.selectedSalaries = [];
      this.loadSalaryAll();
    },
    /**
     * 确认批量发放工资 —— 生成详细 HTML 表格预览
     * 自动过滤已发放记录，仅对「待发放」执行批量支付
     * 表格包含：发放时间、部门、员工编号（部门id-员工id）、姓名、手机号、
     * 银行卡号、基本工资、绩效、津贴、扣款、社保、个税、实发薪资共 13 列
     */
    confirmBatchPay() {
      if (this.selectedSalaries.length === 0) return;
      const pendingOnly = this.selectedSalaries.filter(id => {
        const record = this.salaryRecords.find(r => r.id === id);
        return record && record.status !== 'PAID';
      });
      if (pendingOnly.length === 0) {
        alert('选中的薪资记录已全部发放，无需重复操作');
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const timeStr = `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const rows = pendingOnly.slice(0, 5).map(id => {
        const rec = this.salaryRecords.find(r => r.id === id);
        if (!rec) return `<tr><td colspan="9">#${id}</td></tr>`;
        const emp = this.employees.find(e => e.id === Number(rec.employeeId));
        let deptId = emp?.departmentId || emp?.deptId || null;
        const deptName = rec.employeeDepartment || emp?.departmentName || emp?.department || '-';
        // 如果员工数据没有 departmentId，从部门列表按名称反查
        if (!deptId && deptName !== '-') {
          const dept = this.departments.find(d => d.name === deptName);
          deptId = dept ? dept.id : '-';
        }
        if (!deptId) deptId = '-';
        const empId = rec.employeeId || '-';
        const empNo = `${deptId}-${String(empId).padStart(2, '0')}`;
        const empName = rec.employeeName || (emp ? emp.realName : '-');
        const phone = emp?.phone || '-';
        const bankCard = emp?.bankCardNo || '-';
        const baseSalary = Number(rec.baseSalary || 0).toFixed(2);
        const perfBonus = Number(rec.performanceBonus || 0).toFixed(2);
        const allowance = Number(rec.allowance || 0).toFixed(2);
        const deduction = Number(rec.deduction || 0).toFixed(2);
        const socialSec = Number(rec.socialSecurity || 0).toFixed(2);
        const tax = Number(rec.tax || 0).toFixed(2);
        const actualSalary = Number(rec.actualSalary || 0).toFixed(2);
        return `<tr><td>${timeStr}</td><td>${deptName}（id：${deptId}）</td><td>${empNo}</td><td>${empName}</td><td>${phone}</td><td>${bankCard}</td><td>${baseSalary}</td><td>${perfBonus}</td><td>${allowance}</td><td>${deduction}</td><td>${socialSec}</td><td>${tax}</td><td>${actualSalary}</td></tr>`;
      }).join('');
      const totalAmount = pendingOnly.reduce((sum, id) => {
        const rec = this.salaryRecords.find(r => r.id === id);
        return sum + Number(rec?.actualSalary || 0);
      }, 0);
      const tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f0f4f2;color:#16372f;">
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">发放时间</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">部门</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">ID</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">姓名</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">手机号</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">银行卡号</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">基本工资</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">绩效</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">津贴</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">扣款</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">社保</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">个税</th>
          <th style="padding:8px 6px;border-bottom:2px solid #d7e5df;white-space:nowrap;">实发薪资</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:12px 0 0;color:#5a7267;font-size:13px;">${pendingOnly.length > 5 ? `... 还有 ${pendingOnly.length - 5} 条记录未显示` : ''}</p>`;
      this.confirmModal = {
        visible: true,
        type: 'success',
        title: '确认批量发放工资',
        message: `发放时间：${timeStr}　　共 ${pendingOnly.length} 条　　合计：¥${totalAmount.toFixed(2)}`,
        detail: tableHTML,
        confirmText: '确认发放',
        onConfirm: () => this.batchPaySalaries(pendingOnly, today)
      };
    },
    /**
     * 执行批量发放工资（逐条调用 PUT /salary/:id/pay）
     * 完成后弹出成功/失败计数统计
     * @param {Array} pendingOnly - 待发放的薪资记录 ID 数组（已过滤 PAID）
     * @param {string} today - 发放日期（YYYY-MM-DD 格式）
     */
    async batchPaySalaries(pendingOnly, today) {
      let successCount = 0;
      let failCount = 0;

      for (const id of pendingOnly) {
        try {
          await axios.put(`${API_BASE}/salary/${id}/pay`, {}, { headers: this.authHeader() });
          successCount++;
        } catch (e) {
          failCount++;
          console.error(`薪资记录 #${id} 发放失败:`, e);
        }
      }
      this.selectedSalaries = [];
      this.loadSalaryAll();
      alert(`批量发放完成！\n成功：${successCount} 条\n失败：${failCount} 条`);
    },
    toggleSelectAllProducts(e) {
      this.selectedProducts = e.target.checked ? this.paginatedProducts.map(i => i.id) : [];
    },
    /** 确认批量删除商品 —— 预览商品名称和价格 */
    confirmBatchDeleteProducts() {
      if (this.selectedProducts.length === 0) return;
      const names = this.selectedProducts.slice(0, 5).map(id => {
        const prod = this.products.find(p => p.id === id);
        return prod ? `#${id} ${prod.name} ¥${prod.price}` : `#${id}`;
      }).join('\n');
      this.confirmModal = {
        visible: true,
        type: 'danger',
        title: '确认批量删除商品',
        message: `将删除 ${this.selectedProducts.length} 件商品，此操作不可恢复。`,
        detail: names + (this.selectedProducts.length > 5 ? `\n... 还有 ${this.selectedProducts.length - 5} 件` : ''),
        confirmText: '确认删除',
        onConfirm: () => this.batchDeleteProducts()
      };
    },
    async batchDeleteProducts() {
      let failedCount = 0;
      for (const id of this.selectedProducts) {
        try {
          const response = await axios.delete(`${API_BASE}/products/${id}`, { headers: this.authHeader() });
          const data = response.data;
          if (data && typeof data.code === 'number' && data.code !== 200) {
            failedCount++;
          }
        } catch (e) {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        alert(`批量删除完成：成功 ${this.selectedProducts.length - failedCount} 件，失败 ${failedCount} 件。\n失败原因可能是权限不足，请检查是否使用管理员账号。`);
      }
      this.selectedProducts = [];
      this.loadProducts();
    },
    // ======================== 订单管理 ========================

    /**
     * 加载全部订单列表，并预加载各订单的明细项缓存
     * 明细通过并发请求加载，存入 orderItemsCache 供搜索和摘要展示使用
     */
    loadAllOrders() {
      axios.get(`${API_BASE}/orders`, {
        headers: this.authHeader()
      })
        .then(resp => {
          this.orders = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.orderPage = 1;
          // 预加载订单明细（Vue3 Proxy 自动检测属性添加，无需整体替换）
          this.orders.forEach(o => {
            if (!(o.id in this.orderItemsCache)) {
              axios.get(`${API_BASE}/orders/${o.id}/items`, {
                headers: this.authHeader()
              }).then(r => {
                this.orderItemsCache[o.id] = Array.isArray(r.data?.data) ? r.data.data : [];
              }).catch(() => {
                this.orderItemsCache[o.id] = [];
              });
            }
          });
        })
        .catch(err => {
          console.error('[订单] 加载失败:', err);
          this.orders = [];
        });
    },
    /**
     * 获取订单商品摘要（从缓存中拼接 "商品名x数量, ..." 字符串）
     * 用于订单列表中展示所包含的商品信息
     * @param {number|string} orderId - 订单 ID
     * @returns {string} 商品摘要或 '(无明细)'
     */
    getOrderProductSummary(orderId) {
      if (!(orderId in this.orderItemsCache)) return ''; // 还未加载
      const items = this.orderItemsCache[orderId];
      if (!items || !items.length) return '(无明细)';
      return items.map(i => `${i.productName || '商品'}x${i.quantity}`).join(', ');
    },
    /**
     * 打开订单明细弹窗 —— 显示收货人信息 + 商品明细列表
     * @param {Object} order - 订单对象
     */
    viewAdminOrderItems(order) {
      this.adminOrderItemsOrderId = order.id;
      this.adminOrderOrderNo = order.orderNo;
      this.adminOrderReceiverName = order.receiverName || '';
      this.adminOrderPhone = order.phone || '';
      this.adminOrderAddress = order.address || '';
      this.adminOrderItems = [];
      this.adminOrderItemsLoading = true;
      this.adminOrderItemsModalVisible = true;
      axios.get(`${API_BASE}/orders/${order.id}/items`, {
        headers: this.authHeader()
      })
        .then(resp => {
          this.adminOrderItems = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.adminOrderItemsLoading = false;
        })
        .catch(err => {
          console.error('[订单明细] 加载失败:', err);
          this.adminOrderItems = [];
          this.adminOrderItemsLoading = false;
        });
    },
    /**
     * 管理员取消订单 —— 调用 PUT /orders/:id/cancel
     * 后端自动恢复库存
     * @param {Object} order - 要取消的订单对象
     */
    cancelAdminOrder(order) {
      if (!confirm(`确认取消订单 #${order.id}「${order.orderNo}」？取消后将恢复库存。`)) return;
      axios.put(`${API_BASE}/orders/${order.id}/cancel`, null, {
        headers: this.authHeader()
      })
        .then(() => {
          alert('订单已取消，库存已恢复。');
          this.loadAllOrders();
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '取消订单失败';
          alert(msg);
        });
    },
    /** 登出：清除 token 和用户信息，跳转至登录页 */
    logout() {
      localStorage.removeItem('marketos_token');
      localStorage.removeItem('marketos_user');
      window.location.href = 'login.html';
    },
    // ======================== 员工管理 ========================

    /**
     * 加载全部员工列表（GET /employee/all）
     * 用于员工管理表格及薪资模块的员工选择器
     * @returns {Promise<Array>} 员工数组
     */
    loadEmployees() {
      return axios.get(`${API_BASE}/employee/all`, { headers: this.authHeader() })
        .then(resp => {
          const data = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.employees = data;
          console.log('[员工] 加载成功，共 ' + data.length + ' 名员工');
          return data;
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '网络请求失败';
          console.error('[员工] 加载失败:', msg, err);
          this.employees = [];
          throw err;
        });
    },
    /**
     * 显示新增员工表单
     * 重置表单至初始状态，确保部门列表已加载后再弹出
     * 通过 $nextTick 自动滚动到表单位置
     */
    async showEmployeeForm() {
      this.editingEmployeeId = null;
      this.formErrors = {};
      this.submitLoading = false;
      this.employeeForm = {
        realName: '',
        gender: 'MALE',
        position: '',
        department: '',
        departmentId: null,
        baseSalary: 0,
        performanceBonus: 0,
        allowance: 0,
        deduction: 0,
        socialSecurity: 0,
        tax: 0,
        phone: '',
        email: '',
        bankCardNo: ''
      };
      // 先确保部门数据已加载，再显示表单
      if (this.departments.length === 0) {
        try {
          await this.loadDepartments();
        } catch (e) {
          alert('部门数据加载失败，请检查网络连接和后端服务是否正常运行。\n' +
                '确认后端已启动后，可点击"刷新部门列表"重试。');
        }
      }
      this.employeeFormDirty = false;
      this.employeeFormVisible = true;
      // 自动滚动到表单并聚焦第一个字段
      this.$nextTick(() => {
        const formEl = document.querySelector('.employee-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    /**
     * 编辑员工 —— 将现有员工数据回填至表单
     * 注意：departmentId 优先取原始字段，否则按 department 名称从部门列表反查
     * @param {Object} item - 员工对象
     */
    editEmployee(item) {
      this.editingEmployeeId = item.id;
      this.formErrors = {};
      this.submitLoading = false;
      this.employeeForm = {
        realName: item.realName || '',
        gender: item.gender || 'MALE',
        position: item.position || '',
        department: item.department || '',
        departmentId: item.departmentId || (item.department ? (this.departments.find(d => d.name === item.department)?.id || null) : null),
        baseSalary: Number(item.baseSalary) || 0,
        performanceBonus: Number(item.performanceBonus) || 0,
        allowance: Number(item.allowance) || 0,
        deduction: Number(item.deduction) || 0,
        socialSecurity: Number(item.socialSecurity) || 0,
        tax: Number(item.tax) || 0,
        phone: item.phone || '',
        email: item.email || '',
        bankCardNo: item.bankCardNo || ''
      };
      this.employeeFormDirty = false;
      this.employeeFormVisible = true;
      if (this.departments.length === 0) this.loadDepartments().catch(() => {});
      this.$nextTick(() => {
        const formEl = document.querySelector('.employee-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    /**
     * 部门下拉变化回调 —— 自动同步 department（名称）字段
     * 表单提交时需要 departmentId（数字）和 department（名称）同时传递
     */
    onDepartmentChange() {
      const dept = this.departments.find(d => d.id === this.employeeForm.departmentId);
      this.employeeForm.department = dept ? dept.name : '';
    },
    /**
     * 取消员工表单
     * 如果表单已被修改（employeeFormDirty），弹出二次确认
     */
    cancelEmployeeForm() {
      if (this.employeeFormDirty && !confirm('员工信息已修改但未保存，确定放弃吗？')) return;
      this.employeeFormVisible = false;
      this.editingEmployeeId = null;
      this.formErrors = {};
      this.submitLoading = false;
      this.employeeFormDirty = false;
    },
    /**
     * 员工表单前端校验
     * 验证项：姓名（非空）、性别、所属部门、职位、手机号（11 位 1 开头）、
     * 邮箱（标准格式）、银行卡号（16-19 位数字）、基本工资（非负）
     * @returns {boolean} 校验是否通过
     */
    validateEmployeeForm() {
      const f = this.employeeForm;
      const errors = {};
      if (!f.realName || !f.realName.trim()) errors.realName = '姓名不能为空';
      if (!f.gender) errors.gender = '请选择性别';
      if (!f.departmentId) errors.department = '请选择所属部门';
      if (!f.position || !f.position.trim()) errors.position = '职位不能为空';
      if (!f.phone || !f.phone.trim()) {
        errors.phone = '手机号不能为空';
      } else if (!/^1[3-9]\d{9}$/.test(f.phone.trim())) {
        errors.phone = '请输入有效的11位手机号';
      }
      if (!f.email || !f.email.trim()) {
        errors.email = '邮箱不能为空';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
        errors.email = '请输入有效的邮箱地址';
      }
      if (!f.bankCardNo || !f.bankCardNo.trim()) {
        errors.bankCardNo = '银行卡号不能为空';
      } else if (!/^[0-9]{16,19}$/.test(f.bankCardNo.trim())) {
        errors.bankCardNo = '请输入16-19位银行卡号';
      }
      if (f.baseSalary == null || f.baseSalary === '' || Number(f.baseSalary) < 0) {
        errors.baseSalary = '基本薪资不能为空且不能为负';
      }
      if (f.allowance != null && f.allowance !== '' && Number(f.allowance) < 0) {
        errors.allowance = '津贴不能为负';
      }
      this.formErrors = errors;
      return Object.keys(errors).length === 0;
    },
    /**
     * 提交员工表单（新增或编辑）
     * 新增：POST /employee → 成功后自动生成员工编号（部门id-员工id）
     * 编辑：PUT /employee/:id
     * 数值字段统一经过 Number() 转换确保类型正确
     */
    createEmployee() {
      // 前端必填校验
      if (!this.validateEmployeeForm()) {
        // 滚动到第一个错误字段
        this.$nextTick(() => {
          const firstError = document.querySelector('.field-error');
          if (firstError) firstError.closest('.form-field').querySelector('input,select')?.focus();
        });
        return;
      }

      const f = this.employeeForm;
      // 清理 payload，确保数值字段正确
      const payload = { ...this.employeeForm };
      payload.baseSalary = Number(payload.baseSalary) || 0;
      payload.performanceBonus = Number(payload.performanceBonus) || 0;
      payload.allowance = Number(payload.allowance) || 0;
      payload.deduction = Number(payload.deduction) || 0;
      payload.socialSecurity = Number(payload.socialSecurity) || 0;
      payload.tax = Number(payload.tax) || 0;

      this.submitLoading = true;

      const request = this.editingEmployeeId
        ? axios.put(`${API_BASE}/employee/${this.editingEmployeeId}`, payload, { headers: this.authHeader() })
        : axios.post(`${API_BASE}/employee`, payload, { headers: this.authHeader() });

      const successMsg = this.editingEmployeeId ? '员工信息修改成功' : '员工新增成功';
      const errorMsg = this.editingEmployeeId ? '修改员工信息失败' : '新增员工失败';

      request
        .then(async resp => {
          if (resp.status >= 200 && resp.status < 300) {
            // 自动生成员工编号：部门id-员工id（如 1-01）
            const empId = this.editingEmployeeId || resp.data?.data?.id;
            const deptId = this.employeeForm.departmentId;
            if (empId && deptId) {
              const empNo = `${deptId}-${String(empId).padStart(2, '0')}`;
              try {
                await axios.put(`${API_BASE}/employee/${empId}`, { employeeNo: empNo }, { headers: this.authHeader() });
              } catch (e) { /* 编号更新失败不影响主流程 */ }
            }
            alert(successMsg);
            this.employeeFormDirty = false;
            this.cancelEmployeeForm();
            this.loadEmployees();
            this.loadSalaryAll();
          } else {
            alert(errorMsg);
          }
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || errorMsg;
          alert(msg);
        })
        .finally(() => {
          this.submitLoading = false;
        });
    },
    /**
     * 查看员工详情 —— 通过 alert 弹窗展示关键信息
     * @param {Object} item - 员工对象
     */
    viewEmployee(item) {
      const salary = item.baseSalary != null ? '¥' + Number(item.baseSalary).toFixed(2) : '未设置';
      const allowance = item.allowance != null ? '¥' + Number(item.allowance).toFixed(2) : '¥0.00';
      alert(`员工详情：\n编号：${item.employeeNo || '-'}\n姓名：${item.realName}\n性别：${item.gender === 'MALE' ? '男' : '女'}\n部门：${item.department || '-'}\n职位：${item.position || '-'}\n基本薪资：${salary}\n津贴：${allowance}\n手机：${item.phone || '-'}\n邮箱：${item.email || '-'}\n银行卡：${item.bankCardNo || '-'}`);
    },
    /**
     * 从员工列表快捷跳转至该员工的薪资记录
     * 自动切换 section 到 'salaries' 并按 employeeId 查询
     * @param {Object} item - 员工对象
     */
    viewEmployeeSalary(item) {
      // 切换到薪资管理并自动查询该员工的薪资记录
      this.section = 'salaries';
      document.querySelectorAll('.nav-item button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === 'salaries');
      });
      this.salaryEmployeeId = item.id;
      this.selectedEmployeeName = item.realName || '';
      this.salaryMonth = '';
      this.loadSalaryByEmployee(item.id);
    },
    // ======================== 部门管理 ========================

    /**
     * 加载全部部门列表（GET /department/all）
     * 加载失败时设置 departmentError 标记，模板据此显示错误提示和重试按钮
     * @returns {Promise<Array>} 部门数组
     */
    loadDepartments() {
      this.departmentError = false;
      return axios.get(`${API_BASE}/department/all`, { headers: this.authHeader() })
        .then(resp => {
          const data = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.departments = data;
          this.departmentError = false;
          console.log('[部门] 加载成功，共 ' + data.length + ' 个部门:', data.map(d => d.name).join('、'));
          return data;
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '网络请求失败';
          console.error('[部门] 加载失败:', msg, err);
          this.departments = [];
          this.departmentError = true;
          throw err;
        });
    },
    /** 显示新增部门表单 */
    showDepartmentForm() {
      this.departmentFormVisible = true;
      this.editingDepartmentId = null;
      this.departmentForm = { name: '', description: '' };
    },
    /** 取消部门表单，有修改时二次确认 */
    cancelDepartmentForm() {
      if (this.departmentFormDirty && !confirm('部门信息已修改但未保存，确定放弃吗？')) return;
      this.departmentFormVisible = false;
      this.editingDepartmentId = null;
      this.departmentFormDirty = false;
    },
    /** 编辑部门 —— 回填名称和描述到表单 */
    editDepartment(item) {
      this.editingDepartmentId = item.id;
      this.departmentForm = {
        name: item.name,
        description: item.description || ''
      };
      this.departmentFormVisible = true;
    },
    /**
     * 提交部门表单（新增或编辑）
     * 仅校验名称非空，描述可选
     */
    submitDepartmentForm() {
      if (!this.departmentForm.name.trim()) {
        alert('部门名称不能为空');
        return;
      }
      const payload = {
        name: this.departmentForm.name.trim(),
        description: this.departmentForm.description.trim() || undefined
      };
      if (this.editingDepartmentId) {
        axios.put(`${API_BASE}/department/${this.editingDepartmentId}`, payload, { headers: this.authHeader() })
          .then(() => {
            alert('部门更新成功');
            this.cancelDepartmentForm();
            this.loadDepartments();
          })
          .catch(err => {
            const msg = err.response?.data?.message || err.message || '更新部门失败';
            alert(msg);
          });
      } else {
        axios.post(`${API_BASE}/department`, payload, { headers: this.authHeader() })
          .then(() => {
            alert('部门创建成功');
            this.cancelDepartmentForm();
            this.loadDepartments();
          })
          .catch(err => {
            const msg = err.response?.data?.message || err.message || '创建部门失败';
            alert(msg);
          });
      }
    },
    /**
     * 删除单个部门
     * 提示用户：已分配到此部门的员工不会自动更新
     * @param {Object} item - 部门对象
     */
    deleteDepartment(item) {
      if (!confirm(`确认删除部门「${item.name}」？\n注意：已分配到此部门的员工不会自动更新。`)) return;
      axios.delete(`${API_BASE}/department/${item.id}`, { headers: this.authHeader() })
        .then(() => {
          alert('部门已删除');
          this.loadDepartments();
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '删除部门失败';
          alert(msg);
        });
    },
    // ======================== 薪资管理 ========================

    /**
     * 按员工 ID 加载该员工的全部薪资记录
     * @param {number|string} employeeId - 员工 ID
     */
    loadSalaryByEmployee(employeeId) {
      axios.get(`${API_BASE}/salary/employee/${employeeId}`, { headers: this.authHeader() })
        .then(resp => {
          this.salaryRecords = Array.isArray(resp.data?.data) ? resp.data.data : [];
          const employee = this.employees.find(emp => emp.id === Number(employeeId));
          this.selectedEmployeeName = employee?.realName || '';
        })
        .catch(() => {
          this.salaryRecords = [];
        });
    },
    /** 按薪资月份（YYYY-MM）加载薪资记录 */
    loadSalaryByMonth(yearMonth) {
      axios.get(`${API_BASE}/salary/month/${yearMonth}`, { headers: this.authHeader() })
        .then(resp => {
          this.salaryRecords = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.selectedEmployeeName = '';
        })
        .catch(() => {
          this.salaryRecords = [];
        });
    },
    /** 根据当前查询条件（员工/月份）加载薪资，无条件时加载全部 */
    loadSalaryQuery() {
      if (this.salaryEmployeeId) {
        this.loadSalaryByEmployee(this.salaryEmployeeId);
      } else if (this.salaryMonth) {
        this.loadSalaryByMonth(this.salaryMonth);
      } else {
        this.loadSalaryAll();
      }
    },
    /** 加载全部薪资记录 */
    loadSalaryAll() {
      axios.get(`${API_BASE}/salary/all`, { headers: this.authHeader() })
        .then(resp => {
          this.salaryRecords = Array.isArray(resp.data?.data) ? resp.data.data : [];
          this.selectedEmployeeName = '';
        })
        .catch(() => {
          this.salaryRecords = [];
        });
    },
    /**
     * 显示薪资表单（新增或编辑）
     * 编辑模式：回填已有记录数据；新增模式：重置为空表单
     * @param {Object|null} record - 薪资记录对象（编辑时传入）
     */
    showSalaryForm(record = null) {
      this.salaryFormErrors = {};
      this.salarySubmitLoading = false;
      if (record) {
        this.editingSalaryId = record.id;
        this.salaryForm = {
          employeeId: record.employeeId,
          yearMonth: record.yearMonth,
          baseSalary: Number(record.baseSalary) || null,
          performanceBonus: Number(record.performanceBonus) || null,
          allowance: Number(record.allowance) || null,
          deduction: Number(record.deduction) || null,
          socialSecurity: Number(record.socialSecurity) || null,
          tax: Number(record.tax) || null,
          actualSalary: Number(record.actualSalary) || null,
          paymentDate: record.paymentDate ? record.paymentDate.split('T')[0] : '',
          status: record.status || 'PENDING',
          remark: record.remark || ''
        };
      } else {
        this.editingSalaryId = null;
        this.salaryForm = {
          employeeId: null,
          yearMonth: '',
          baseSalary: null,
          performanceBonus: null,
          allowance: null,
          deduction: null,
          socialSecurity: null,
          tax: null,
          actualSalary: null,
          paymentDate: '',
          status: 'PENDING',
          remark: ''
        };
      }
      this.salaryFormDirty = false;
      this.salaryFormActualHighlight = false;
      this.salaryFormVisible = true;
      this.$nextTick(() => {
        const formEl = document.querySelector('.employee-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    /** 取消薪资表单，有修改时二次确认 */
    cancelSalaryForm() {
      if (this.salaryFormDirty && !confirm('薪资构成已修改但未保存，确定放弃修改吗？')) return;
      this.salaryFormVisible = false;
      this.editingSalaryId = null;
      this.salaryFormErrors = {};
      this.salarySubmitLoading = false;
      this.salaryFormDirty = false;
      this.salaryFormActualHighlight = false;
    },
    /**
     * 自动计算实发薪资（触发表单修改标记和高亮动画）
     * 公式：实发 = 基本工资 + 绩效 + 津贴 - 扣款 - 社保 - 个税
     * 计算结果保留 2 位小数，高亮动画持续 1200ms
     */
    calcSalaryFormActual() {
      const f = this.salaryForm;
      const base = Number(f.baseSalary) || 0;
      const perf = Number(f.performanceBonus) || 0;
      const allow = Number(f.allowance) || 0;
      const ded = Number(f.deduction) || 0;
      const ss = Number(f.socialSecurity) || 0;
      const tax = Number(f.tax) || 0;
      f.actualSalary = (base + perf + allow - ded - ss - tax).toFixed(2);
      this.salaryFormDirty = true;
      this.salaryFormActualHighlight = true;
      clearTimeout(this._highlightTimer);
      this._highlightTimer = setTimeout(() => { this.salaryFormActualHighlight = false; }, 1200);
    },
    /**
     * 薪资表单前端校验
     * 验证项：员工ID（非空）、月份（YYYY-MM 格式）、基本工资（非负）
     * @returns {boolean} 校验是否通过
     */
    validateSalaryForm() {
      const f = this.salaryForm;
      const errors = {};
      if (!f.employeeId) errors.employeeId = '员工ID不能为空';
      if (!f.yearMonth || !f.yearMonth.trim()) {
        errors.yearMonth = '薪资月份不能为空';
      } else if (!/^\d{4}-\d{2}$/.test(f.yearMonth.trim())) {
        errors.yearMonth = '格式错误，请使用 YYYY-MM 格式';
      }
      if (f.baseSalary == null || f.baseSalary === '' || Number(f.baseSalary) < 0) {
        errors.baseSalary = '基本工资不能为空且不能为负';
      }
      this.salaryFormErrors = errors;
      return Object.keys(errors).length === 0;
    },
    /**
     * 提交薪资表单（新增或编辑）
     * 新增：POST /salary；编辑：PUT /salary/:id
     * 成功后自动刷新全量薪资列表
     */
    submitSalaryForm() {
      if (!this.validateSalaryForm()) {
        this.$nextTick(() => {
          const firstError = document.querySelector('.employee-form:last-of-type .field-error');
          if (firstError) firstError.closest('.form-field')?.querySelector('input,select')?.focus();
        });
        return;
      }
      const payload = {
        employeeId: this.salaryForm.employeeId,
        yearMonth: this.salaryForm.yearMonth,
        baseSalary: Number(this.salaryForm.baseSalary),
        performanceBonus: Number(this.salaryForm.performanceBonus) || 0,
        allowance: Number(this.salaryForm.allowance) || 0,
        deduction: Number(this.salaryForm.deduction) || 0,
        socialSecurity: Number(this.salaryForm.socialSecurity) || 0,
        tax: Number(this.salaryForm.tax) || 0,
        actualSalary: Number(this.salaryForm.actualSalary) || 0,
        paymentDate: this.salaryForm.paymentDate || undefined,
        status: this.salaryForm.status,
        remark: this.salaryForm.remark || undefined
      };

      this.salarySubmitLoading = true;

      const request = this.editingSalaryId
        ? axios.put(`${API_BASE}/salary/${this.editingSalaryId}`, payload, { headers: this.authHeader() })
        : axios.post(`${API_BASE}/salary`, payload, { headers: this.authHeader() });

      const successMsg = this.editingSalaryId ? '薪资记录已更新' : '薪资记录已创建';
      const errorMsg = this.editingSalaryId ? '更新薪资失败' : '创建薪资失败';

      request
        .then(() => {
          alert(successMsg);
          this.salaryFormDirty = false;
          this.cancelSalaryForm();
          this.loadSalaryAll();
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || errorMsg;
          alert(msg);
        })
        .finally(() => {
          this.salarySubmitLoading = false;
        });
    },
    /** 删除单条薪资记录 */
    deleteSalaryRecord(record) {
      if (!confirm('确认删除该薪资记录？')) return;
      axios.delete(`${API_BASE}/salary/${record.id}`, { headers: this.authHeader() })
        .then(() => {
          alert('薪资记录已删除');
          this.loadSalaryAll();
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '删除失败';
          alert(msg);
        });
    },
    /** 按员工 ID 获取员工姓名，用于薪资列表中显示 */
    getEmployeeNameById(id) {
      if (!id) return '-';
      const emp = this.employees.find(e => e.id === Number(id));
      return emp ? emp.realName : '(ID:' + id + ')';
    },
    /** 按部门名称反查部门 ID，用于批量发放时构建员工编号 */
    getDepartmentIdByName(deptName) {
      if (!deptName) return null;
      const dept = this.departments.find(d => d.name === deptName);
      return dept ? dept.id : null;
    },
    /** 按员工 ID 获取其所属部门 ID */
    getDepartmentIdByEmployeeId(empId) {
      if (!empId) return null;
      const emp = this.employees.find(e => e.id === Number(empId));
      if (!emp) return null;
      return emp.departmentId || this.getDepartmentIdByName(emp.department) || null;
    },
    /** 清空薪资查询条件和结果 */
    clearSalaryQuery() {
      this.salaryEmployeeId = null;
      this.salaryMonth = '';
      this.salaryRecords = [];
      this.selectedEmployeeName = '';
    },
    // ======================== 商品管理 ========================

    /**
     * 切换商品状态筛选卡片
     * 点击已选中的卡片取消筛选（恢复全部），点击其他卡片切换筛选
     * 筛选后自动回到第一页
     * @param {string} type - 'listed' | 'delisted' | 'outofstock'
     */
    toggleStatusFilter(type) {
      // 再次点击已选中的卡片，取消筛选，恢复全部商品
      if (this.productStatusFilter === type) {
        this.productStatusFilter = null;
      } else {
        this.productStatusFilter = type;
      }
      this.productPage = 1;  // 筛选后回到第一页
    },
    /**
     * 加载商品列表
     * 支持分类筛选：选中分类时调用 /products/category/:id，否则调用 /products
     * 数据按更新时间降序排列（最新在前）
     */
    loadProducts() {
      // 按分类筛选：如果选了分类，调分类接口；否则调全量接口
      let url = `${API_BASE}/products`;
      if (this.productCategoryFilter) {
        url = `${API_BASE}/products/category/${this.productCategoryFilter}`;
      }
      axios.get(url, { headers: this.authHeader() })
        .then(resp => {
          const data = Array.isArray(resp.data?.data) ? resp.data.data : [];
          // 按更新时间降序排列（最新在前），无更新时间则用创建时间
          this.products = data.sort((a, b) => {
            const ta = a.updateTime || a.createTime || '';
            const tb = b.updateTime || b.createTime || '';
            return tb.localeCompare(ta);
          });
        })
        .catch(() => {
          this.products = [];
        });
    },
    /** 跳转至商品创建页面（独立 HTML） */
    goCreateProduct() {
      window.location.href = 'admin-product.html';
    },
    /**
     * 显示商品表单 —— 编辑跳转至 admin-product.html?id=xxx，新建跳转至创建页
     * 注：商品编辑/创建在独立页面 admin-product.html 中完成
     * @param {Object|null} product - 商品对象（编辑时传入）
     */
    showProductForm(product = null) {
      if (product) {
        window.location.href = `admin-product.html?id=${product.id}`;
      } else {
        this.goCreateProduct();
      }
    },
    /**
     * 提交商品表单（新增或编辑）
     * 必填项：商品名称、价格、库存数量
     */
    submitProductForm() {
      if (!this.productForm.name || this.productForm.price == null || this.productForm.stockQuantity == null) {
        alert('商品名称、价格和库存为必填项');
        return;
      }
      const payload = {
        name: this.productForm.name,
        categoryId: this.productForm.categoryId || undefined,
        categoryName: this.productForm.categoryName,
        description: this.productForm.description,
        price: Number(this.productForm.price),
        imageUrl: this.productForm.imageUrl,
        status: Number(this.productForm.status),
        stockQuantity: Number(this.productForm.stockQuantity),
        remark: this.productForm.remark || undefined
      };
      if (this.editingProductId) {
        axios.put(`${API_BASE}/products/${this.editingProductId}`, payload, { headers: this.authHeader() })
          .then(resp => {
            alert('商品更新成功');
            this.cancelProductForm();
            this.loadProducts();
          })
          .catch(err => {
            const msg = err.response?.data?.message || err.message || '更新商品失败';
            alert(msg);
          });
      } else {
        axios.post(`${API_BASE}/products`, payload, { headers: this.authHeader() })
          .then(resp => {
            alert('商品创建成功');
            this.cancelProductForm();
            this.loadProducts();
          })
          .catch(err => {
            const msg = err.response?.data?.message || err.message || '创建商品失败';
            alert(msg);
          });
      }
    },
    /**
     * 切换商品上架/下架状态
     * 调用 PUT /products/:id/status?status=nextStatus
     * @param {Object} product - 商品对象
     */
    toggleProductStatus(product) {
      const nextStatus = product.status === 1 ? 0 : 1;
      axios.put(`${API_BASE}/products/${product.id}/status`, null, {
          params: { status: nextStatus },
          headers: this.authHeader()
        })
        .then(() => {
          product.status = nextStatus;
          alert(`商品已${nextStatus === 1 ? '上架' : '下架'}`);
        })
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '切换商品状态失败';
          alert(msg);
        });
    },
    /**
     * 删除单个商品
     * 详细错误处理：区分 HTTP 403（权限不足）、业务错误码、网络错误
     * @param {Object} product - 商品对象
     */
    deleteProduct(product) {
      if (!confirm(`确认删除商品「${product.name}」？此操作不可恢复。`)) return;
      axios.delete(`${API_BASE}/products/${product.id}`, {
          headers: this.authHeader()
        })
        .then((response) => {
          const data = response.data;
          // 检查后端统一响应中的业务状态码
          if (data && typeof data.code === 'number' && data.code !== 200) {
            alert(data.message || '删除商品失败（业务错误）');
            return;
          }
          alert('商品已删除');
          this.loadProducts();
        })
        .catch(err => {
          if (err.response) {
            const status = err.response.status;
            const msg = err.response.data?.message || err.response.statusText;
            if (status === 403) {
              alert('删除失败：权限不足，请使用管理员账号登录。');
            } else {
              alert(msg || `删除商品失败（HTTP ${status}）`);
            }
          } else {
            alert('删除商品失败：' + (err.message || '网络错误'));
          }
        });
    },
    /** 上一页（商品列表） */
    prevProductPage() {
      if (this.productPage > 1) {
        this.productPage -= 1;
        this.loadProducts();
      }
    },
    /** 下一页（商品列表） */
    nextProductPage() {
      this.productPage += 1;
      this.loadProducts();
    },
    // ======================== 店铺管理：轮播图编辑 ========================
    // 轮播图数据持久化至 localStorage，支持拖拽排序、图片上传、重置

    /**
     * 从 localStorage 加载轮播图配置
     * 若无缓存或解析失败，使用 3 张默认占位轮播图
     */
    loadCarouselFromStorage() {
      try {
        const saved = localStorage.getItem('marketos_carousel');
        if (saved) { const data = JSON.parse(saved); if (Array.isArray(data) && data.length > 0) { this.carouselImages = data; this.carouselIdCounter = Math.max(...data.map(d => d.id), 3); return; } }
      } catch (e) { }
      this.carouselImages = [
        { id: 1, url: '', title: '广应科校园日常补给', bg: '#e8f5e9' },
        { id: 2, url: '', title: '学生优惠专区', bg: '#fff3e0' },
        { id: 3, url: '', title: '宿舍直送服务', bg: '#e3f2fd' }
      ];
      this.carouselIdCounter = 3;
    },
    /** 新增轮播图卡片（ID 自增），默认占位样式 */
    addCarouselSlide() {
      this.carouselIdCounter++;
      this.carouselImages.push({ id: this.carouselIdCounter, url: '', title: '新轮播图', bg: '#f5f5f5' });
      this.saveCarousel();
    },
    /** 删除指定位置的轮播图卡片（至少保留 1 张） */
    removeCarouselSlide(index) {
      if (this.carouselImages.length <= 1) return;
      if (!confirm('删除轮播图 #' + (index + 1) + '？')) return;
      this.carouselImages.splice(index, 1);
      this.saveCarousel();
    },
    /** 拖拽开始 —— 记录拖拽源索引 */
    onDragStart(e, index) {
      this.dragIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
    },
    /** 拖拽经过目标 —— 允许放置（同源不处理） */
    onDragOver(e, index) {
      if (this.dragIndex === -1 || this.dragIndex === index) return;
      e.dataTransfer.dropEffect = 'move';
    },
    /** 拖拽放置 —— 数组 splice 重排后保存 */
    onDrop(e, toIndex) {
      const fromIndex = this.dragIndex;
      if (fromIndex === -1 || fromIndex === toIndex) { this.dragIndex = -1; return; }
      const items = [...this.carouselImages];
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      this.carouselImages = items;
      this.dragIndex = -1;
      this.saveCarousel();
    },
    /** 触发文件选择对话框，用于为轮播图上传图片 */
    pickCarouselImage(index) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => this.onCarouselFileChange(e, index);
      input.click();
    },
    /**
     * 轮播图文件变更处理 —— 校验大小（<= 5MB），读取为 Base64 并保存
     * @param {Event} e - 文件 input 的 change 事件
     * @param {number} index - 轮播图卡片索引
     */
    onCarouselFileChange(e, index) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert('图片不能超过5MB'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.carouselImages[index] = { ...this.carouselImages[index], url: ev.target.result };
        this.saveCarousel();
      };
      reader.readAsDataURL(file);
    },
    /** 移除轮播图中的图片（保留卡片结构，仅清空 url） */
    removeCarouselImage(index) {
      this.carouselImages[index] = { ...this.carouselImages[index], url: '' };
      this.saveCarousel();
    },
    /**
     * 保存轮播图配置至 localStorage
     * 显示「已保存」提示，1500ms 后自动消失
     */
    saveCarousel() {
      localStorage.setItem('marketos_carousel', JSON.stringify(this.carouselImages));
      this.carouselSavedMsg = '已保存';
      clearTimeout(this._csMsgTimer);
      this._csMsgTimer = setTimeout(() => { this.carouselSavedMsg = ''; }, 1500);
    },
    /** 重置轮播图为默认 3 张占位卡片 */
    resetCarousel() {
      if (!confirm('确认恢复默认3张轮播图？')) return;
      localStorage.removeItem('marketos_carousel');
      this.carouselImages = [
        { id: 1, url: '', title: '广应科校园日常补给', bg: '#e8f5e9' },
        { id: 2, url: '', title: '学生优惠专区', bg: '#fff3e0' },
        { id: 3, url: '', title: '宿舍直送服务', bg: '#e3f2fd' }
      ];
      this.carouselIdCounter = 3;
      this.saveCarousel();
    },
  },

  /**
   * ====================================================================
   * mounted() —— 应用初始化生命周期
   * ====================================================================
   * 挂载阶段按以下顺序执行：
   *   1. 管理员身份校验（JWT 解析 + 角色判断）
   *   2. 加载品牌 Logo
   *   3. 触发当前模块的数据加载（switchSection）
   *   4. 绑定顶级导航按钮点击事件
   *   5. 注册 bfcache & cross-tab 同步监听器
   * ====================================================================
   */
  mounted() {
    // ======================== 管理员身份校验 ========================
    // 三重判断：token 存在 → JWT payload.sub === localStorage username → 用户角色含 "admin"
    // 任一环节不通过即重定向

    // 校验管理员身份：解码 JWT 确认 token 与用户数据一致，且确实为管理员
    const storedUser = localStorage.getItem('marketos_user');
    if (this.token && storedUser) {
      try {
        const u = JSON.parse(storedUser);
        // JWT 身份一致性校验：解码 payload，确保 sub 字段与本地 username 匹配
        // 防止 token 伪造或不同用户 token 混用
        try {
          const payload = JSON.parse(atob(this.token.split('.')[1]));
          if (payload.sub && u.username && payload.sub !== u.username) {
            // token 所有者与本地用户不匹配，强制清除 token 并重新登录
            localStorage.removeItem('marketos_token');
            localStorage.removeItem('marketos_user');
            window.location.href = 'login.html';
            return;
          }
        } catch (e) { /* 忽略 JWT 解析错误 */ }
        // 管理员角色判定：支持 isAdmin 布尔字段、role 字符串、roles 数组三种格式
        const isAdmin = u.isAdmin === true
          || String(u.role || '').toLowerCase().includes('admin')
          || (Array.isArray(u.roles) && u.roles.some(r => String(r).toLowerCase().includes('admin')));
        if (!isAdmin) {
          // 非管理员账号跳转至用户首页
          window.location.href = 'index.html';
          return;
        }
      } catch { window.location.href = 'index.html'; return; }
    } else if (!this.token) {
      // 无 token，跳转至登录页
      window.location.href = 'login.html';
      return;
    }

    // ======================== 加载品牌 Logo ========================
    this.loadLogo();
    // ======================== 触发初始模块数据加载 ========================
    // 先将 section 置 null 再切换，避免 switchSection 中的「已激活菜单仅切换展开/收起」逻辑
    // 导致初次加载时跳过了数据请求
    const target = this.section;
    this.section = null;
    this.switchSection(target);

    // ======================== 绑定导航按钮事件 ========================
    // 只监听顶级导航按钮，不包含子菜单按钮（子菜单在模板中通过 @click 绑定）
    document.querySelectorAll('.nav-list > .nav-item > button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.section) this.switchSection(btn.dataset.section);
      });
    });

    // ======================== bfcache 兼容处理 ========================
    // 浏览器后退/前进时可能命中 bfcache（Back-Forward Cache），
    // 此时页面从缓存恢复不会重新执行 mounted，需要监听 pageshow 同步 token 状态
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        this.token = localStorage.getItem('marketos_token') || '';
        this.loadLogo();
      }
    });

    // ======================== 跨标签页同步 ========================
    // 当用户在另一个标签页登录/登出时，storage 事件会触发，
    // 若 token 被清除，本标签页自动登出
    window.addEventListener('storage', (e) => {
      if (e.key === 'marketos_token' && !e.newValue) {
        // 其他标签页清除了 token（登出），同步登出
        window.location.href = 'login.html';
      }
    });
  }
}).mount('body');
