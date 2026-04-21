/**
 * 红色记忆——济南英雄风云录 - 完整交互系统 v2.0
 * 
 * 功能模块：
 * 1. AI对话系统（用户输入、消息发送、智能回复）
 * 2. 多轮问答题库系统（历史知识测试）
 * 3. 积分和勋章奖励系统
 * 4. 今日解密排行榜功能模块
 * 5. 全局状态管理和积分系统
 * 6. 勋章馆UI渲染系统
 * 7. 趋势图(Chart.js)初始化
 * 8. 智能线索墙（搜索、展开/收起）
 */

// ==================== 调试模式配置 ====================
const DEBUG_MODE = false;
function log(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}
function warn(...args) {
    if (DEBUG_MODE) {
        console.warn(...args);
    }
}
function error(...args) {
    console.error(...args);
}

// ==================== AI对话系统配置 ====================
const CHAT_CONFIG = {
    MAX_MESSAGES: 50,
    AI_RESPONSE_DELAY_MIN: 500,
    AI_RESPONSE_DELAY_MAX: 1500,
    CONTEXT_HISTORY_LENGTH: 5,
    SCORE_PER_CORRECT_ANSWER: 10,
    CLUE_COST: 10
};

// ==================== 全局状态管理对象 ====================
const appState = {
    score: 50,
    initialScore: 50,
    totalEarned: 0,
    totalSpent: 0,
    medalsUnlocked: [],
    questionsAnswered: 0,
    correctAnswers: 0,
    cluesPurchased: 0,
    chatStarted: false,
    currentQuestionIndex: 0
};

const scoreHistory = [];

// ==================== 兼容旧代码的全局变量 ====================
let userScore = 50;
let currentQuestionIndex = 0;
let messageHistory = [];
let isProcessing = false;
let chatStarted = false;

// ==================== DOM元素引用 ====================
let userInputEl, sendBtnEl, messagesContainerEl, startChallengeBtnEl, scoreValueEl;

// ==================== 工具函数：XSS防护 ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 1000);
}

// ==================== 防抖函数 ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== 节流函数 ====================
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==================== 积分系统核心API ====================
function saveAppState() {
    try {
        localStorage.setItem('redMemory_AppState', JSON.stringify(appState));
        log('应用状态已保存到localStorage');
    } catch (e) {
        warn('无法保存应用状态:', e);
    }
}

function loadAppState() {
    try {
        const saved = localStorage.getItem('redMemory_AppState');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(appState, parsed);
            userScore = appState.score;
            currentQuestionIndex = appState.currentQuestionIndex;
            chatStarted = appState.chatStarted;
            log('已从localStorage加载保存的状态');
            log(`当前积分: ${appState.score}`);
            return true;
        }
    } catch (e) {
        warn('无法加载应用状态:', e);
    }
    return false;
}

function logScoreChange(type, amount, reason) {
    scoreHistory.push({
        timestamp: new Date().toISOString(),
        type,
        amount,
        reason,
        balanceAfter: appState.score
    });
    if (scoreHistory.length > 100) {
        scoreHistory.shift();
    }
    log(`积分记录: [${type.toUpperCase()}] ${amount > 0 ? '+' : ''}${amount} (${reason}) - 余额: ${appState.score}`);
}

function dispatchScoreChangeEvent(type, amount) {
    const event = new CustomEvent('scoreChange', {
        detail: { type, amount, newScore: appState.score, totalEarned: appState.totalEarned, totalSpent: appState.totalSpent }
    });
    document.dispatchEvent(event);
    log(`积分变化事件已触发: ${type === 'earn' ? '增加' : '减少'} ${amount}`);
}

function addScore(amount, reason = '') {
    if (typeof amount !== 'number' || isNaN(amount)) {
        error('addScore参数错误: amount必须是数字');
        return false;
    }
    if (amount <= 0) {
        warn('addScore警告: amount应为正数');
        return false;
    }
    const newScore = Math.min(appState.score + amount, 99999);
    const actualIncrease = newScore - appState.score;
    
    appState.score = newScore;
    appState.totalEarned += actualIncrease;
    userScore = appState.score;
    
    logScoreChange('earn', actualIncrease, reason || '未指定原因');
    updateScoreDisplay();
    saveAppState();
    showToastMessage(`+${actualIncrease}积分 ${reason}`, 'success');
    dispatchScoreChangeEvent('earn', actualIncrease);
    return true;
}

function deductScore(amount, reason = '') {
    if (typeof amount !== 'number' || isNaN(amount)) {
        error('deductScore参数错误: amount必须是数字');
        return false;
    }
    if (amount <= 0) {
        warn('deductScore警告: amount应为正数');
        return false;
    }
    if (appState.score < amount) {
        showToastMessage(`积分不足！需要${amount}分，当前仅${appState.score}分`, 'error');
        dispatchScoreChangeEvent('insufficient', amount);
        return false;
    }
    
    appState.score -= amount;
    appState.totalSpent += amount;
    userScore = appState.score;
    
    logScoreChange('spend', amount, reason || '未指定原因');
    updateScoreDisplay();
    saveAppState();
    showToastMessage(`-${amount}积分 ${reason}`, 'info');
    dispatchScoreChangeEvent('spend', amount);
    return true;
}

function hasEnoughScore(amount) {
    return appState.score >= amount;
}

function updateScoreDisplay() {
    if (!scoreValueEl) {
        warn('找不到积分显示元素 #score-value');
        return;
    }
    const oldText = scoreValueEl.textContent;
    const newText = String(appState.score);
    
    if (oldText !== newText) {
        scoreValueEl.textContent = newText;
        
        const oldValue = parseInt(oldText) || 0;
        const isIncrease = appState.score > oldValue;
        
        scoreValueEl.classList.remove('score-increase', 'score-decrease');
        void scoreValueEl.offsetWidth;
        
        if (isIncrease) {
            scoreValueEl.classList.add('score-increase');
        } else {
            scoreValueEl.classList.add('score-decrease');
        }
        
        setTimeout(() => {
            scoreValueEl.classList.remove('score-increase', 'score-decrease');
        }, 500);
    }
    log(`积分显示已更新: ${appState.score}`);
}

function updateAllDisplays() {
    updateScoreDisplay();
    updateMedalsProgress();
    renderMedalsGallery();
    log('所有显示已同步更新');
}

function resetAllProgress() {
    if (confirm('确定要重置所有进度吗？\n\n这将清除以下数据：\n• 当前积分\n• 已解锁的勋章\n• 答题记录\n• 线索购买记录\n\n此操作不可撤销！')) {
        try {
            localStorage.removeItem('redMemory_AppState');
            log('应用状态已重置');
            showToastMessage('正在重置...', 'info');
            setTimeout(() => location.reload(), 500);
        } catch (e) {
            error('重置失败:', e);
            showToastMessage('重置失败，请手动清除浏览器缓存', 'error');
        }
    }
}

function getScoreStatistics() {
    return {
        currentScore: appState.score,
        initialScore: appState.initialScore,
        totalEarned: appState.totalEarned,
        totalSpent: appState.totalSpent,
        netProfit: appState.totalEarned - appState.totalSpent,
        questionsAnswered: appState.questionsAnswered,
        correctAnswers: appState.correctAnswers,
        cluesPurchased: appState.cluesPurchased,
        medalsUnlockedCount: appState.medalsUnlocked.length,
        historyLength: scoreHistory.length
    };
}

// ==================== 历史问答题库 ====================
const quizQuestions = [
    {
        id: 1,
        question: '📜 问题1：济南战役发生在哪一年？\n\nA. 1946年\nB. 1948年\nC. 1950年',
        answer: ['b', '1948', 'b.1948'],
        explanation: '✅ 回答正确！济南战役确实发生在**1948年9月16日至24日**。\n\n📖 **历史背景**：这是解放战争时期的一次重要战役，也是人民解放军第一次攻克国民党军重兵设防的大城市。',
        score: 10,
        medalId: 1
    },
    {
        id: 2,
        question: '📜 问题2：济南战役历时多少天？\n\nA. 6天\nB. 8天\nC. 10天',
        answer: ['b', '8', 'b.8'],
        explanation: '✅ 正确！济南战役从9月16日开始，到9月24日结束，共历时**8天8夜**。\n\n⚔️ 战役过程异常激烈，解放军以"攻济打援"的战略方针，最终取得胜利。',
        score: 10,
        medalId: null
    },
    {
        id: 3,
        question: '📜 问题3：指挥济南战役的解放军主要将领是谁？\n\nA. 林彪\nB. 粟裕\nC. 刘伯承',
        answer: ['b', '粟裕', 'b.粟裕'],
        explanation: '✅ 太棒了！济南战役由**华东野战军代司令员兼代政治委员粟裕**统一指挥。\n\n🎖️ 参战的还有谭震林、许世友等著名将领，他们共同谱写了这一辉煌篇章。',
        score: 10,
        medalId: 2
    },
    {
        id: 4,
        question: '📜 问题4：济南战役中牺牲的最高级别将领是谁？\n\nA. 王克勤\nB. 徐海珊\nC. 赵以政',
        answer: ['a', '王克勤', 'a.王克勤'],
        explanation: '✅ 答对了！**王克勤**是济南战役中牺牲的著名战斗英雄。\n\n🌟 他曾任排长，在攻城战斗中英勇牺牲，被追认为"模范共产党员"和"战斗英雄"。',
        score: 10,
        medalId: null
    },
    {
        id: 5,
        question: '📜 问题5：济南战役的胜利有什么重大意义？\n\nA. 解放了华北地区\nB. 揭开了战略决战的序幕\nC. 结束了抗日战争',
        answer: ['b', '揭开了战略决战的序幕', 'b.揭开了战略决战的序幕'],
        explanation: '✅ 完全正确！济南战役的胜利具有划时代的意义：\n\n🎯 **第一**：它是解放战争时期人民解放军攻克国民党重兵防守的大城市的开端\n🎯 **第二**：它揭开了**战略决战**（辽沈、淮海、平津三大战役）的序幕\n🎯 **第三**：极大鼓舞了全国人民的革命信心',
        score: 15,
        medalId: 3
    },
    {
        id: 6,
        question: '📜 问题6：济南解放后成立的第一个人民政府是什么？\n\nA. 济南特别市军事管制委员会\nB. 济南市人民政府\nC. 山东省政府',
        answer: ['a', '济南特别市军事管制委员会', 'a.济南特别市军事管制委员会'],
        explanation: '✅ 正确！1948年9月27日，**济南特别市军事管制委员会**正式成立，标志着济南进入新的历史阶段。\n\n🏛️ 郭子化任主任，开始了城市的接管和重建工作。',
        score: 10,
        medalId: null
    },
    {
        id: 7,
        question: '📜 问题7："打到济南府，活捉王耀武"这句口号中的王耀武是谁？\n\nA. 国民党山东省主席\nB. 国民党第二绥靖区司令官\nC. 国民党济南城防司令',
        answer: ['b', '国民党第二绥靖区司令官', 'b.国民党第二绥靖区司令官'],
        explanation: '✅ 知识渊博！**王耀武**时任国民党陆军第二绥靖区司令官兼山东省政府主席，是济南战役中国民党军的最高指挥官。\n\n📌 他在战役中被俘，后来经过改造，成为新中国公民。',
        score: 10,
        medalId: 4
    },
    {
        id: 8,
        question: '📜 问题8：济南战役中著名的"攻城先锋"是哪支部队？\n\nA. 华东野战军第九纵队\nB. 华东野战军第十三纵队\nC. 华东野战军第三纵队',
        answer: ['a', '华东野战军第九纵队', 'a.华东野战军第九纵队'],
        explanation: '✅ 非常准确！**华东野战军第九纵队**（后改编为第27军）被誉为"攻城先锋"。\n\n💪 该纵队在聂凤智将军指挥下，率先突破城防，为战役胜利立下赫赫战功！',
        score: 10,
        medalId: null
    }
];

// ==================== AI关键词匹配回复库 ====================
const aiReplies = {
    '1948': {
        reply: '✅ 关于1948年的济南战役...\n\n济南战役发生在**1948年9月16日至24日**，历时8天8夜，是解放战争中的重要转折点。\n\n想了解更多细节吗？可以问我关于战役的时间、将领或意义等问题。',
        score: 5,
        medalUnlock: null
    },
    '济南': {
        reply: '🏛️ **济南**是一座有着悠久历史的英雄城市！\n\n作为山东省省会，济南在革命历史上具有重要地位：\n• 1948年济南战役在此打响\n• 这是解放军首次攻克大城市\n• 揭开了战略决战的序幕\n\n你想了解济南战役的哪些方面呢？',
        score: 5,
        medalUnlock: null
    },
    '战役': {
        reply: '⚔️ **济南战役**是解放战争史上的光辉一页！\n\n📅 时间：1948年9月16-24日\n🎯 结果：解放军全胜，济南解放\n💫 意义：揭开战略决战序幕\n\n我可以为你详细介绍战役的过程、英雄人物或历史意义哦~',
        score: 5,
        medalUnlock: null
    },
    '时间': {
        reply: '🕐 **济南战役时间线**：\n\n• **开始**：1948年9月16日（中秋节前夜）\n• **总攻**：9月20日发起总攻\n• **突破**：9月23日突破内城\n• **胜利**：9月24日济南解放\n\n整个战役历时**8天8夜**，非常激烈！',
        score: 5,
        medalUnlock: null
    },
    '英雄': {
        reply: '🌟 **济南战役英雄人物**众多！\n\n著名英雄包括：\n• **王克勤** - 排长，英勇牺牲，被追授"战斗英雄"\n• **粟裕** - 华东野战军指挥员\n• **许世友** - 参与攻城作战\n• **聂凤智** - 第九纵队司令员，率部率先登城\n\n你想了解哪位英雄的故事？',
        score: 5,
        medalUnlock: null
    },
    '粟裕': {
        reply: '🎖️ **粟裕将军**（1907-1984）\n\n• **身份**：中国人民解放军大将\n• **职务**：济南战役时担任华东野战军代司令员兼代政委\n• **贡献**：制定"攻济打援"战略方针，统筹全局\n\n他是杰出的军事家，被誉为"无冕元帅"！',
        score: 5,
        medalUnlock: null
    },
    '意义': {
        reply: '🎯 **济南战役的重大意义**：\n\n1️⃣ **首次攻克大城市** - 开创了解放军攻坚战的先例\n2️⃣ **揭开决战序幕** - 为辽沈、淮海、平津战役奠定基础\n3️⃣ **鼓舞全国人心** - 证明解放军有能力战胜国民党主力\n4️⃣ **改变战争格局** - 加速了全国解放进程\n\n这是一次具有里程碑意义的伟大胜利！',
        score: 5,
        medalUnlock: null
    },
    '王耀武': {
        reply: '📌 **王耀武**（1904-1968）\n\n• **身份**：国民党陆军中将\n• **职务**：第二绥靖区司令官兼山东省主席\n• **结局**：1948年9月在济南战役中被俘\n\n他在被俘后经过学习改造，于1959年获特赦，成为新中国的公民。',
        score: 5,
        medalUnlock: null
    },
    '你好': {
        reply: '👋 你好呀！我是你的**红色导览员**！\n\n欢迎来到"红色记忆——济南英雄风云录"！\n\n在这里你可以：\n• 📚 学习济南革命历史知识\n• 🎮 参加历史知识问答挑战\n• 🏆 积累积分，解锁荣誉勋章\n\n准备好了吗？点击"开始解密挑战"按钮，或者直接向我提问吧！',
        score: 0,
        medalUnlock: null
    },
    '开始': {
        reply: '🚀 好的！让我们开始红色记忆之旅吧！\n\n我将向你提出关于**济南战役**的历史问题，答对可以获得积分和勋章哦！\n\n准备好迎接第一道题目了吗？请回答"准备好了"或"下一题"！',
        score: 0,
        medalUnlock: null
    },
    '帮助': {
        reply: '📖 **使用指南**：\n\n**基本操作**：\n• 在输入框输入内容，按**Enter**或点击"发送"按钮\n• 按**Shift+Enter**可以换行\n• 按**Escape**可关闭弹出的模态框\n\n**你可以问我**：\n• "济南战役的时间？" - 了解战役时间线\n• "有哪些英雄人物？" - 认识革命先烈\n• "战役的意义是什么？" - 学习历史价值\n• 或者直接回答我的问题获得积分！\n\n💡 提示：双击AI消息可以复制内容，双击用户消息可以编辑或删除哦！',
        score: 0,
        medalUnlock: null
    }
};

const DEFAULT_AI_REPLY = `感谢你的提问！作为红色导览员，我会尽力为你解答关于济南革命历史的问题。

你可以尝试问我：
• 📅 济南战役的时间？
• 🌟 有哪些英雄人物？
• ⚔️ 战役的过程是怎样的？
• 🎯 战役的意义是什么？
• 👤 关于某位具体的人物？

或者回复"**开始**"来参加知识问答挑战，赢取积分和勋章！💪`;

// ==================== 核心功能函数 ====================
function initDOMReferences() {
    userInputEl = document.getElementById('user-input');
    sendBtnEl = document.getElementById('send-btn');
    messagesContainerEl = document.getElementById('chat-messages');
    startChallengeBtnEl = document.getElementById('start-challenge-btn');
    scoreValueEl = document.getElementById('score-value');
    log('DOM元素引用初始化完成');
}

function showWelcomeMessage() {
    const welcomeContent = `
        <p>👋 欢迎来到<strong>红色记忆——济南英雄风云录</strong>！</p>
        <p>我是你的<strong>红色导览员</strong>，将带你探索济南的革命历史，解锁英雄故事。</p>
        <br>
        <p>📚 <strong>你可以：</strong></p>
        <ul>
            <li>向我提问关于济南战役的问题</li>
            <li>参加历史知识问答挑战</li>
            <li>积累积分，解锁荣誉勋章</li>
        </ul>
        <br>
        <p>💡 点击下方"<strong>开始解密挑战</strong>"按钮，或直接输入问题开始对话！</p>
    `;
    renderMessage('ai', welcomeContent, true);
    log('欢迎消息已显示');
}

function renderMessage(type, content, isWelcome = false) {
    if (!messagesContainerEl) {
        error('找不到消息容器元素');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message ${isWelcome ? 'welcome-message' : ''}`;
    messageDiv.setAttribute('role', 'article');
    messageDiv.setAttribute('aria-label', type === 'ai' ? 'AI消息' : '用户消息');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = type === 'ai' ? '🤖' : '👤';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (type === 'user') {
        contentDiv.textContent = content;
    } else {
        contentDiv.innerHTML = content;
    }

    if (!isWelcome) {
        const timestamp = document.createElement('div');
        timestamp.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 6px; text-align: right;';
        timestamp.textContent = formatTimestamp(new Date());
        contentDiv.appendChild(timestamp);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainerEl.appendChild(messageDiv);

    if (!isWelcome) {
        messageHistory.push({ type, content, timestamp: new Date() });
        if (messageHistory.length > CHAT_CONFIG.MAX_MESSAGES) {
            const oldestMessage = messagesContainerEl.firstChild;
            if (oldestMessage) {
                messagesContainerEl.removeChild(oldestMessage);
            }
            messageHistory.shift();
        }
    }

    scrollToBottom();
    log(`${type === 'ai' ? 'AI' : '用户'}消息已渲染`);
}

function formatTimestamp(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function scrollToBottom() {
    if (messagesContainerEl) {
        requestAnimationFrame(() => {
            messagesContainerEl.scrollTo({
                top: messagesContainerEl.scrollHeight,
                behavior: 'smooth'
            });
        });
    }
}

// ==================== 用户输入处理系统 ====================
function handleUserMessage() {
    if (isProcessing) {
        log('正在处理中，请稍候...');
        return;
    }

    const rawContent = userInputEl.value;
    const content = sanitizeInput(rawContent);

    if (!content) {
        showToastMessage('请输入内容后再发送', 'error');
        userInputEl.focus();
        return;
    }

    isProcessing = true;

    if (!chatStarted) {
        chatStarted = true;
        if (startChallengeBtnEl) {
            startChallengeBtnEl.style.display = 'none';
        }
    }

    userInputEl.value = '';
    userInputEl.style.height = 'auto';
    renderMessage('user', escapeHtml(content));
    setInputState(false);
    showLoadingState(true);

    const delay = getRandomDelay();
    log(`AI将在 ${delay}ms 后回复...`);

    setTimeout(() => {
        try {
            generateAIReply(content);
        } catch (err) {
            error('生成AI回复失败:', err);
            renderMessage('ai', '抱歉，我暂时无法回复。请稍后重试。');
        } finally {
            setInputState(true);
            showLoadingState(false);
            isProcessing = false;
            userInputEl.focus();
        }
    }, delay);
}

function setInputState(enabled) {
    if (userInputEl) userInputEl.disabled = !enabled;
    if (sendBtnEl) sendBtnEl.disabled = !enabled;
}

function showLoadingState(show) {
    if (sendBtnEl) {
        if (show) {
            sendBtnEl.innerHTML = '<span class="loading-spinner"></span> 思考中...';
            sendBtnEl.style.opacity = '0.7';
        } else {
            sendBtnEl.innerHTML = '发送 ➤';
            sendBtnEl.style.opacity = '1';
        }
    }
}

function getRandomDelay() {
    return Math.floor(
        Math.random() * (CHAT_CONFIG.AI_RESPONSE_DELAY_MAX - CHAT_CONFIG.AI_RESPONSE_DELAY_MIN + 1)
    ) + CHAT_CONFIG.AI_RESPONSE_DELAY_MIN;
}

// ==================== AI回复生成系统 ====================
function generateAIReply(userMessage) {
    log(`正在生成回复，用户消息: "${userMessage}"`);
    const processedInput = preprocessInput(userMessage);

    if (currentQuestionIndex < quizQuestions.length) {
        const currentQuestion = quizQuestions[currentQuestionIndex];
        if (checkAnswer(processedInput, currentQuestion.answer)) {
            handleCorrectAnswer(currentQuestion);
            return;
        } else {
            handleWrongAnswer(currentQuestion, processedInput);
            return;
        }
    }

    if (processedInput.includes('下一题') || processedInput.includes('准备好了') || processedInput.includes('继续')) {
        askNextQuestion();
        return;
    }

    let matchedReply = null;
    let bestMatchScore = 0;

    for (const [keyword, replyData] of Object.entries(aiReplies)) {
        if (processedInput.includes(keyword)) {
            if (replyData.score > bestMatchScore) {
                matchedReply = replyData;
                bestMatchScore = replyData.score;
            }
        }
    }

    if (matchedReply) {
        renderMessage('ai', matchedReply.reply);
        if (matchedReply.score > 0) {
            addScore(matchedReply.score);
            if (matchedReply.medalUnlock !== null && matchedReply.medalUnlock !== undefined) {
                unlockMedal(matchedReply.medalUnlock);
            }
        }
    } else {
        renderMessage('ai', DEFAULT_AI_REPLY);
    }

    log('AI回复生成完成');
}

function preprocessInput(input) {
    return input.toLowerCase().trim().replace(/[，。！？、；：""''（）【】《》]/g, '').replace(/\s+/g, '');
}

function checkAnswer(userAnswer, correctAnswers) {
    const normalizedUserAnswer = userAnswer.toLowerCase().trim();
    return correctAnswers.some(answer => normalizedUserAnswer === answer.toLowerCase().trim());
}

// ==================== 答案验证和积分奖励系统 ====================
function handleCorrectAnswer(question) {
    addScore(question.score, `(回答正确: ${question.id}号题)`);

    appState.questionsAnswered++;
    appState.correctAnswers++;

    const successMessage = question.explanation + `\n\n🎉 **恭喜你！获得 ${question.score} 分！**\n\n${currentQuestionIndex < quizQuestions.length - 1 ? '回复"下一题"继续挑战！' : '🏆 你已完成所有题目！太棒了！'}`;

    renderMessage('ai', successMessage);
    showToastMessage(`回答正确！+${question.score}分`, 'success');

    if (question.medalId !== null && question.medalId !== undefined) {
        setTimeout(() => {
            unlockMedal(question.medalId);
        }, 1000);
    }

    currentQuestionIndex = appState.currentQuestionIndex + 1;
    appState.currentQuestionIndex = currentQuestionIndex;

    log(`第 ${currentQuestionIndex} 题回答正确，总分: ${appState.score}`);
}

function handleWrongAnswer(question, userAnswer) {
    appState.questionsAnswered++;

    const wrongMessage = `😊 没关系，继续努力！\n\n❌ 你的答案不太准确。\n✅ 正确答案是：**${question.answer[0].toUpperCase()}**\n\n${question.explanation}\n\n💡 再试一次，或者回复"下一题"跳过此题。`;

    renderMessage('ai', wrongMessage);
    showToastMessage('继续加油！正确答案已显示', 'info');

    log(`回答错误，正确答案: ${question.answer[0]}`);

    currentQuestionIndex = appState.currentQuestionIndex + 1;
    appState.currentQuestionIndex = currentQuestionIndex;
}

// ==================== 多轮对话题库系统 ====================
function askNextQuestion() {
    if (currentQuestionIndex >= quizQuestions.length) {
        const stats = getScoreStatistics();
        renderMessage('ai', `🏆 **恭喜你完成了所有 ${quizQuestions.length} 道题目！**\n\n📊 **最终得分：${appState.score} 分**\n\n📈 **答题统计：**\n• 正确答案：${stats.correctAnswers} 题\n• 总答题数：${stats.questionsAnswered} 题\n• 正确率：${stats.questionsAnswered > 0 ? Math.round((stats.correctAnswers / stats.questionsAnswered) * 100) : 0}%\n\n你已经对济南战役有了深入的了解！\n如果你想复习某个知识点，可以直接向我提问哦~`);
        return;
    }

    const question = quizQuestions[currentQuestionIndex];
    const progressInfo = `\n\n---\n*第 ${currentQuestionIndex + 1}/${quizQuestions.length} 题 | 当前积分：${appState.score} 分*`;

    renderMessage('ai', question.question + progressInfo);
    log(`显示第 ${currentQuestionIndex + 1} 题`);
}

// ==================== 勋章系统（完整实现） ====================
const medalsData = [
    { id: 1, icon: '🎖️', name: '初识战役', desc: '完成第一道题目，开启红色之旅', condition: '回答正确问题1' },
    { id: 2, icon: '⭐', name: '名将风采', desc: '了解指挥官粟裕将军的事迹', condition: '回答正确问题3' },
    { id: 3, icon: '🏆', name: '战略眼光', desc: '理解济南战役的重大战略意义', condition: '回答正确问题5' },
    { id: 4, icon: '🎯', name: '历史洞察', desc: '认识国民党将领王耀武', condition: '回答正确问题7' },
    { id: 5, icon: '💡', name: '线索猎人', desc: '成功获取5条调查线索', condition: '购买5条线索' },
    { id: 6, icon: '👑', name: '全能学者', desc: '完成所有题目并保持高正确率', condition: '完成全部8道题目' }
];

function renderMedalsGallery() {
    const container = document.getElementById('medals-container');
    if (!container) return;

    container.innerHTML = '';

    medalsData.forEach((medal, index) => {
        const isUnlocked = appState.medalsUnlocked.includes(medal.id);
        const medalEl = document.createElement('div');
        medalEl.className = `medal-item ${isUnlocked ? 'unlocked' : 'locked'}`;
        medalEl.setAttribute('role', 'button');
        medalEl.setAttribute('tabindex', '0');
        medalEl.setAttribute('aria-label', `${medal.name} - ${isUnlocked ? '已解锁' : '未解锁'}`);
        medalEl.style.animationDelay = `${index * 0.1}s`;

        medalEl.innerHTML = `
            <span class="medal-icon">${medal.icon}</span>
            <span class="medal-name">${medal.name}</span>
            ${!isUnlocked ? '<span class="medal-lock">🔒</span>' : ''}
            <span class="medal-tooltip">${isUnlocked ? '点击查看详情' : '完成条件后解锁'}</span>
        `;

        medalEl.addEventListener('click', () => showMedalDetail(medal, isUnlocked));
        medalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showMedalDetail(medal, isUnlocked);
            }
        });

        container.appendChild(medalEl);
    });

    updateMedalsProgressBar();
    log('勋章馆已渲染');
}

function updateMedalsProgress() {
    log(`勋章进度: ${appState.medalsUnlocked.length}/${medalsData.length} 个已解锁`);
}

function updateMedalsProgressBar() {
    const existingBar = document.querySelector('.medals-progress-section');
    if (existingBar) existingBar.remove();

    const medalsPanel = document.getElementById('medals-gallery');
    if (!medalsPanel) return;

    const progressSection = document.createElement('div');
    progressSection.className = 'medals-progress-section';

    const unlockedCount = appState.medalsUnlocked.length;
    const totalCount = medalsData.length;
    const percentage = Math.round((unlockedCount / totalCount) * 100);

    progressSection.innerHTML = `
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <p class="progress-text">已解锁 ${unlockedCount}/${totalCount} 枚勋章 (${percentage}%)</p>
    `;

    medalsPanel.appendChild(progressSection);
}

function unlockMedal(medalId) {
    log(`尝试解锁勋章 #${medalId}`);

    if (appState.medalsUnlocked.includes(medalId)) {
        log(`勋章 #${medalId} 已解锁，跳过`);
        return;
    }

    appState.medalsUnlocked.push(medalId);
    saveAppState();

    const medal = medalsData.find(m => m.id === medalId);
    if (medal) {
        showToastMessage(`🎖️ 恭喜解锁勋章：${medal.name}！`, 'success');
    }

    renderMedalsGallery();

    const event = new CustomEvent('medalUnlocked', { detail: { medalId, totalUnlocked: appState.medalsUnlocked.length } });
    document.dispatchEvent(event);

    log(`勋章 #${medalId} 已解锁！当前共 ${appState.medalsUnlocked.length} 个勋章`);

    const medalEl = document.querySelector(`.medal-item:nth-child(${medalId})`);
    if (medalEl) {
        medalEl.classList.add('unlock-anim');
        setTimeout(() => medalEl.classList.remove('unlock-anim'), 800);
    }
}

function showMedalDetail(medal, isUnlocked) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'medal-modal-overlay';

    overlay.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" aria-label="关闭">&times;</button>
            <div class="modal-medal-icon">${isUnlocked ? medal.icon : '🔒'}</div>
            <h3 class="modal-title">${medal.name}</h3>
            <p class="modal-desc">${medal.desc}</p>
            <div class="modal-info">
                <span>解锁条件：</span>
                <span>${medal.condition}</span>
            </div>
            <div class="modal-status">${isUnlocked ? '✅ 已解锁' : '🔒 未解锁'}</div>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('show'));

    const closeBtn = overlay.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', handleModalKeydown);
}

function closeModal() {
    const overlay = document.getElementById('medal-modal-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
            document.removeEventListener('keydown', handleModalKeydown);
        }, 300);
    }
}

function handleModalKeydown(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
}

// ==================== 双击编辑功能 ====================
function initDoubleClickEdit() {
    if (!messagesContainerEl) return;

    messagesContainerEl.addEventListener('dblclick', (e) => {
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;

        if (messageDiv.classList.contains('user-message')) {
            showEditOptions(messageDiv);
        } else if (messageDiv.classList.contains('ai-message')) {
            copyMessageToClipboard(messageDiv);
        }
    });

    log('双击编辑功能已初始化');
}

function showEditOptions(messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const originalText = contentDiv.innerText;

    const editOverlay = document.createElement('div');
    editOverlay.className = 'edit-overlay';
    editOverlay.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.85); display: flex;
        align-items: center; justify-content: center; gap: 12px;
        border-radius: inherit; z-index: 10;
    `;

    const editBtn = createOverlayButton('✏️ 编辑', 'linear-gradient(135deg, #FFD700, #FFC125)', '#6B0000');
    const deleteBtn = createOverlayButton('🗑️ 删除', 'linear-gradient(135deg, #f44336, #d32f2f)', 'white');
    const cancelBtn = createOverlayButton('❌ 取消', 'rgba(255, 255, 255, 0.2)', 'white', '1px solid rgba(255, 215, 0, 0.5)');

    editOverlay.appendChild(editBtn);
    editOverlay.appendChild(deleteBtn);
    editOverlay.appendChild(cancelBtn);

    messageDiv.style.position = 'relative';
    contentDiv.appendChild(editOverlay);

    editBtn.onclick = () => { editOverlay.remove(); startInlineEdit(messageDiv, originalText); };
    deleteBtn.onclick = () => {
        if (confirm('确定要删除这条消息吗？')) {
            messageDiv.remove();
            showToastMessage('消息已删除', 'info');
        } else {
            editOverlay.remove();
        }
    };
    cancelBtn.onclick = () => editOverlay.remove();
}

function createOverlayButton(text, bg, color, border = 'none') {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `padding: 8px 18px; background: ${bg}; color: ${color};
        border: ${border}; border-radius: 20px; cursor: pointer; font-weight: 600;
        font-size: 14px; transition: all 0.3s ease;`;
    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    return btn;
}

function startInlineEdit(messageDiv, originalText) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.style.cssText = `width: 100%; min-height: 60px; padding: 10px;
        background: rgba(0, 0, 0, 0.5); border: 2px solid #FFD700;
        border-radius: 8px; color: white; font-family: 'Noto Sans SC', sans-serif;
        font-size: 16px; resize: vertical; outline: none;`;

    const timestampEl = contentDiv.querySelector('div[style*="font-size: 11px"]');
    let originalHTML = contentDiv.innerHTML;
    if (timestampEl) timestampEl.style.display = 'none';

    const textContent = contentDiv.childNodes[0];
    if (textContent) contentDiv.replaceChild(textarea, textContent);

    textarea.focus();
    textarea.select();

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '✅ 保存';
    confirmBtn.style.cssText = `padding: 6px 16px; background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white; border: none; border-radius: 15px; cursor: pointer; font-weight: 600; font-size: 13px;`;

    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.textContent = '取消';
    cancelEditBtn.style.cssText = `padding: 6px 16px; background: rgba(255, 255, 255, 0.2);
        color: white; border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px; cursor: pointer; font-weight: 600; font-size: 13px;`;

    buttonGroup.appendChild(confirmBtn);
    buttonGroup.appendChild(cancelEditBtn);
    contentDiv.appendChild(buttonGroup);

    confirmBtn.onclick = () => {
        const newText = textarea.value.trim();
        if (newText) {
            contentDiv.replaceChild(document.createTextNode(newText), textarea);
            buttonGroup.remove();
            if (timestampEl) timestampEl.style.display = 'block';
            showToastMessage('消息已更新', 'success');
        }
    };

    cancelEditBtn.onclick = () => {
        contentDiv.replaceChild(document.createTextNode(originalText), textarea);
        buttonGroup.remove();
        if (timestampEl) timestampEl.style.display = 'block';
    };
}

function copyMessageToClipboard(messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const textToCopy = contentDiv.innerText;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToastMessage('内容已复制到剪贴板', 'success');
        }).catch(() => fallbackCopyToClipboard(textToCopy));
    } else {
        fallbackCopyToClipboard(textToCopy);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        showToastMessage('内容已复制到剪贴板', 'success');
    } catch (err) {
        error('复制失败:', err);
        showToastMessage('复制失败，请手动选择文本复制', 'error');
    }

    document.body.removeChild(textArea);
}

// ==================== 事件绑定系统 ====================
function bindChatEventListeners() {
    if (sendBtnEl) {
        sendBtnEl.addEventListener('click', handleUserMessage);
        log('发送按钮事件已绑定');
    }

    if (userInputEl) {
        userInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleUserMessage();
            }
        });
        log('输入框键盘事件已绑定');
    }

    if (startChallengeBtnEl) {
        startChallengeBtnEl.addEventListener('click', () => {
            log('用户点击开始挑战按钮');
            startChallengeBtnEl.style.display = 'none';
            chatStarted = true;
            renderMessage('ai', '🎯 **好的！让我们开始济南战役知识挑战！**\n\n我将依次向你提出关于济南革命历史的问题。\n\n📝 **规则说明**：\n• 回答问题的选项字母（如 A、B、C）或具体内容均可\n• 每题答对可获得 **10-15 分**\n• 答错不扣分，会显示正确答案和解释\n• 完成特定题目可解锁荣誉勋章\n\n准备好接收第一道题目了吗？回复"**准备好了**"或"**下一题**"开始！');
            userInputEl.focus();
        });
        log('开始挑战按钮事件已绑定');
    }

    initDoubleClickEdit();
    log('所有事件监听器绑定完成');
}

// ==================== 线索申请系统 ====================
function initClueSystem() {
    const requestClueBtn = document.getElementById('request-clue-btn');
    if (requestClueBtn) {
        requestClueBtn.addEventListener('click', () => handleClueRequest(requestClueBtn));
        log(`线索申请系统已初始化（消耗${CHAT_CONFIG.CLUE_COST}积分/次）`);
    }

    initClueSearchSystem();
    renderInitialClues();
}

function handleClueRequest(buttonElement) {
    log('用户申请调查线索...');

    if (deductScore(CHAT_CONFIG.CLUE_COST, '(申请调查线索)')) {
        appState.cluesPurchased++;
        showRandomClue();
        log(`线索获取成功！已购买 ${appState.cluesPurchased} 条线索`);

        if (appState.cluesPurchased >= 5 && !appState.medalsUnlocked.includes(5)) {
            unlockMedal(5);
        }
    } else {
        shakeButton(buttonElement);
        log('积分不足，无法获取线索');
    }
}

const cluesDatabase = [
    { id: 'clue_001', title: '战役时间线', fullContent: '济南战役从1948年9月16日开始，到9月24日结束，历时8天8夜。这是解放战争中一次具有决定性意义的战役。', category: '时间', source: '军事档案馆' },
    { id: 'clue_002', title: '指挥官信息', fullContent: '华东野战军代司令员粟裕指挥了这次战役，采用了"攻济打援"的战略方针。这一方针的核心是集中兵力攻打济南，同时准备打击可能来援的敌军。', category: '人物', source: '战史研究室' },
    { id: 'clue_003', title: '战略意义', fullContent: '这是解放军首次攻克国民党重兵防守的大城市，揭开了战略决战的序幕。济南战役的胜利证明了人民解放军已经具备了攻坚战的能力。', category: '意义', source: '党史研究所' },
    { id: 'clue_004', title: '参战部队', fullContent: '主要参战部队包括华东野战军第九纵队、第十三纵队等，其中第九纵队在聂凤智将军指挥下被誉为"攻城先锋"，率先突破城墙。', category: '部队', source: '军史资料' },
    { id: 'clue_005', title: '英雄人物', fullContent: '王克勤是济南战役中牺牲的著名战斗英雄，曾任排长，在攻城战斗中英勇牺牲，被追认为"模范共产党员"和"战斗英雄"。他的事迹激励了无数战士。', category: '人物', source: '英烈纪念馆' },
    { id: 'clue_006', title: '战后重建', fullContent: '1948年9月27日，济南特别市军事管制委员会成立，郭子化任主任，开始了城市接管工作。这标志着济南进入了新的历史发展阶段。', category: '后续', source: '地方志办公室' },
    { id: 'clue_007', title: '民心所向', fullContent: '济南战役期间，当地群众积极支援前线，运送物资、救护伤员、提供情报。这种军民鱼水情是解放军能够迅速取胜的重要原因之一。', category: '背景', source: '民间史料' },
    { id: 'clue_008', title: '城市特点', fullContent: '济南城防工事坚固，有"固若金汤"之称。城墙高大厚实，外围设有多道防线。但解放军凭借英勇顽强的战斗精神，最终突破了这些防线。', category: '战术', source: '作战档案' }
];

let purchasedClues = [];

function renderInitialClues() {
    const cluesListEl = document.getElementById('clues-list');
    if (!cluesListEl) return;

    cluesListEl.innerHTML = '<div class="empty-clues-message"><p>暂无线索</p><p>使用积分申请新线索开始探索！</p></div>';
}

function showRandomClue() {
    const availableClues = cluesDatabase.filter(c => !purchasedClues.includes(c.id));

    if (availableClues.length === 0) {
        showToastMessage('所有线索都已获取！', 'info');
        deductScore(-CHAT_CONFIG.CLUE_COST, '(退还积分)');
        return;
    }

    const randomIndex = Math.floor(Math.random() * availableClues.length);
    const selectedClue = availableClues[randomIndex];
    purchasedClues.push(selectedClue.id);

    const cluesListEl = document.getElementById('clues-list');
    if (!cluesListEl) return;

    const emptyMsg = cluesListEl.querySelector('.empty-clues-message');
    if (emptyMsg) emptyMsg.remove();

    const clueCard = document.createElement('div');
    clueCard.className = 'clue-card new-clue highlight-animation';
    clueCard.dataset.clueId = selectedClue.id;
    clueCard.setAttribute('role', 'article');
    clueCard.setAttribute('aria-label', `线索：${selectedClue.title}`);

    clueCard.innerHTML = `
        <div class="clue-header">
            <span class="clue-title">💡 ${escapeHtml(selectedClue.title)}</span>
            <span class="viewed-badge">新</span>
        </div>
        <div class="clue-desc">${escapeHtml(selectedClue.fullContent.slice(0, 80))}...</div>
        <div class="clue-category">#${selectedClue.category}</div>
        <div class="expand-icon">▼ 点击展开详情</div>
        <div class="clue-detail" style="display: none;">
            <div class="clue-full-content">${escapeHtml(selectedClue.fullContent)}</div>
            <div class="clue-meta">
                <p>📂 分类：${selectedClue.category}</p>
                <p>📚 来源：${selectedClue.source}</p>
            </div>
        </div>
    `;

    clueCard.addEventListener('click', () => toggleClueDetail(clueCard));

    cluesListEl.insertBefore(clueCard, cluesListEl.firstChild);

    setTimeout(() => {
        clueCard.classList.remove('highlight-animation');
        clueCard.classList.remove('new-clue');
        const badge = clueCard.querySelector('.viewed-badge');
        if (badge) badge.textContent = '已查看';
    }, 1500);

    showToastMessage(`获得新线索：${selectedClue.title}`, 'success');

    renderMessage('ai', `📋 **【调查线索】**\n\n**${selectedClue.title}**\n\n${selectedClue.fullContent}\n\n*此线索消耗了 ${CHAT_CONFIG.CLUE_COST} 积分*`);
}

function toggleClueDetail(clueCard) {
    const detail = clueCard.querySelector('.clue-detail');
    const expandIcon = clueCard.querySelector('.expand-icon');

    if (!detail || !expandIcon) return;

    const isExpanded = detail.style.display !== 'none';

    if (isExpanded) {
        detail.style.display = 'none';
        expandIcon.textContent = '▼ 点击展开详情';
        clueCard.classList.remove('expanded');
    } else {
        detail.style.display = 'block';
        detail.style.animation = 'slideDown 0.3s ease-out forwards';
        expandIcon.textContent = '▲ 点击收起详情';
        clueCard.classList.add('expanded');
    }
}

function initClueSearchSystem() {
    const searchInput = document.getElementById('clue-search-input');
    const searchBtn = document.getElementById('search-clue-btn');

    if (searchInput) {
        const debouncedSearch = debounce((query) => performClueSearch(query), 300);

        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performClueSearch(searchInput.value);
            }
        });
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchInput) performClueSearch(searchInput.value);
        });
    }

    log('线索搜索系统已初始化');
}

function performClueSearch(query) {
    const cluesListEl = document.getElementById('clues-list');
    if (!cluesListEl) return;

    const cards = cluesListEl.querySelectorAll('.clue-card');
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
        cards.forEach(card => card.style.display = '');
        return;
    }

    let hasResults = false;

    cards.forEach(card => {
        const title = card.querySelector('.clue-title')?.textContent?.toLowerCase() || '';
        const desc = card.querySelector('.clue-desc')?.textContent?.toLowerCase() || '';
        const category = card.querySelector('.clue-category')?.textContent?.toLowerCase() || '';

        const matches = title.includes(normalizedQuery) || desc.includes(normalizedQuery) || category.includes(normalizedQuery);

        card.style.display = matches ? '' : 'none';
        if (matches) hasResults = true;
    });

    if (!hasResults && cards.length > 0) {
        let noResultMsg = cluesListEl.querySelector('.no-search-result');
        if (!noResultMsg) {
            noResultMsg = document.createElement('div');
            noResultMsg.className = 'empty-clues-message no-search-result';
            noResultMsg.innerHTML = `<p>未找到匹配"${escapeHtml(query)}"的线索</p><p>尝试其他关键词</p>`;
            cluesListEl.appendChild(noResultMsg);
        }
    } else {
        const noResultMsg = cluesListEl.querySelector('.no-search-result');
        if (noResultMsg) noResultMsg.remove();
    }
}

function shakeButton(button) {
    if (!button) return;
    button.classList.add('shake-animation');
    setTimeout(() => button.classList.remove('shake-animation'), 500);
}

// ==================== Chart.js 趋势图 ====================
let trendChart = null;

function initTrendChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas) {
        warn('未找到趋势图canvas元素');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        warn('无法获取Canvas 2D上下文');
        return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0.05)');

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
            datasets: [{
                label: '解密活跃度',
                data: generateTrendData(),
                borderColor: '#FFD700',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#FFD700',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#FFE55C',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#FFD700',
                        font: { family: "'Noto Sans SC', sans-serif", size: 13 },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(107, 0, 0, 0.95)',
                    titleColor: '#FFD700',
                    bodyColor: '#fff',
                    borderColor: '#FFD700',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `活跃度：${context.parsed.y} 次`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 215, 0, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 215, 0, 0.8)',
                        font: { family: "'Noto Sans SC', sans-serif", size: 11 }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 215, 0, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 215, 0, 0.8)',
                        font: { family: "'Noto Sans SC', sans-serif", size: 11 },
                        stepSize: 10
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            }
        }
    });

    log('趋势图初始化完成');
}

function generateTrendData() {
    const baseData = [25, 32, 28, 45, 38, 52, 48];
    const variation = () => Math.floor(Math.random() * 15) - 7;
    return baseData.map(val => Math.max(10, val + variation()));
}

function refreshTrendChart() {
    if (trendChart) {
        trendChart.data.datasets[0].data = generateTrendData();
        trendChart.update('active');
        log('趋势图数据已刷新');
    }
}

// ==================== 排行榜系统 ====================
const LEADERBOARD_CONFIG = {
    UPDATE_INTERVAL: 30000,
    SCORE_CHANGE_RANGE: 50,
    TOP_COUNT: 5,
    CURRENT_USER_NAME: '历史追梦人',
    CURRENT_USER_SCORE: 2100,
    ENABLE_AUTO_UPDATE: true
};

let leaderboardData = [
    { rank: 1, name: '勇往直前的少年', score: 2840, avatar: '🥇' },
    { rank: 2, name: '红色星', score: 2710, avatar: '🥈' },
    { rank: 3, name: '守护和平的鸽子', score: 2550, avatar: '🥉' },
    { rank: 4, name: '历史追梦人', score: 2100, avatar: '4' },
    { rank: 5, name: '解密小能手', score: 1980, avatar: '5' },
];

let previousData = JSON.parse(JSON.stringify(leaderboardData));
let updateTimer = null;

function renderLeaderboard(data) {
    const listContainer = document.getElementById('leaderboard-list');
    if (!listContainer) {
        error('找不到排行榜容器元素 #leaderboard-list');
        return;
    }

    listContainer.innerHTML = '';

    requestAnimationFrame(() => {
        data.forEach((user, index) => {
            const listItem = createLeaderboardItem(user, index);
            listContainer.appendChild(listItem);
        });
        updateMyRankingDisplay(data);
    });
}

function createLeaderboardItem(user, index) {
    const li = document.createElement('li');
    li.className = `leaderboard-item rank-${user.rank}`;

    if (user.rank <= 3) li.classList.add(`rank-${user.rank}`);

    const isCurrentUser = user.name === LEADERBOARD_CONFIG.CURRENT_USER_NAME;
    if (isCurrentUser) li.classList.add('current-user');

    const rankChange = getRankChange(user.name, user.rank);

    let avatarDisplay = user.avatar;
    if (user.rank >= 4) avatarDisplay = `${user.rank}`;

    li.innerHTML = `
        <span class="rank-number">${avatarDisplay}</span>
        <div class="user-info">
            <span class="user-name">${escapeHtml(user.name)}</span>
            <span class="user-score">${user.score.toLocaleString()} 分</span>
        </div>
        ${rankChange ? `<span class="rank-change ${rankChange.direction}">${rankChange.display}</span>` : ''}
    `;

    li.style.animationDelay = `${index * 0.08}s`;
    return li;
}

function getRankChange(userName, currentRank) {
    const previousUser = previousData.find(u => u.name === userName);
    if (!previousUser) return null;

    const previousRank = previousUser.rank;
    const rankDiff = previousRank - currentRank;

    if (rankDiff > 0) return { direction: 'up', display: `↑${rankDiff}` };
    if (rankDiff < 0) return { direction: 'down', display: `↓${Math.abs(rankDiff)}` };
    return null;
}

function updateLeaderboard() {
    log('正在更新排行榜数据...');
    previousData = JSON.parse(JSON.stringify(leaderboardData));

    leaderboardData = leaderboardData.map(user => {
        const change = Math.floor(Math.random() * (LEADERBOARD_CONFIG.SCORE_CHANGE_RANGE * 2 + 1)) - LEADERBOARD_CONFIG.SCORE_CHANGE_RANGE;
        return { ...user, score: Math.max(0, user.score + change) };
    });

    leaderboardData.sort((a, b) => b.score - a.score);
    leaderboardData = leaderboardData.map((user, index) => ({ ...user, rank: index + 1 }));
    leaderboardData = leaderboardData.slice(0, LEADERBOARD_CONFIG.TOP_COUNT);

    renderLeaderboard(leaderboardData);
    showUpdateNotification();
}

function refreshLeaderboard() {
    log('手动刷新排行榜...');

    const refreshBtn = document.getElementById('refresh-leaderboard-btn');
    if (refreshBtn) {
        refreshBtn.classList.add('spinning');
        setTimeout(() => refreshBtn.classList.remove('spinning'), 800);
    }

    previousData = JSON.parse(JSON.stringify(leaderboardData));

    const names = [
        '勇往直前的少年', '红色星', '守护和平的鸽子',
        '历史追梦人', '解密小能手', '红色传承者',
        '英雄追光者', '济南探索家', '革命记忆守护者'
    ];

    const selectedNames = shuffleArray(names).slice(0, LEADERBOARD_CONFIG.TOP_COUNT);
    let baseScore = 2800 + Math.floor(Math.random() * 400);

    leaderboardData = selectedNames.map((name, index) => {
        const score = baseScore - (index * (150 + Math.floor(Math.random() * 100)));
        const avatar = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : String(index + 1);
        return { rank: index + 1, name, score: Math.max(score, 500), avatar };
    });

    renderLeaderboard(leaderboardData);
    showToastMessage('排行榜已刷新！', 'success');
}

function updateMyRankingDisplay(data) {
    const myRankingDiv = document.getElementById('my-ranking');
    if (!myRankingDiv) return;

    const currentUserInTop5 = data.find(u => u.name === LEADERBOARD_CONFIG.CURRENT_USER_NAME);

    if (!currentUserInTop5) {
        myRankingDiv.classList.remove('hidden');

        const allUsersWithCurrent = [...data, { name: LEADERBOARD_CONFIG.CURRENT_USER_NAME, score: LEADERBOARD_CONFIG.CURRENT_USER_SCORE }];
        allUsersWithCurrent.sort((a, b) => b.score - a.score);
        const myVirtualRank = allUsersWithCurrent.findIndex(u => u.name === LEADERBOARD_CONFIG.CURRENT_USER_NAME) + 1;
        const userAboveMe = allUsersWithCurrent[myVirtualRank - 2];
        const gapScore = userAboveMe ? (userAboveMe.score - LEADERBOARD_CONFIG.CURRENT_USER_SCORE) : 0;

        myRankingDiv.innerHTML = `
            <div class="my-rank-text">您的排名：第 ${myVirtualRank} 名</div>
            <div>当前积分：<strong>${LEADERBOARD_CONFIG.CURRENT_USER_SCORE.toLocaleString()}</strong> 分</div>
            ${gapScore > 0 ? `<div class="gap-text">距离上一名还差 <strong>${gapScore}</strong> 分 💪</div>` : ''}
        `;
    } else {
        myRankingDiv.classList.add('hidden');
    }
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

function showUpdateNotification() {
    const leaderboardPanel = document.querySelector('.leaderboard-panel');
    if (leaderboardPanel) {
        leaderboardPanel.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';
        setTimeout(() => { leaderboardPanel.style.boxShadow = ''; }, 500);
    }
}

function bindLeaderboardEvents() {
    const refreshBtn = document.getElementById('refresh-leaderboard-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshLeaderboard());
    }

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            refreshLeaderboard();
        }
    });
}

function startAutoUpdate() {
    if (!LEADERBOARD_CONFIG.ENABLE_AUTO_UPDATE) {
        log('自动更新已禁用');
        return;
    }

    log(`启动自动更新定时器（间隔：${LEADERBOARD_CONFIG.UPDATE_INTERVAL / 1000}秒）`);
    updateTimer = setInterval(() => updateLeaderboard(), LEADERBOARD_CONFIG.UPDATE_INTERVAL);
}

function stopAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
        log('已停止自动更新定时器');
    }
}

function initLeaderboard() {
    log('初始化今日解密排行榜...');

    try {
        renderLeaderboard(leaderboardData);
        bindLeaderboardEvents();
        startAutoUpdate();
        log('排行榜初始化完成！');
        log(`当前显示前 ${LEADERBOARD_CONFIG.TOP_COUNT} 名用户`);
        log(`自动更新间隔：${LEADERBOARD_CONFIG.UPDATE_INTERVAL / 1000}秒`);
    } catch (err) {
        error('排行榜初始化失败:', err);
        showToastMessage('排行榜加载失败，请刷新页面重试', 'error');
    }
}

// ==================== Toast提示系统 ====================
function showToastMessage(message, type = 'info', duration = 3000) {
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== 辅助功能函数 ====================
function updateCurrentDateDisplay() {
    const dateDisplayEl = document.getElementById('current-date');
    if (dateDisplayEl) {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        dateDisplayEl.textContent = now.toLocaleDateString('zh-CN', options);
    }
}

function shareAchievement() {
    const shareBtn = document.getElementById('share-btn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', () => {
        const shareText = `我在"红色记忆——济南英雄风云录"中获得了 ${userScore} 分！一起来探索济南革命历史吧！`;

        if (navigator.share) {
            navigator.share({
                title: '红色记忆——济南英雄风云录',
                text: shareText,
                url: window.location.href
            }).catch(err => log('分享取消:', err));
        } else {
            fallbackCopyToClipboard(shareText);
            showToastMessage('成就信息已复制，快去分享吧！', 'success');
        }
    });
}

// ==================== 页面主入口（统一初始化） ====================
document.addEventListener('DOMContentLoaded', () => {
    log('========================================');
    log('🎯 页面加载完成，开始初始化所有模块...');
    log('========================================');

    try {
        initDOMReferences();

        const hasSavedState = loadAppState();
        if (hasSavedState) {
            log('已恢复保存的游戏进度');
            showToastMessage('已加载上次进度', 'info', 2000);
        } else {
            log('使用初始状态开始新游戏');
            appState.score = appState.initialScore;
            userScore = appState.initialScore;
        }

        showWelcomeMessage();
        bindChatEventListeners();
        initClueSystem();
        initLeaderboard();
        initTrendChart();
        renderMedalsGallery();
        updateAllDisplays();
        updateCurrentDateDisplay();
        shareAchievement();

        document.addEventListener('scoreChange', (e) => {
            log(`积分事件: ${e.detail.type} ${e.detail.amount}分 → 当前: ${e.detail.newScore}`);
        });

        window.addEventListener('beforeunload', () => {
            saveAppState();
            stopAutoUpdate();
        });

        log('========================================');
        log('✅ 所有模块初始化完成！');
        log(`📚 题库共有 ${quizQuestions.length} 道题目`);
        log(`💬 最大消息保留数: ${CHAT_CONFIG.MAX_MESSAGES}`);
        log(`💰 初始积分: ${appState.score}`);
        log(`🏅 勋章总数: ${medalsData.length} 个`);
        log('========================================');

    } catch (err) {
        error('系统初始化失败:', err);
        showToastMessage('系统初始化失败，请刷新页面重试', 'error');
    }
});
