/**
 * register.js - 注册页重定向模块
 * 由于本项目的登录与注册功能已合并到统一的 login.html 页面中，
 * 此脚本在 register.html 加载后自动跳转至 login.html（延迟 1.2 秒）。
 * 延迟跳转给予用户短暂的视觉过渡，避免页面闪烁。
 */

// 1.2 秒后自动跳转至统一的登录/注册页面
setTimeout(() => { window.location.href = 'login.html'; }, 1200);
