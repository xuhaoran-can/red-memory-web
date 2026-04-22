/**
 * Vercel 专用数据存储模块
 * 
 * 使用 JSON 文件存储数据（适配 Vercel Serverless 环境）
 * 替代 SQLite 数据库
 */

const fs = require('fs');
const path = require('path');

// 检测运行环境（Vercel/Serverless vs 本地）
const isVercel = process.env.VERCEL || process.env.NOW || process.env.USE_JSON_STORE === 'true';

// 数据文件路径 - Vercel必须使用 /tmp 目录（唯一可写的位置）
const DATA_DIR = isVercel ? '/tmp/data' : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MEDALS_FILE = path.join(DATA_DIR, 'medals.json');
const SCORE_HISTORY_FILE = path.join(DATA_DIR, 'score_history.json');
const QUIZ_ATTEMPTS_FILE = path.join(DATA_DIR, 'quiz_attempts.json');
const CLUE_PURCHASES_FILE = path.join(DATA_DIR, 'clue_purchases.json');
const ACTIVITY_STATS_FILE = path.join(DATA_DIR, 'activity_stats.json');

// 确保数据目录存在
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`✅ 数据目录已创建: ${DATA_DIR}`);
    }
} catch (error) {
    console.error('❌ 创建数据目录失败:', error.message);
}

// ==================== 工具函数 ====================

/**
 * 读取JSON文件
 */
function readJSONFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
        return [];
    }
}

/**
 * 写入JSON文件
 */
function writeJSONFile(filePath, data) {
    try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`写入文件失败 ${filePath}:`, error.message);
        return false;
    }
}

/**
 * 生成唯一ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== 用户管理 ====================

/**
 * 获取所有用户
 */
function getAllUsers() {
    return readJSONFile(USERS_FILE);
}

/**
 * 根据用户名查找用户
 */
function findUserByUsername(username) {
    const users = getAllUsers();
    return users.find(u => u.username === username);
}

/**
 * 根据ID查找用户
 */
function findUserById(userId) {
    const users = getAllUsers();
    return users.find(u => u.id === userId);
}

/**
 * 创建新用户
 */
function createUser(userData) {
    const users = getAllUsers();
    
    // 检查用户名是否已存在
    if (users.find(u => u.username === userData.username)) {
        return { success: false, message: '用户名已存在' };
    }
    
    const newUser = {
        id: generateId(),
        username: userData.username,
        password: userData.password, // 应该是加密后的密码
        nickname: userData.nickname || userData.username,
        avatar: 'default.png',
        score: 50,
        total_earned: 0,
        total_spent: 0,
        questions_answered: 0,
        correct_answers: 0,
        clues_purchased: 0,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        medalsUnlocked: []
    };
    
    users.push(newUser);
    
    if (writeJSONFile(USERS_FILE, users)) {
        // 删除敏感信息再返回
        const { password, ...safeUser } = newUser;
        return { success: true, user: safeUser };
    }
    
    return { success: false, message: '创建用户失败' };
}

/**
 * 更新用户最后登录时间
 */
function updateLastLogin(userId) {
    const users = getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index !== -1) {
        users[index].last_login = new Date().toISOString();
        writeJSONFile(USERS_FILE, users);
    }
}

/**
 * 更新用户积分
 */
function updateUserScore(userId, scoreChange, type) {
    const users = getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index === -1) {
        return { success: false, message: '用户不存在' };
    }
    
    const user = users[index];
    
    if (type === 'add') {
        user.score += scoreChange;
        user.total_earned += scoreChange;
    } else if (type === 'deduct') {
        if (user.score < scoreChange) {
            return { success: false, message: `积分不足！需要${scoreChange}分，当前仅${user.score}分` };
        }
        user.score -= scoreChange;
        user.total_spent += scoreChange;
        
        if (scoreChange > 9) { // 购买线索
            user.clues_purchased++;
        }
    }
    
    writeJSONFile(USERS_FILE, users);
    
    // 记录积分变动
    addScoreHistory({
        userId,
        amount: scoreChange,
        type,
        reason: type === 'add' ? '获得积分' : '消耗积分'
    });
    
    const { password, ...safeUser } = user;
    return { success: true, newScore: user.score, user: safeUser };
}

/**
 * 更新用户答题统计
 */
function updateUserQuizStats(userId, isCorrect, scoreEarned) {
    const users = getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index !== -1) {
        users[index].questions_answered++;
        if (isCorrect) {
            users[index].correct_answers++;
            users[index].score += scoreEarned;
            users[index].total_earned += scoreEarned;
        }
        writeJSONFile(USERS_FILE, users);
    }
}

/**
 * 解锁勋章
 */
function unlockUserMedal(userId, medalId) {
    const users = getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index !== -1) {
        if (!users[index].medalsUnlocked.includes(medalId)) {
            users[index].medalsUnlocked.push(medalId);
            writeJSONFile(USERS_FILE, users);
            return true;
        }
    }
    return false;
}

// ==================== 积分历史 ====================

/**
 * 添加积分记录
 */
function addScoreHistory(record) {
    const history = readJSONFile(SCORE_HISTORY_FILE);
    history.push({
        id: generateId(),
        ...record,
        created_at: new Date().toISOString()
    });
    
    // 只保留最近100条
    if (history.length > 100) {
        history.shift();
    }
    
    writeJSONFile(SCORE_HISTORY_FILE, history);
}

/**
 * 获取用户积分历史
 */
function getUserScoreHistory(userId, limit = 20) {
    const history = readJSONFile(SCORE_HISTORY_FILE);
    return history
        .filter(h => h.userId === userId)
        .slice(-limit)
        .reverse();
}

// ==================== 勋章系统 ====================

/**
 * 获取所有勋章定义
 */
function getMedals() {
    return [
        { id: 1, name: '初识战役', icon: '🎖️', description: '完成首次解密挑战', unlock_condition: '答对第1题' },
        { id: 2, name: '名将风采', icon: '🏅', description: '了解战役指挥将领', unlock_condition: '答对第3题' },
        { id: 3, name: '战略眼光', icon: '🔓', description: '理解战役重要意义', unlock_condition: '答对第5题' },
        { id: 4, name: '史料达人', icon: '📚', description: '深入研究历史细节', unlock_condition: '答对第7题' },
        { id: 5, name: '线索猎人', icon: '💡', description: '积极收集历史线索', unlock_condition: '购买5条线索' },
        { id: 6, name: '荣耀之星', icon: '⭐', description: '完成全部挑战', unlock_condition: '全部答对' }
    ];
}

/**
 * 获取用户勋章状态
 */
function getUserMedals(userId) {
    const user = findUserById(userId);
    const allMedals = getMedals();
    
    if (!user) {
        return {
            medals: allMedals.map(m => ({ ...m, unlocked: false })),
            unlockedCount: 0,
            totalCount: allMedals.length,
            progress: 0
        };
    }
    
    const medalsWithStatus = allMedals.map(medal => ({
        ...medal,
        unlocked: user.medalsUnlocked.includes(medal.id)
    }));
    
    const unlockedCount = medalsWithStatus.filter(m => m.unlocked).length;
    
    return {
        medals: medalsWithStatus,
        unlockedCount,
        totalCount: allMedals.length,
        progress: Math.round((unlockedCount / allMedals.length) * 100)
    };
}

// ==================== 题目和答题 ====================

/**
 * 获取所有题目
 */
function getQuestions() {
    return [
        {
            id: 1,
            question_text: '📜 问题1：济南战役发生在哪一年？\nA. 1946年  B. 1948年  C. 1950年',
            options: 'A,B,C',
            correct_answers: 'B',
            explanation: '✅ 回答正确！济南战役确实发生在1948年9月16日至24日。\n\n📖 历史背景：这是解放战争时期的重要战役，由华东野战军司令员粟裕指挥，历时8天攻克济南，歼灭国民党军10万余人。',
            score: 10,
            medal_id: 1,
            order_index: 1
        },
        {
            id: 2,
            question_text: '📜 问题2：济南战役历时多少天？\nA. 6天  B. 8天  C. 10天',
            options: 'A,B,C',
            correct_answers: 'B',
            explanation: '✅ 回答正确！济南战役从9月16日开始，到24日结束，共历时8天。\n\n📖 这8天的战斗异常激烈，人民解放军以顽强的意志突破了国民党军的坚固防线。',
            score: 10,
            medal_id: null,
            order_index: 2
        },
        {
            id: 3,
            question_text: '📜 问题3：济南战役的主要指挥将领是谁？\nA. 林彪  B. 粟裕  C. 刘伯承',
            options: 'A,B,C',
            correct_answers: 'B',
            explanation: '✅ 回答正确！济南战役的主要指挥官是粟裕将军。\n\n📖 粟裕(1907-1984)是中国杰出的军事家、战略家，被誉为"常胜将军"。他采用"攻济打援"的英明决策，指挥华东野战军取得了辉煌胜利。',
            score: 10,
            medal_id: 2,
            order_index: 3
        },
        {
            id: 4,
            question_text: '📜 问题4：济南战役中牺牲的英雄模范是谁？\nA. 王克勤  B. 黄继光  C. 董存瑞',
            options: 'A,B,C',
            correct_answers: 'A',
            explanation: '✅ 回答正确！王克勤是济南战役中涌现出的英雄模范。\n\n📖 王克勤(1927-1947)是华东野战军排长，在战斗中英勇顽强，被评为"一级战斗英雄"。',
            score: 10,
            medal_id: null,
            order_index: 4
        },
        {
            id: 5,
            question_text: '📜 问题5：济南战役的重大意义是什么？\nA. 解放山东全境  B. 揭开决战序幕  C. 结束内战',
            options: 'A,B,C',
            correct_answers: 'B',
            explanation: '✅ 回答正确！济南战役揭开了人民解放军战略决战的序幕。\n\n📖 济南的解放具有重大战略意义：它使华北、华东两大解放区连成一片，打破了国民党的重点防御体系。',
            score: 15,
            medal_id: 3,
            order_index: 5
        },
        {
            id: 6,
            question_text: '📜 问题6：济南解放后成立的政府是什么？\nA. 军事管制委员会  B. 人民政府  C. 革命委员会',
            options: 'A,B,C',
            correct_answers: 'A',
            explanation: '✅ 回答正确！济南解放后成立了军事管制委员会。\n\n📖 1948年9月27日，济南特别市军事管制委员会正式成立，由谭震林任主任。',
            score: 10,
            medal_id: null,
            order_index: 6
        },
        {
            id: 7,
            question_text: '📜 问题7：当时济南国民党守将王耀武的职务是什么？\nA. 第二绥靖区司令官  B. 山东省主席  C. 徐州剿总副总司令',
            options: 'A,B,C',
            correct_answers: 'B',
            explanation: '✅ 回答正确！王耀武当时的职务是山东省政府主席兼第二绥靖区司令官。',
            score: 10,
            medal_id: 4,
            order_index: 7
        },
        {
            id: 8,
            question_text: '📜 问题8：哪个部队是济南战役的攻城先锋？\nA. 第九纵队  B. 第十纵队  C. 渤海纵队',
            options: 'A,B,C',
            correct_answers: 'A',
            explanation: '✅ 回答正确！第九纵队是济南战役的攻城先锋部队。\n\n📖 第九纵队在宋时轮司令员的指挥下，承担了主攻任务。',
            score: 10,
            medal_id: null,
            order_index: 8
        }
    ];
}

/**
 * 记录答题结果
 */
function recordQuizAttempt(userId, questionId, answer, isCorrect, scoreEarned) {
    const attempts = readJSONFile(QUIZ_ATTEMPTS_FILE);
    
    attempts.push({
        id: generateId(),
        userId,
        questionId,
        userAnswer: answer,
        isCorrect,
        scoreEarned,
        createdAt: new Date().toISOString()
    });
    
    writeJSONFile(QUIZ_ATTEMPTS_FILE, attempts);
    
    // 更新用户统计
    updateUserQuizStats(userId, isCorrect, scoreEarned);
    
    return { isCorrect, scoreEarned };
}

// ==================== 线索系统 ====================

/**
 * 获取所有线索
 */
function getClues(search = '') {
    const clues = [
        { id: 1, title: '济南战役时间', content: '济南战役发生于1948年9月16日至24日，历时8天。这是解放战争时期的一次重要城市攻坚战役。', category: '历史事件', keywords: ['济南 战役 1948 时间'] },
        { id: 2, title: '解放济南', content: '1948年9月24日，华东野战军攻克济南，歼敌10万余人。这次胜利揭开了人民解放军战略决战的序幕。', category: '重大胜利', keywords: ['解放 华东野战军 攻克'] },
        { id: 3, title: '英雄人物', content: '济南战役中涌现出众多英雄模范，如"一级战斗英雄"王克勤等，他们用生命诠释了革命精神。', category: '人物故事', keywords: ['英雄 模范 人物 王克勤'] },
        { id: 4, title: '战役指挥', content: '济南战役由粟裕将军指挥华东野战军实施，采用"攻济打援"的战略方针，展现了高超的军事指挥艺术。', category: '军事指挥', keywords: ['指挥 粟裕 战略 攻济打援'] },
        { id: 5, title: '城防工事', content: '国民党军在济南构筑了坚固的城防工事，包括外壕、城墙、碉堡等多层防御体系，但最终被人民解放军突破。', category: '战争细节', keywords: ['城防 工事 城墙 碉堡 防御'] },
        { id: 6, title: '群众支援', content: '济南战役得到了人民群众的广泛支援，数十万民工参与支前工作，运送物资、抢救伤员，为战役胜利做出重要贡献。', category: '民众支援', keywords: ['群众 支援 民工 支前'] },
        { id: 7, title: '战后影响', content: '济南的解放使华北、华东两大解放区连成一片，为后续淮海战役、平津战役的胜利奠定了坚实基础。', category: '历史意义', keywords: ['影响 解放区 淮海 平津'] },
        { id: 8, title: '纪念设施', content: '如今在济南建有济南战役纪念馆、解放阁等纪念设施，永远铭记这段光辉历史和革命先烈的英勇事迹。', category: '纪念场所', keywords: ['纪念馆 解放阁 纪念 设施'] }
    ];
    
    if (!search) {
        return clues;
    }
    
    const searchLower = search.toLowerCase();
    return clues.filter(clue => 
        clue.title.toLowerCase().includes(searchLower) ||
        clue.content.toLowerCase().includes(searchLower) ||
        clue.category.toLowerCase().includes(searchLower) ||
        clue.keywords.some(k => k.toLowerCase().includes(searchLower))
    );
}

/**
 * 购买随机线索
 */
function purchaseClue(userId) {
    const user = findUserById(userId);
    
    if (!user) {
        return { success: false, message: '用户不存在' };
    }
    
    const cost = 10;
    
    if (user.score < cost) {
        return { success: false, message: '积分不足！需要10分' };
    }
    
    // 扣除积分
    const result = updateUserScore(userId, cost, 'deduct');
    if (!result.success) {
        return result;
    }
    
    // 获取所有线索ID
    const allClueIds = [1, 2, 3, 4, 5, 6, 7, 8];
    
    // 获取已购买的线索
    const purchases = readJSONFile(CLUE_PURCHASES_FILE);
    const purchasedIds = purchases
        .filter(p => p.userId === userId)
        .map(p => p.clueId);
    
    // 找到未购买的线索
    const availableClueIds = allClueIds.filter(id => !purchasedIds.includes(id));
    
    if (availableClueIds.length === 0) {
        // 退还积分
        updateUserScore(userId, cost, 'add');
        return { success: false, message: '所有线索都已获取完毕！' };
    }
    
    // 随机选择一个
    const randomIndex = Math.floor(Math.random() * availableClueIds.length);
    const selectedClueId = availableClueIds[randomIndex];
    
    // 记录购买
    purchases.push({
        id: generateId(),
        userId,
        clueId: selectedClueId,
        cost,
        purchasedAt: new Date().toISOString()
    });
    
    writeJSONFile(CLUE_PURCHASES_FILE, purchases);
    
    // 获取线索详情
    const clue = getClues().find(c => c.id === selectedClueId);
    
    // 检查是否达到5条（解锁"线索猎人"勋章）
    const userPurchases = purchases.filter(p => p.userId === userId).length;
    if (userPurchases >= 5) {
        unlockUserMedal(userId, 5); // 勋章ID 5 是"线索猎人"
    }
    
    return { 
        success: true, 
        message: '🎉 成功获取新线索！',
        clue 
    };
}

// ==================== 排行榜 ====================

/**
 * 获取排行榜
 */
function getLeaderboard(limit = 10, type = 'score') {
    let users = getAllUsers();
    
    // 过滤掉没有答题记录的用户
    users = users.filter(u => u.questions_answered > 0);
    
    // 根据类型排序
    if (type === 'score') {
        users.sort((a, b) => b.score - a.score);
    } else if (type === 'today') {
        // 今日得分：简化处理，直接按总分排序（实际应该计算今日新增）
        users.sort((a, b) => b.score - a.score);
    } else if (type === 'week') {
        // 本周得分：同上
        users.sort((a, b) => b.score - a.score);
    }
    
    // 限制数量
    users = users.slice(0, limit);
    
    // 移除密码字段并添加排名
    const leaderboard = users.map((user, index) => {
        const { password, ...safeUser } = user;
        return {
            ...safeUser,
            rank: index + 1
        };
    });
    
    return {
        leaderboard,
        type,
        updateTime: new Date().toISOString()
    };
}

// ==================== 活跃度统计 ====================

/**
 * 获取活跃度统计
 */
function getActivityStats() {
    const stats = readJSONFile(ACTIVITY_STATS_FILE);
    
    if (stats.length === 0) {
        // 生成模拟数据
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            
            stats.push({
                date: date.toISOString().split('T')[0],
                active_users: Math.floor(Math.random() * 300) + 200,
                total_questions: Math.floor(Math.random() * 400) + 300,
                total_score_earned: Math.floor(Math.random() * 5000) + 3000
            });
        }
        
        writeJSONFile(ACTIVITY_STATS_FILE, stats);
    }
    
    return stats.reverse(); // 返回升序排列
}

// ==================== 导出模块 ====================

module.exports = {
    // 用户管理
    createUser,
    findUserByUsername,
    findUserById,
    getAllUsers,
    updateLastLogin,
    updateUserScore,
    updateUserQuizStats,
    unlockUserMedal,
    
    // 积分
    getUserScoreHistory,
    addScoreHistory,
    
    // 勋章
    getMedals,
    getUserMedals,
    
    // 题目
    getQuestions,
    recordQuizAttempt,
    
    // 线索
    getClues,
    purchaseClue,
    
    // 排行榜
    getLeaderboard,
    
    // 统计
    getActivityStats
};
