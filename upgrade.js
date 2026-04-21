/**
 * 系统升级补丁 - 连接真实后端API
 * 
 * 这个文件会覆盖 script.js 中的关键函数，
 * 使其使用真实的数据库API而不是localStorage模拟数据。
 * 
 * 必须在 api-client.js 和 script.js 之后加载！
 */

// ==================== 全局变量覆盖 ====================

// 检查API客户端是否已加载
if (typeof window.API === 'undefined') {
    console.error('❌ 错误：api-client.js 未加载！请确保在script.js之前引入api-client.js');
    alert('系统错误：API客户端未加载，请刷新页面重试');
}

// ==================== 登录状态检查 ====================

/**
 * 页面加载时检查登录状态
 */
async function checkLoginStatus() {
    // 如果未登录，跳转到登录页
    if (!window.API || !window.API.isLoggedIn()) {
        console.log('⚠️ 未登录，跳转到登录页...');
        window.location.href = '/login.html';
        return false;
    }
    
    try {
        // 验证token是否有效
        const userData = await window.API.Auth.getMe();
        
        if (userData.success && userData.data) {
            console.log('✅ 用户已登录:', userData.data.username);
            
            // 显示用户信息
            showUserInfo(userData.data);
            
            // 更新积分显示
            updateScoreDisplay(userData.data.score);
            
            return true;
        }
    } catch (error) {
        console.error('❌ Token验证失败:', error.message);
    }
    
    // token无效，清除并跳转
    window.API?.logout();
    return false;
}

/**
 * 显示用户信息到导航栏
 */
function showUserInfo(user) {
    const userInfoEl = document.getElementById('user-info');
    const usernameDisplayEl = document.getElementById('username-display');
    const logoutBtnEl = document.getElementById('logout-btn');
    
    if (userInfoEl) userInfoEl.classList.remove('hidden');
    if (logoutBtnEl) logoutBtnEl.classList.remove('hidden');
    if (usernameDisplayEl) usernameDisplayEl.textContent = user.nickname || user.username;
}

/**
 * 处理登出
 */
function handleLogout() {
    if (confirm('确定要退出登录吗？')) {
        window.API.logout();
    }
}

// 将handleLogout挂载到全局
window.handleLogout = handleLogout;

// ==================== 积分系统升级 ====================

/**
 * 覆盖原有的 addScore 函数 - 使用真实API
 */
if (typeof addScore === 'function') {
    const originalAddScore = addScore;
    
    window.addScore = async function(amount, reason = '') {
        try {
            const result = await window.API.Score.addScore(amount, reason);
            
            // 更新本地显示
            updateScoreDisplay(result.newScore);
            
            // 触发事件
            dispatchScoreChangeEvent('earn', amount);
            
            showToastMessage(`✨ +${amount}积分 ${reason}`, 'success');
            
            log(`积分增加成功: +${amount} (${reason}), 新余额: ${result.newScore}`);
            
            return result;
        } catch (error) {
            console.error('增加积分失败:', error);
            showToastMessage(`❌ 增加积分失败: ${error.message}`, 'error');
            throw error;
        }
    };
}

/**
 * 覆盖原有的 deductScore 函数 - 使用真实API
 */
if (typeof deductScore === 'function') {
    window.deductScore = async function(amount, reason = '') {
        try {
            const result = await window.API.Score.deductScore(amount, reason);
            
            if (!result.success) {
                showToastMessage(result.message, 'error');
                shakeElement(document.getElementById('request-clue-btn'));
                return false;
            }
            
            // 更新本地显示
            updateScoreDisplay(result.newScore);
            
            // 触发事件
            dispatchScoreChangeEvent('spend', amount);
            
            showToastMessage(`💰 -${amount}积分 ${reason}`, 'info');
            
            log(`积分扣除成功: -${amount} (${reason}), 新余额: ${result.newScore}`);
            
            return true;
        } catch (error) {
            console.error('扣除积分失败:', error);
            showToastMessage(`❌ 扣除积分失败: ${error.message}`, 'error');
            return false;
        }
    };
}

/**
 * 覆盖 updateScoreDisplay - 从服务器获取最新积分
 */
if (typeof updateScoreDisplay === 'function') {
    const originalUpdateScoreDisplay = updateScoreDisplay;
    
    window.updateScoreDisplay = async function(score) {
        const scoreValueEl = document.getElementById('score-value');
        
        if (score !== undefined && scoreValueEl) {
            // 直接使用传入的值
            scoreValueEl.textContent = score;
            
            // 添加动画效果
            scoreValueEl.parentElement.classList.add('score-update-animation');
            setTimeout(() => {
                scoreValueEl.parentElement.classList.remove('score-update-animation');
            }, 500);
        } else {
            // 从服务器获取最新积分
            try {
                const data = await window.API.Score.getScore();
                if (scoreValueEl) {
                    scoreValueEl.textContent = data;
                    scoreValueEl.parentElement.classList.add('score-update-animation');
                    setTimeout(() => {
                        scoreValueEl.parentElement.classList.remove('score-update-animation');
                    }, 500);
                }
            } catch (error) {
                console.error('获取积分失败:', error);
            }
        }
    };
}

// ==================== 排行榜系统升级（核心！） ====================

/**
 * 完全重写排行榜功能 - 使用真实数据库数据！
 */

if (typeof renderLeaderboard === 'function') {
    /**
     * 从服务器获取真实排行榜数据并渲染
     */
    window.fetchAndRenderLeaderboard = async function(type = 'score') {
        try {
            const leaderboardData = await window.API.Leaderboard.getLeaderboard(type, 10);
            
            log(`获取排行榜成功: type=${type}, 数据量=${leaderboardData.leaderboard.length}`);
            
            // 渲染排行榜
            renderLeaderboard(leaderboardData.leaderboard);
            
            // 更新"我的排名"
            if (leaderboardData.myRanking) {
                updateMyRankingDisplayFromServer(leaderboardData.myRanking, leaderboardData.leaderboard);
            } else {
                hideMyRanking();
            }
            
            return leaderboardData;
        } catch (error) {
            console.error('获取排行榜失败:', error);
            showToastMessage('❌ 获取排行榜数据失败', 'error');
            return null;
        }
    };
    
    /**
     * 使用真实数据更新"我的排名"显示
     */
    function updateMyRankingDisplayFromServer(myRanking, topList) {
        const myRankingDiv = document.getElementById('my-ranking');
        if (!myRankingDiv) return;
        
        // 如果用户在前10名中，隐藏"我的排名"区域（因为已经在列表中高亮了）
        const user = window.API.getCurrentUser();
        if (user && topList.some(u => u.id === user.id)) {
            myRankingDiv.classList.add('hidden');
            return;
        }
        
        // 显示排名信息
        myRankingDiv.classList.remove('hidden');
        
        // 计算距离上一名的分数差距
        let gapText = '';
        if (myRanking.rank > 1) {
            const prevRankScore = topList[topList.length - 1]?.score || 0; // 第10名的分数
            const currentScore = appState.score || 0;
            const gap = prevRankScore - currentScore;
            if (gap > 0) {
                gapText = `<div class="gap-text">距离第10名还差 <strong>${gap}</strong> 分 💪</div>`;
            }
        }
        
        myRankingDiv.innerHTML = `
            <div class="my-rank-text">👤 您的排名：第 <strong>${myRanking.rank}</strong> 名</div>
            <div>当前积分：<strong>${(appState.score || 0).toLocaleString()}</strong> 分</div>
            ${gapText}
        `;
    }
    
    function hideMyRanking() {
        const myRankingDiv = document.getElementById('my-ranking');
        if (myRankingDiv) myRankingDiv.classList.add('hidden');
    }
    
    /**
     * 重写 refreshLeaderboard 函数
     */
    if (typeof refreshLeaderboard === 'function') {
        window.refreshLeaderboard = async function() {
            log('从服务器刷新排行榜...');
            
            const refreshBtn = document.getElementById('refresh-leaderboard-btn');
            if (refreshBtn) {
                refreshBtn.classList.add('spinning');
                setTimeout(() => refreshBtn.classList.remove('spinning'), 800);
            }
            
            await window.fetchAndRenderLeaderboard('score');
            showToastMessage('✅ 排行榜已更新（实时数据）', 'success');
        };
    }
    
    /**
     * 重写 updateLeaderboard 自动更新函数
     */
    if (typeof updateLeaderboard === 'function') {
        window.updateLeaderboard = async function() {
            await window.fetchAndRenderLeaderboard('score');
            showUpdateNotification();
        };
    }
    
    /**
     * 重写初始化函数
     */
    if (typeof initLeaderboard === 'function') {
        const originalInitLeaderboard = initLeaderboard;
        
        window.initLeaderboard = async function() {
            // 先渲染一次
            await window.fetchAndRenderLeaderboard('score');
            
            // 绑定事件
            bindLeaderboardEvents();
            
            // 启动自动更新（如果启用）
            startAutoUpdate();
        };
    }
}

// ==================== 勋章系统升级 ====================

/**
 * 覆盖勋章渲染函数 - 使用真实数据
 */
if (typeof renderMedalsGallery === 'function') {
    const originalRenderMedalsGallery = renderMedalsGallery;
    
    window.renderMedalsGallery = async function() {
        try {
            const medalsData = await window.API.Medal.getAll();
            
            log(`获取勋章数据成功: 总数=${medalsData.totalCount}, 已解锁=${medalsData.unlockedCount}`);
            
            const medalsContainer = document.getElementById('medals-container');
            if (!medalsContainer) return;
            
            // 清空容器
            medalsContainer.innerHTML = '';
            
            // 渲染勋章卡片
            medalsData.medals.forEach(medal => {
                const medalCard = createMedalCard(medal);
                medalsContainer.appendChild(medalCard);
            });
            
            // 更新进度条
            updateMedalsProgress(medalsData.unlockedCount, medalsData.totalCount, medalsData.progress);
            
        } catch (error) {
            console.error('获取勋章数据失败:', error);
            showToastMessage('❌ 加载勋章数据失败', 'error');
        }
    };
    
    /**
     * 创建勋章卡片DOM元素
     */
    function createMedalCard(medal) {
        const card = document.createElement('div');
        card.className = `medal-item ${medal.unlocked ? 'unlocked' : 'locked'}`;
        card.dataset.medalId = medal.id;
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${medal.name} - ${medal.unlocked ? '已解锁' : '未解锁'}`);
        
        card.innerHTML = `
            <div class="medal-icon">${medal.icon}</div>
            <div class="medal-name">${medal.name}</div>
            ${!medal.unlocked ? '<div class="medal-lock">🔒</div>' : ''}
            <div class="medal-tooltip">
                ${medal.unlocked ? '点击查看详情' : '完成挑战解锁'}
            </div>
        `;
        
        // 点击事件
        card.addEventListener('click', () => handleMedalClick(medal));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMedalClick(medal);
            }
        });
        
        return card;
    }
    
    /**
     * 处理勋章点击
     */
    async function handleMedalClick(medal) {
        if (medal.unlocked) {
            showMedalModal(medal);
        } else {
            showToastMessage(`🔒 继续解密挑战以解锁"${medal.name}"`, 'info');
        }
    }
}

/**
 * 覆盖 unlockMedal 函数 - 调用真实API
 */
if (typeof unlockMedal === 'function') {
    window.unlockMedal = async function(medalId) {
        try {
            await window.API.Medal.unlock(medalId);
            
            showToastMessage(`🎉 恭喜解锁新勋章！`, 'success');
            
            // 刷新勋章列表
            await renderMedalsGallery();
            
        } catch (error) {
            console.error('解锁勋章失败:', error);
        }
    };
}

// ==================== 线索系统升级 ====================

/**
 * 覆盖线索购买函数 - 使用真实API
 */
if (typeof applyForClue === 'function' || typeof purchaseClue === 'function') {
    const purchaseFunc = typeof purchaseClue === 'function' ? purchaseClue : applyForClue;
    
    window.purchaseClue = async function() {
        try {
            const clueData = await window.API.Clue.purchase();
            
            showToastMessage(clueData.message || '🎉 成功获取新线索！', 'success');
            
            // 添加线索到列表
            addClueToList(clueData);
            
            // 更新积分显示
            const newScore = await window.API.Score.getScore();
            updateScoreDisplay(newScore);
            
            // 刷新勋章（可能触发"线索猎人"勋章）
            await renderMedalsGallery();
            
        } catch (error) {
            console.error('购买线索失败:', error);
            showToastMessage(error.message || '❌ 购买线索失败', 'error');
            shakeElement(document.getElementById('request-clue-btn'));
        }
    };
    
    // 绑定按钮事件
    document.addEventListener('DOMContentLoaded', () => {
        const requestBtn = document.getElementById('request-clue-btn');
        if (requestBtn) {
            requestBtn.addEventListener('click', purchaseClue);
        }
    });
}

// ==================== 答题系统升级 ====================

/**
 * 覆盖答题提交函数 - 使用真实API记录成绩
 */
if (typeof checkAnswer === 'function' || typeof submitAnswer === 'function') {
    const submitFunc = typeof submitAnswer === 'function' ? submitAnswer : checkAnswer;
    
    window.submitAnswerToServer = async function(questionId, answer) {
        try {
            const result = await window.API.Quiz.submitAnswer(questionId, answer);
            
            log(`答题结果: 正确=${result.isCorrect}, 得分=${result.scoreEarned}, 解锁勋章=${result.medalUnlocked}`);
            
            return result;
        } catch (error) {
            console.error('提交答案失败:', error);
            throw error;
        }
    };
}

// ==================== 趋势图升级 ====================

/**
 * 覆盖趋势图数据源 - 使用真实统计
 */
if (typeof initActivityChart === 'function') {
    const originalInitActivityChart = initActivityChart;
    
    window.initActivityChart = async function() {
        try {
            const statsData = await window.API.Activity.getStats();
            
            log(`获取活跃度统计成功: 数据点=${statsData.length}`);
            
            // 提取图表数据
            const labels = statsData.map(stat => {
                const date = new Date(stat.date);
                return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
            });
            
            const data = statsData.map(stat => stat.active_users); // 或 total_questions
            
            // 调用原始初始化函数（如果存在）
            if (typeof originalInitActivityChart === 'function') {
                originalInitActivityChart(labels, data);
            }
            
        } catch (error) {
            console.error('获取活跃度统计失败:', error);
            // 回退到原始数据或默认数据
            if (typeof originalInitActivityChart === 'function') {
                originalInitActivityChart();
            }
        }
    };
}

// ==================== 初始化入口升级 ====================

/**
 * 覆盖主初始化函数
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 系统启动中...（使用真实数据库）');
    
    // 1. 检查登录状态
    const isLoggedIn = await checkLoginStatus();
    if (!isLoggedIn) return; // 会自动跳转
    
    // 2. 显示日期
    updateCurrentDate();
    
    // 3. 初始化各模块（并行加载以提高性能）
    try {
        await Promise.all([
            renderMedalsGallery(),           // 勋章馆
            initActivityChart(),              // 趋势图
            initLeaderboard(),                // 排行榜（真实数据！）
            initChatSystem(),                 // 对话系统
            initCluesWall(),                  // 线索墙
            initDoubleClickEdit()             // 双击编辑
        ]);
        
        console.log('✅ 所有模块初始化完成！');
        
        // 显示欢迎消息
        setTimeout(() => {
            renderMessage('welcome', getWelcomeMessage());
        }, 500);
        
    } catch (error) {
        console.error('❌ 模块初始化失败:', error);
        showToastMessage('部分功能加载失败，请刷新页面重试', 'error');
    }
});

console.log('✅ 升级补丁已加载 | 所有数据将使用真实数据库');

// ==================== 辅助函数 ====================

function shakeElement(element) {
    if (!element) return;
    element.classList.add('shake-animation');
    setTimeout(() => element.classList.remove('shake-animation'), 500);
}
