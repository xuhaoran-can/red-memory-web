/**
 * API客户端 - 连接后端服务器
 * 
 * 功能：
 * 1. JWT令牌管理
 * 2. 用户认证API调用
 * 3. 游戏数据API调用（积分/勋章/线索/排行榜）
 * 4. 统一错误处理
 */

// ==================== 配置 ====================
const API_CONFIG = {
    baseURL: window.location.origin, // 使用当前域名
    timeout: 10000, // 10秒超时
    tokenKey: 'token',
    userKey: 'user'
};

// ==================== 工具函数 ====================

/**
 * 获取JWT令牌
 */
function getToken() {
    return localStorage.getItem(API_CONFIG.tokenKey);
}

/**
 * 获取当前用户信息
 */
function getCurrentUser() {
    const userStr = localStorage.getItem(API_CONFIG.userKey);
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * 设置认证信息
 */
function setAuthInfo(token, user) {
    localStorage.setItem(API_CONFIG.tokenKey, token);
    localStorage.setItem(API_CONFIG.userKey, JSON.stringify(user));
}

/**
 * 清除认证信息（登出）
 */
function clearAuthInfo() {
    localStorage.removeItem(API_CONFIG.tokenKey);
    localStorage.removeItem(API_CONFIG.userKey);
}

/**
 * 检查是否已登录
 */
function isLoggedIn() {
    return !!getToken();
}

/**
 * 通用API请求函数
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.baseURL}${endpoint}`;
    const token = getToken();
    
    const config = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        },
        ...options
    };
    
    // 如果是POST/PUT/PATCH且有body，需要序列化
    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }
    
    try {
        const response = await fetch(url, config);
        
        // 处理HTTP错误状态码
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // 401 未授权 - 清除token并跳转登录页
            if (response.status === 401 || response.status === 403) {
                clearAuthInfo();
                window.location.href = '/login.html';
                throw new Error('登录已过期，请重新登录');
            }
            
            throw new Error(errorData.message || `请求失败 (${response.status})`);
        }
        
        const data = await response.json();
        
        // 检查业务逻辑错误
        if (!data.success) {
            throw new Error(data.message || '操作失败');
        }
        
        return data;
    } catch (error) {
        console.error(`API错误 [${endpoint}]:`, error);
        throw error;
    }
}

// ==================== 用户认证API ====================

const AuthAPI = {
    /**
     * 用户注册
     */
    async register(username, password, nickname) {
        return apiRequest('/api/auth/register', {
            method: 'POST',
            body: { username, password, nickname }
        });
    },
    
    /**
     * 用户登录
     */
    async login(username, password) {
        const data = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: { username, password }
        });
        
        // 保存认证信息
        if (data.success && data.data) {
            setAuthInfo(data.data.token, data.data.user);
        }
        
        return data;
    },
    
    /**
     * 获取当前用户信息
     */
    async getMe() {
        return apiRequest('/api/auth/me');
    },
    
    /**
     * 登出
     */
    logout() {
        clearAuthInfo();
        window.location.href = '/login.html';
    }
};

// ==================== 积分API ====================

const ScoreAPI = {
    /**
     * 获取积分
     */
    async getScore() {
        const data = await apiRequest('/api/user/score');
        return data.data.score;
    },
    
    /**
     * 增加积分
     */
    async addScore(amount, reason) {
        const data = await apiRequest('/api/user/score/add', {
            method: 'POST',
            body: { amount, reason }
        });
        return data.data;
    },
    
    /**
     * 扣除积分
     */
    async deductScore(amount, reason) {
        try {
            const data = await apiRequest('/api/user/score/deduct', {
                method: 'POST',
                body: { amount, reason }
            });
            return { success: true, ...data.data };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
};

// ==================== 勋章API ====================

const MedalAPI = {
    /**
     * 获取所有勋章及解锁状态
     */
    async getAll() {
        const data = await apiRequest('/api/medals');
        return data.data;
    },
    
    /**
     * 解锁勋章
     */
    async unlock(medalId) {
        return apiRequest(`/api/medals/${medalId}/unlock`, {
            method: 'POST'
        });
    }
};

// ==================== 题目/答题API ====================

const QuizAPI = {
    /**
     * 获取题目列表
     */
    async getQuestions() {
        const data = await apiRequest('/api/questions');
        return data.data;
    },
    
    /**
     * 提交答案
     */
    async submitAnswer(questionId, answer) {
        const data = await apiRequest(`/api/questions/${questionId}/answer`, {
            method: 'POST',
            body: { answer }
        });
        return data.data;
    }
};

// ==================== 线索API ====================

const ClueAPI = {
    /**
     * 获取线索列表
     */
    async getList(search = '') {
        const params = search ? `?search=${encodeURIComponent(search)}` : '';
        const data = await apiRequest(`/api/clues${params}`);
        // 注意：线索列表不需要认证，所以这里可能返回401以外的错误
        return data.data || [];
    },
    
    /**
     * 购买随机线索
     */
    async purchase() {
        const data = await apiRequest('/api/clues/purchase', {
            method: 'POST'
        });
        return data.data;
    }
};

// ==================== 排行榜API ====================

const LeaderboardAPI = {
    /**
     * 获取排行榜（真实数据！）
     * @param {string} type - 排行类型：score(总积分) | today(今日) | week(本周)
     * @param {number} limit - 返回数量限制
     */
    async getLeaderboard(type = 'score', limit = 10) {
        const params = `?type=${type}&limit=${limit}`;
        const data = await apiRequest(`/api/leaderboard${params}`);
        return data.data; // 包含 leaderboard 数组和 myRanking 对象
    }
};

// ==================== 活跃度统计API ====================

const ActivityAPI = {
    /**
     * 获取活跃度统计（用于趋势图）
     */
    async getStats() {
        const data = await apiRequest('/api/activity/stats');
        return data.data;
    }
};

// ==================== 导出供全局使用 ====================

// 将API对象挂载到window上，方便其他脚本使用
window.API = {
    Config: API_CONFIG,
    Auth: AuthAPI,
    Score: ScoreAPI,
    Medal: MedalAPI,
    Quiz: QuizAPI,
    Clue: ClueAPI,
    Leaderboard: LeaderboardAPI,
    Activity: ActivityAPI,
    // 工具函数
    getToken,
    getCurrentUser,
    setAuthInfo,
    clearAuthInfo,
    isLoggedIn,
    logout: AuthAPI.logout
};

console.log('✅ API客户端已加载 | 基础URL:', API_CONFIG.baseURL);
