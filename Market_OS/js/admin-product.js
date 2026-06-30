/**
 * admin-product.js — 商品添加/编辑页面模块
 * ============================================================================
 * 功能概述：
 *   1. 多图片上传管理：支持拖拽排序、预览、删除，最多上传 5 张图片
 *   2. 分类下拉加载：从后端获取商品分类列表并填充到下拉框
 *   3. 编辑模式：通过 URL 参数 productId 判断是新增还是编辑，加载已有商品数据
 *   4. 表单提交：校验必填项后，调用 API 创建或更新商品
 *
 * 依赖：
 *   - axios（CDN 引入，用于图片上传）
 *   - 后端 API 服务（默认 http://localhost:9000/api）
 *   - localStorage 中的 JWT Token（marketos_token）
 *
 * 全局变量说明：
 *   - imageUrls[]     当前所有图片的 URL（服务器地址或本地 blob URL）
 *   - formDirty        表单是否被修改过（用于离开页面确认）
 *   - currentCategoryId 当前编辑商品的分类 ID（编辑模式下使用）
 * ============================================================================
 */

const API_BASE = 'http://localhost:9000/api';
const MAX_IMAGES = 5;
// 图片服务器地址：与 API 服务器相同，后端负责上传和静态资源服务
const IMAGE_SERVER = (() => {
  try {
    const url = new URL(API_BASE);
    return url.origin;  // 例如 http://localhost:9000
  } catch {
    return 'http://localhost:9000';
  }
})();

// 从 URL 查询参数中读取商品 ID（如 admin-product.html?id=3）
// 有 ID 则为编辑模式，无 ID 则为新增模式
const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

// ============================================================================
// DOM 元素绑定
// ============================================================================
const pageTitle = document.getElementById('pageTitle');
const nameInput = document.getElementById('name');
const categoryIdSelect = document.getElementById('categoryId');
const priceInput = document.getElementById('price');
const stockInput = document.getElementById('stockQuantity');
const imageUrlInput = document.getElementById('imageUrl');
const imageGrid = document.getElementById('imageGrid');
const imageCount = document.getElementById('imageCount');
const imageFileInput = document.getElementById('imageFile');
const uploadBtn = document.getElementById('uploadBtn');
const descriptionInput = document.getElementById('description');
const statusInput = document.getElementById('status');
const remarkInput = document.getElementById('remark');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');

// 表单脏标记：用于离开页面时的未保存确认
let formDirty = false;
// 监听所有表单输入变化，一旦用户修改任何字段即标记为脏
document.querySelectorAll('input, select, textarea').forEach(el => {
  el.addEventListener('input', () => { formDirty = true; });
  el.addEventListener('change', () => { formDirty = true; });
});

// JWT 认证头：从 localStorage 读取 token，所有需要认证的 API 请求共用此 headers
const token = localStorage.getItem('marketos_token');
const headers = token ? { Authorization: `Bearer ${token}` } : {};
// 当前编辑商品的分类 ID，编辑模式下由 loadProduct 赋值
let currentCategoryId = null;

// ============================================================================
// 多图片管理
// ============================================================================
// imageUrls 数组：当前所有图片的 URL（服务器地址或本地 blob URL）
let imageUrls = [];

/**
 * 规范化图片 URL：将相对路径转换为完整的服务器地址
 * - 已经是 http/https/blob/data 协议的地址直接返回
 * - 相对路径则拼接到 IMAGE_SERVER 前缀上
 * @param {string} url - 原始图片 URL（可能是相对路径或绝对路径）
 * @returns {string} 规范化后的完整图片 URL
 */
function normalizeImageUrl(url) {
  if (!url) return '';
  // 已经是完整的绝对 URL（http/https/blob/data），直接返回
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  // 去掉可能的重复斜杠（防止路径中出现 //image.jpg 这样的情况）
  const cleanUrl = url.replace(/^\/+/, '');
  // 拼接图片服务器地址
  return IMAGE_SERVER + '/' + cleanUrl;
}

// 渲染所有图片预览卡片

/**
 * 打开图片预览模态框
 * @param {string} url  - 要预览的图片 URL
 * @param {number} index - 当前图片在 imageUrls 数组中的索引（从 0 开始）
 */
function openPreview(url, index) {
  const previewModal = document.getElementById('previewModal');
  const previewImage = document.getElementById('previewImage');
  const previewCaption = document.getElementById('previewCaption');
  previewImage.src = normalizeImageUrl(url);
  previewCaption.textContent = `第 ${index + 1} 张，共 ${imageUrls.length} 张`;
  previewModal.classList.add('active');
  previewModal.setAttribute('aria-hidden', 'false');
}

/**
 * 关闭图片预览模态框，并清空图片 src 以释放内存
 */
function closePreview() {
  const previewModal = document.getElementById('previewModal');
  const previewImage = document.getElementById('previewImage');
  previewModal.classList.remove('active');
  previewModal.setAttribute('aria-hidden', 'true');
  // 清空 src 可避免大图继续占用浏览器内存
  previewImage.src = '';
}

/**
 * 交换两张图片的位置（左移或右移），并重新渲染网格
 * @param {number} index     - 当前图片索引
 * @param {string} direction - 移动方向，'left' 表示左移，'right' 表示右移
 */
function moveImage(index, direction) {
  const target = direction === 'left' ? index - 1 : index + 1;
  if (target < 0 || target >= imageUrls.length) return;
  [imageUrls[index], imageUrls[target]] = [imageUrls[target], imageUrls[index]];
  renderImageGrid();
}

// 记录拖拽排序时的源索引，-1 表示未在拖拽中
let dragSrcIndex = -1;

/**
 * 渲染图片卡片网格
 * 根据 imageUrls 数组动态生成每个图片卡片，包括：
 *   - 缩略图预览（点击可放大）
 *   - 左移/右移排序按钮
 *   - 删除按钮（会释放 blob URL）
 *   - 拖拽排序支持（HTML5 Drag & Drop API）
 * 同时更新图片计数文本和隐藏域的值
 */
function renderImageGrid() {
  imageGrid.innerHTML = '';
  imageUrls.forEach((url, index) => {
    const total = imageUrls.length;
    const card = document.createElement('div');
    card.className = 'image-card';
    card.draggable = true;
    card.dataset.index = index;
    card.innerHTML = `
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="img-index">${index + 1}/${total}</span>
      <button class="btn-remove" title="删除此图片">✕</button>
      <img class="img-preview" src="${normalizeImageUrl(url)}" alt="图片${index + 1}" title="点击放大"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22><rect fill=%22%23f0f0f0%22 width=%22140%22 height=%22140%22 rx=%2210%22/><text x=%2270%22 y=%2270%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2213%22>图片加载失败</text></svg>'; this.style.objectFit='contain';" />
      <div class="card-actions">
        <button class="btn-move left-btn" ${index === 0 ? 'disabled' : ''}>‹</button>
        <button class="btn-move right-btn" ${index === total - 1 ? 'disabled' : ''}>›</button>
      </div>`;

    // 点击预览
    card.querySelector('.img-preview').addEventListener('click', () => openPreview(url, index));

    // 移动按钮
    card.querySelector('.left-btn').addEventListener('click', e => {
      e.stopPropagation();
      moveImage(index, 'left');
    });
    card.querySelector('.right-btn').addEventListener('click', e => {
      e.stopPropagation();
      moveImage(index, 'right');
    });

    // 删除按钮
    card.querySelector('.btn-remove').addEventListener('click', e => {
      e.stopPropagation();
      if (imageUrls[index] && imageUrls[index].startsWith('blob:')) URL.revokeObjectURL(imageUrls[index]);
      imageUrls.splice(index, 1);
      renderImageGrid();
    });

    // 拖拽排序
    card.addEventListener('dragstart', e => {
      dragSrcIndex = index;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.image-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      dragSrcIndex = -1;
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragSrcIndex !== -1 && dragSrcIndex !== index) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (dragSrcIndex === -1 || dragSrcIndex === index) return;
      const [moved] = imageUrls.splice(dragSrcIndex, 1);
      imageUrls.splice(index, 0, moved);
      dragSrcIndex = -1;
      renderImageGrid();
    });

    imageGrid.appendChild(card);
  });
  imageCount.textContent = `${imageUrls.length}/${MAX_IMAGES} 张`;
  updateHiddenInput();
}

/**
 * 同步 imageUrls → 隐藏的 imageUrl input
 * 仅将非 blob 的 URL（即已上传到服务器的地址）写入隐藏字段，
 * 本地 blob URL 不会随表单提交
 */
function updateHiddenInput() {
  imageUrlInput.value = imageUrls.filter(u => !u.startsWith('blob:')).join(',');
}

/**
 * 从逗号分隔的 URL 字符串加载图片列表到 imageUrls 数组
 * 用于编辑模式下将数据库中存储的图片 URL 字符串还原为数组
 * @param {string} urlStr - 逗号分隔的图片 URL 字符串（如 "a.jpg,b.jpg"）
 */
function loadImageUrls(urlStr) {
  if (!urlStr) { imageUrls = []; return; }
  // 按逗号分割，去除空白，过滤空字符串
  imageUrls = urlStr.split(',').map(u => u.trim()).filter(Boolean);
}

// ============================================================================
// 图片上传
// ============================================================================

/**
 * 批量上传图片文件到服务器
 * 流程：
 *   1. 前端校验文件类型和大小
 *   2. 先插入本地 blob URL 实现即时预览
 *   3. FormData 上传到后端 /products/upload
 *   4. 上传成功后用服务器返回的 URL 替换本地 blob URL，释放 blob 内存
 *   5. 上传失败则保留本地预览，方便用户排查
 * @param {File[]} files - 从 <input type="file"> 中获取的文件数组
 * @returns {Promise<void>}
 */
async function uploadFiles(files) {
  let uploaded = 0;
  for (const file of files) {
    if (imageUrls.length >= MAX_IMAGES) {
      alert(`最多只能上传 ${MAX_IMAGES} 张图片`);
      break;
    }

    // --- 前端校验：文件类型和大小 ---
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert(`"${file.name}" 格式不支持，仅支持 jpg/png/gif`);
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(`"${file.name}" 超过 5MB 限制`);
      continue;
    }

    // --- 先插入本地预览（blob URL），实现即时反馈 ---
    const localUrl = URL.createObjectURL(file);
    imageUrls.push(localUrl);
    renderImageGrid();

    // --- 上传到服务器 ---
    const formData = new FormData();
    formData.append('file', file);
    // 上传期间禁用按钮，防止重复提交
    uploadBtn.disabled = true;

    try {
      const resp = await axios.post(`${API_BASE}/products/upload`, formData, {
        headers
      });
      const serverUrl = resp.data?.data?.url || '';
      if (serverUrl) {
        // 替换本地 blob URL → 服务器 URL
        const idx = imageUrls.indexOf(localUrl);
        if (idx !== -1) {
          URL.revokeObjectURL(localUrl);
          imageUrls[idx] = serverUrl;
        }
        uploaded++;
      } else {
        alert('上传成功但未获取到 URL，请检查接口返回。');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || '上传失败';
      alert(`"${file.name}" 上传失败：${msg}`);
      // 保留本地预览
    } finally {
      renderImageGrid();
      uploadBtn.disabled = false;
    }
  }
  if (uploaded > 0) {
    imageFileInput.value = '';
  }
}

// ============================================================================
// 分类加载
// ============================================================================

/**
 * 从后端加载商品分类列表，填充到分类下拉框中
 * 如果 currentCategoryId 已设置（编辑模式），加载完成后自动选中对应分类
 * @returns {Promise<void>}
 */
function loadCategories() {
  return axios.get(`${API_BASE}/categories`)
    .then(resp => {
      const categories = Array.isArray(resp.data?.data) ? resp.data.data : [];
      categoryIdSelect.innerHTML = '<option value="">请选择分类</option>';
      categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categoryIdSelect.appendChild(option);
      });
      if (currentCategoryId) {
        categoryIdSelect.value = currentCategoryId;
      }
    })
    .catch(err => {
      console.warn('加载分类失败', err);
      categoryIdSelect.innerHTML = '<option value="">加载分类失败，请刷新</option>';
    });
}

// ============================================================================
// 编辑时加载产品数据
// ============================================================================

/**
 * 加载单个商品的完整信息（仅编辑模式下调用）
 * 同时请求商品接口和库存接口（Promise.all），用已有数据预填表单
 * 库存接口可能尚未创建记录，因此捕获异常返回 null，不影响主流程
 * @returns {void}
 */
function loadProduct() {
  if (!productId) return;
  pageTitle.textContent = '编辑商品';

  const productReq = axios.get(`${API_BASE}/products/${productId}`, { headers });
  // stockReq 可能失败（如库存记录尚未创建），不影响主流程
  const stockReq = axios.get(`${API_BASE}/stocks/product/${productId}`, { headers })
    .then(r => r).catch(() => null);

  Promise.all([productReq, stockReq])
    .then(([productResp, stockResp]) => {
      const item = productResp.data?.data || productResp.data;
      if (!item) return;
      nameInput.value = item.name || '';
      currentCategoryId = item.categoryId || item.category_id || '';
      // 确保分类已加载后设置值
      if (categoryIdSelect.options.length > 1) {
        categoryIdSelect.value = currentCategoryId;
      }
      priceInput.value = item.price ?? '';
      // 产品接口的 stockQuantity 优先，其次从库存接口获取
      const stockQty = item.stockQuantity ?? item.stock ?? stockResp?.data?.data?.quantity;
      stockInput.value = stockQty != null ? stockQty : '';
      // 加载图片列表（支持逗号分隔的多图）
      loadImageUrls(item.imageUrl || item.image_url || '');
      renderImageGrid();
      descriptionInput.value = item.description || item.desc || '';
      statusInput.value = item.status != null ? item.status : 1;
      remarkInput.value = item.remark || '';
    })
    .catch(err => {
      console.warn('加载商品失败', err);
    });
}

// ============================================================================
// 提交
// ============================================================================

/**
 * 返回商品管理页面
 * 如果表单已被修改（formDirty 为 true），弹出确认对话框防止误操作丢失数据
 */
function goBack() {
  if (formDirty && !confirm('商品信息已修改但未保存，确定放弃吗？')) return;
  window.location.href = 'admin.html#products';
}

/**
 * 处理表单提交：校验 + 创建/更新商品
 * - 过滤掉本地 blob URL（仅提交已上传到服务器的图片地址）
 * - productId 存在时发送 PUT 更新请求，否则 POST 创建请求
 * - 提交成功后清除 formDirty 标记并跳转回列表页
 */
function handleSubmit() {
  const selectedCategoryId = categoryIdSelect.value;
  if (!selectedCategoryId) {
    alert('请选择商品分类');
    return;
  }
  // 过滤掉本地 blob URL（未上传成功的）
  const serverUrls = imageUrls.filter(u => !u.startsWith('blob:'));
  const payload = {
    name: nameInput.value.trim(),
    categoryId: Number(selectedCategoryId),
    categoryName: categoryIdSelect.options[categoryIdSelect.selectedIndex]?.text || '',
    description: descriptionInput.value.trim(),
    price: Number(priceInput.value),
    imageUrl: serverUrls.join(',') || undefined,
    status: Number(statusInput.value),
    stockQuantity: Number(stockInput.value),
    remark: remarkInput.value.trim() || undefined
  };
  if (!payload.name || payload.price == null || Number.isNaN(payload.price) || payload.stockQuantity == null || Number.isNaN(payload.stockQuantity)) {
    alert('商品名称、价格和库存为必填项');
    return;
  }
  const request = productId
    ? axios.put(`${API_BASE}/products/${productId}`, payload, { headers })
    : axios.post(`${API_BASE}/products`, payload, { headers });
  request.then(() => {
    formDirty = false;
    alert(productId ? '商品更新成功' : '商品创建成功');
    goBack();
  }).catch(err => {
    const msg = err.response?.data?.message || err.message || (productId ? '更新商品失败' : '创建商品失败');
    alert(msg);
  });
}

// ============================================================================
// 事件绑定
// ============================================================================

// 上传按钮：触发隐藏的 file input 点击
uploadBtn.addEventListener('click', () => imageFileInput.click());
// 文件选择变化后立即触发批量上传
imageFileInput.addEventListener('change', () => {
  const files = Array.from(imageFileInput.files);
  if (files.length > 0) {
    uploadFiles(files);
  }
});
submitBtn.addEventListener('click', handleSubmit);
cancelBtn.addEventListener('click', goBack);

// 预览模态框：关闭按钮
const previewModal = document.getElementById('previewModal');
const previewClose = document.getElementById('previewClose');
previewClose.addEventListener('click', closePreview);
// 预览模态框：点击遮罩背景也可关闭
previewModal.addEventListener('click', event => {
  if (event.target === previewModal) closePreview();
});

// ============================================================================
// 初始化：先加载分类，再加载产品（确保分类下拉框已填充后再设置选中值）
// ============================================================================
loadCategories().then(() => loadProduct());
