/**
 * 登录/注册页面的JavaScript逻辑
 * 
 * 功能：
 * 1. 表单切换（登录/注册）
 * 2. 密码显示/隐藏切换
 * 3. 表单验证和提交
 * 4. JWT令牌管理
 * 5. API调用封装
 */

// ==================== 配置 ====================
const API_BASE_URL = window.location.origin; // 使用当前域名作为API基础URL

// ==================== DOM元素引用 ====================
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');

// ==================== 工具函数 ====================

/**
 * 显示错误消息
 */
function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    
    // 5秒后自动隐藏
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

/**
 * 隐藏错误消息
 */
function hideError(element) {
    element.classList.add('hidden');
    element.textContent = '';
}

/**
 * 显示成功消息
 */
function showSuccess(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

/**
 * 设置按钮加载状态
 */
function setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    
    if (isLoading) {
        btn.disabled = true;
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
    } else {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

/**
 * 切换密码可见性
 */
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = '🙈';
    } else {
        input.type = 'password';
        icon.textContent = '👁️';
    }
}

// ==================== 表单切换 ====================

/**
 * 切换登录/注册表单
 */
function switchTab(tabName) {
    console.log('🔄 切换到:', tabName); // 调试日志
    
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
            // 滚动到按钮位置
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
    
    // 切换表单显示
    if (tabName === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        hideError(loginError);
        hideError(registerError);
        
        // 更新底部提示文字
        const hintEl = document.getElementById('switch-to-register');
        if (hintEl) {
            hintEl.innerHTML = '💡 还没有账号？<a href="javascript:void(0)" onclick="switchTab(\'register\')" style="color: #FFD700; text-decoration: underline; font-weight: bold;">立即注册新账号 →</a>';
        }
    } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        hideError(loginError);
        hideError(registerError);
        
        // 更新底部提示文字
        const hintEl = document.getElementById('switch-to-register');
        if (hintEl) {
            hintEl.innerHTML = '💡 已有账号？<a href="javascript:void(0)" onclick="switchTab(\'login\')" style="color: #FFD700; text-decoration: underline; font-weight: bold;">返回登录 ←</a>';
        }
        
        // 自动聚焦到用户名输入框
        setTimeout(() => {
            const usernameInput = document.getElementById('register-username');
            if (usernameInput) usernameInput.focus();
        }, 100);
    }
}

// 将函数暴露到全局（确保HTML中的onclick能调用）
window.switchTab = switchTab;

// ==================== 登录处理 ====================

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    // 前端基本验证
    if (!username || !password) {
        showError(loginError, '请填写所有必填字段');
        return;
    }
    
    // 显示加载状态
    setButtonLoading('login-submit-btn', true);
    hideError(loginError);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 保存JWT令牌到localStorage
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            
            // 显示成功提示
            showSuccess(loginError, `✅ ${data.message} 正在跳转...`);
            
            // 延迟跳转到主页
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showError(loginError, data.message || '登录失败，请重试');
        }
    } catch (error) {
        console.error('登录错误:', error);
        showError(loginError, '网络错误，请检查服务器是否启动');
    } finally {
        setButtonLoading('login-submit-btn', false);
    }
}

// ==================== 注册处理 ====================

async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('register-username').value.trim();
    const nickname = document.getElementById('register-nickname').value.trim() || username;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const agreeCheckbox = document.querySelector('#register-form input[name="agree"]');
    
    // 验证密码一致性
    if (password !== confirmPassword) {
        showError(registerError, '两次输入的密码不一致');
        return;
    }
    
    // 验证协议同意
    if (!agreeCheckbox.checked) {
        showError(registerError, '请先阅读并同意用户协议');
        return;
    }
    
    // 显示加载状态
    setButtonLoading('register-submit-btn', true);
    hideError(registerError);
    hideSuccess(registerSuccess);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, nickname })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 显示成功提示
            showSuccess(registerSuccess, `✅ ${data.message} 即将跳转到登录...`);
            
            // 清空表单
            registerForm.reset();
            
            // 2秒后切换到登录表单
            setTimeout(() => {
                switchTab('login');
                // 自动填充用户名
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').focus();
            }, 2000);
        } else {
            showError(registerError, data.message || '注册失败，请重试');
        }
    } catch (error) {
        console.error('注册错误:', error);
        showError(registerError, '网络错误，请检查服务器是否启动');
    } finally {
        setButtonLoading('register-submit-btn', false);
    }
}

// ==================== 页面初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 检查是否已登录
    const token = localStorage.getItem('token');
    if (token) {
        // 验证token是否有效
        fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // 已登录，直接跳转到主页
                window.location.href = '/';
            }
        })
        .catch(err => {
            console.log('Token验证失败，需要重新登录');
            // 清除无效token
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        });
    }
    
    // 添加输入框焦点效果
    document.querySelectorAll('.form-group input').forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', () => {
            input.parentElement.classList.remove('focused');
        });
    });
});

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', (e) => {
    // Enter键提交当前激活的表单
    if (e.key === 'Enter' && !e.target.matches('button')) {
        const activeForm = document.querySelector('.auth-form.active');
        if (activeForm) {
            activeForm.dispatchEvent(new Event('submit'));
        }
    }
});
