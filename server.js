/**
 * 红色记忆——济南英雄风云录 - Express后端服务器
 * 
 * 功能：
 * 1. 用户认证系统（注册/登录/JWT）
 * 2. 游戏数据API（积分/勋章/线索/排行榜）
 * 3. 静态文件服务
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

// ==================== 配置 ====================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'red-memory-secret-key-2026'; // 生产环境应使用环境变量
const DB_PATH = path.join(__dirname, 'database', 'red_memory.db');

// 确保数据库目录存在
const fs = require('fs');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// ==================== 数据库连接 ====================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err.message);
        process.exit(1);
    }
    console.log('✅ 已连接到数据库');
});

db.run('PRAGMA foreign_keys = ON');

// ==================== JWT认证中间件 ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// ==================== 用户认证路由 ====================

/**
 * POST /api/auth/register - 用户注册
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        
        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '用户名和密码不能为空' 
            });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ 
                success: false, 
                message: '用户名长度应在3-20个字符之间' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: '密码长度至少6个字符' 
            });
        }
        
        // 检查用户名是否已存在
        db.get('SELECT id FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, message: '数据库查询错误' });
            }
            
            if (user) {
                return res.status(409).json({ success: false, message: '用户名已存在' });
            }
            
            // 加密密码
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // 创建用户
            db.run(
                `INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)`,
                [username, hashedPassword, nickname || username],
                function(err) {
                    if (err) {
                        return res.status(500).json({ success: false, message: '创建用户失败' });
                    }
                    
                    res.status(201).json({
                        success: true,
                        message: '注册成功',
                        data: { userId: this.lastID, username }
                    });
                }
            );
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

/**
 * POST /api/auth/login - 用户登录
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '请输入用户名和密码' 
            });
        }
        
        // 查询用户
        db.get(
            'SELECT * FROM users WHERE username = ?', 
            [username],
            async (err, user) => {
                if (err) {
                    return res.status(500).json({ success: false, message: '数据库查询错误' });
                }
                
                if (!user) {
                    return res.status(401).json({ success: false, message: '用户名或密码错误' });
                }
                
                // 验证密码
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    return res.status(401).json({ success: false, message: '用户名或密码错误' });
                }
                
                // 更新最后登录时间
                db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                
                // 生成JWT令牌
                const token = jwt.sign(
                    { userId: user.id, username: user.username },
                    JWT_SECRET,
                    { expiresIn: '24h' } // 24小时过期
                );
                
                res.json({
                    success: true,
                    message: '登录成功',
                    data: {
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            nickname: user.nickname,
                            score: user.score,
                            avatar: user.avatar
                        }
                    }
                });
            }
        );
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

/**
 * GET /api/auth/me - 获取当前用户信息
 */
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(
        'SELECT id, username, nickname, avatar, score, total_earned, total_spent, questions_answered, correct_answers, clues_purchased FROM users WHERE id = ?',
        [req.user.userId],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            
            res.json({
                success: true,
                data: user
            });
        }
    );
});

// ==================== 游戏数据API ====================

/**
 * GET /api/user/score - 获取用户积分
 */
app.get('/api/user/score', authenticateToken, (req, res) => {
    db.get(
        'SELECT score FROM users WHERE id = ?',
        [req.user.userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, message: '查询失败' });
            }
            res.json({ success: true, data: { score: row?.score || 0 } });
        }
    );
});

/**
 * POST /api/user/score/add - 增加积分
 */
app.post('/api/user/score/add', authenticateToken, (req, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '积分数量无效' });
    }
    
    db.serialize(() => {
        // 更新用户积分
        db.run(
            `UPDATE users SET score = score + ?, total_earned = total_earned + ? WHERE id = ?`,
            [amount, amount, req.user.userId],
            function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: '更新积分失败' });
                }
                
                // 记录积分变动
                db.run(
                    `INSERT INTO score_history (user_id, amount, type, reason) VALUES (?, ?, 'earn', ?)`,
                    [req.user.userId, amount, reason || '获得积分'],
                    (err) => {
                        if (err) console.error('记录积分历史失败:', err);
                        
                        // 返回新积分
                        db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
                            res.json({
                                success: true,
                                message: `+${amount}积分`,
                                data: { newScore: row?.score || 0, added: amount }
                            });
                        });
                    }
                );
            }
        );
    });
});

/**
 * POST /api/user/score/deduct - 扣除积分
 */
app.post('/api/user/score/deduct', authenticateToken, (req, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '积分数量无效' });
    }
    
    // 先检查余额
    db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err || !row) {
            return res.status(500).json({ success: false, message: '查询余额失败' });
        }
        
        if (row.score < amount) {
            return res.status(400).json({
                success: false,
                message: `积分不足！需要${amount}分，当前仅${row.score}分`
            });
        }
        
        // 执行扣除
        db.run(
            `UPDATE users SET score = score - ?, total_spent = total_spent + ? WHERE id = ?`,
            [amount, amount, req.user.userId],
            function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: '扣除积分失败' });
                }
                
                // 记录积分变动
                db.run(
                    `INSERT INTO score_history (user_id, amount, type, reason) VALUES (?, ?, 'spend', ?)`,
                    [req.user.userId, amount, reason || '消耗积分']
                );
                
                // 更新线索购买数（如果是购买线索）
                if (reason && reason.includes('线索')) {
                    db.run('UPDATE users SET clues_purchased = clues_purchased + 1 WHERE id = ?', [req.user.userId]);
                }
                
                // 返回新积分
                db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, newRow) => {
                    res.json({
                        success: true,
                        message: `-${amount}积分`,
                        data: { newScore: newRow?.score || 0, deducted: amount }
                    });
                });
            }
        );
    });
});

/**
 * GET /api/medals - 获取所有勋章及用户解锁状态
 */
app.get('/api/medals', authenticateToken, (req, res) => {
    db.all(`
        SELECT m.*, 
               CASE WHEN um.user_id IS NOT NULL THEN 1 ELSE 0 END as unlocked,
               um.unlocked_at
        FROM medals m
        LEFT JOIN user_medals um ON m.id = um.medal_id AND um.user_id = ?
        ORDER BY m.id
    `, [req.user.userId], (err, medals) => {
        if (err) {
            return res.status(500).json({ success: false, message: '查询勋章失败' });
        }
        
        const unlockedCount = medals.filter(m => m.unlocked).length;
        
        res.json({
            success: true,
            data: {
                medals,
                unlockedCount,
                totalCount: medals.length,
                progress: Math.round((unlockedCount / medals.length) * 100)
            }
        });
    });
});

/**
 * POST /api/medals/:id/unlock - 解锁勋章
 */
app.post('/api/medals/:id/unlock', authenticateToken, (req, res) => {
    const medalId = req.params.id;
    
    // 检查是否已解锁
    db.get(
        'SELECT * FROM user_medals WHERE user_id = ? AND medal_id = ?',
        [req.user.userId, medalId],
        (err, existing) => {
            if (err) {
                return res.status(500).json({ success: false, message: '查询失败' });
            }
            
            if (existing) {
                return res.json({ success: true, message: '该勋章已解锁' });
            }
            
            // 插入解锁记录
            db.run(
                'INSERT INTO user_medals (user_id, medal_id) VALUES (?, ?)',
                [req.user.userId, medalId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ success: false, message: '解锁失败' });
                    }
                    
                    res.json({
                        success: true,
                        message: '🎉 恭喜解锁新勋章！'
                    });
                }
            );
        }
    );
});

/**
 * GET /api/questions - 获取题目列表
 */
app.get('/api/questions', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM questions ORDER BY order_index',
        [],
        (err, questions) => {
            if (err) {
                return res.status(500).json({ success: false, message: '查询题目失败' });
            }
            res.json({ success: true, data: questions });
        }
    );
});

/**
 * POST /api/questions/:id/answer - 提交答案
 */
app.post('/api/questions/:id/answer', authenticateToken, (req, res) => {
    const questionId = req.params.id;
    const { answer } = req.body;
    
    if (!answer) {
        return res.status(400).json({ success: false, message: '请提供答案' });
    }
    
    // 获取题目信息
    db.get('SELECT * FROM questions WHERE id = ?', [questionId], (err, question) => {
        if (err || !question) {
            return res.status(404).json({ success: false, message: '题目不存在' });
        }
        
        // 验证答案
        const correctAnswers = question.correct_answers.split(',').map(a => a.trim().toLowerCase());
        const isCorrect = correctAnswers.includes(answer.trim().toLowerCase());
        
        // 记录答题结果
        db.run(
            `INSERT INTO quiz_attempts (user_id, question_id, user_answer, is_correct, score_earned)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.userId, questionId, answer, isCorrect, isCorrect ? question.score : 0],
            function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: '记录答题失败' });
                }
                
                // 更新用户统计
                db.run(
                    `UPDATE users SET 
                     questions_answered = questions_answered + 1,
                     correct_answers = correct_answers + ?,
                     score = score + ?
                     WHERE id = ?`,
                    [isCorrect ? 1 : 0, isCorrect ? question.score : 0, req.user.userId],
                    () => {
                        // 如果答对且有勋章奖励，自动解锁
                        if (isCorrect && question.medal_id) {
                            db.run(
                                'INSERT OR IGNORE INTO user_medals (user_id, medal_id) VALUES (?, ?)',
                                [req.user.userId, question.medal_id]
                            );
                        }
                        
                        res.json({
                            success: true,
                            data: {
                                isCorrect,
                                scoreEarned: isCorrect ? question.score : 0,
                                explanation: question.explanation,
                                medalUnlocked: isCorrect && question.medal_id ? true : false
                            },
                            message: isCorrect ? '✅ 回答正确！' : '❌ 回答错误'
                        });
                    }
                );
            }
        );
    });
});

/**
 * GET /api/clues - 获取线索列表
 */
app.get('/api/clues', (req, res) => {
    const search = req.query.search || '';
    
    let query = 'SELECT * FROM clues';
    let params = [];
    
    if (search) {
        query += ' WHERE title LIKE ? OR content LIKE ? OR keywords LIKE ?';
        const searchParam = `%${search}%`;
        params = [searchParam, searchParam, searchParam];
    }
    
    db.all(query + ' ORDER BY id', params, (err, clues) => {
        if (err) {
            return res.status(500).json({ success: false, message: '查询线索失败' });
        }
        res.json({ success: true, data: clues });
    });
});

/**
 * POST /api/clues/purchase - 购买随机线索
 */
app.post('/api/clues/purchase', authenticateToken, (req, res) => {
    const cost = 10; // 固定价格
    
    // 检查余额
    db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err || !row || row.score < cost) {
            return res.status(400).json({
                success: false,
                message: '积分不足！需要10分'
            });
        }
        
        // 获取所有未购买的线索
        db.all(`
            SELECT c.* FROM clues c
            LEFT JOIN clue_purchases cp ON c.id = cp.clue_id AND cp.user_id = ?
            WHERE cp.id IS NULL
            ORDER BY RANDOM()
            LIMIT 1
        `, [req.user.userId], (err, clues) => {
            if (err || clues.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: '所有线索都已获取完毕！'
                });
            }
            
            const clue = clues[0];
            
            // 扣除积分并记录购买
            db.serialize(() => {
                db.run(
                    'UPDATE users SET score = score - ? WHERE id = ?',
                    [cost, req.user.userId]
                );
                
                db.run(
                    'INSERT INTO clue_purchases (user_id, clue_id, cost) VALUES (?, ?, ?)',
                    [req.user.userId, clue.id, cost]
                );
                
                // 检查是否达到5条线索（解锁"线索猎人"勋章）
                db.get(
                    'SELECT COUNT(*) as count FROM clue_purchases WHERE user_id = ?',
                    [req.user.userId],
                    (err, result) => {
                        if (result.count >= 5) {
                            db.run(
                                'INSERT OR IGNORE INTO user_medals (user_id, medal_id) VALUES (?, 5)',
                                [req.user.userId] // 勋章ID 5 是"线索猎人"
                            );
                        }
                        
                        res.json({
                            success: true,
                            message: '🎉 成功获取新线索！',
                            data: clue
                        });
                    }
                );
            });
        });
    });
});

/**
 * GET /api/leaderboard - 获取排行榜（真实数据）
 */
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || 'score'; // score | today | week
    
    let orderBy = 'u.score DESC';
    let whereClause = '';
    
    switch(type) {
        case 'today':
            whereClause = 'AND date(qa.created_at) = date("now")';
            orderBy = 'today_score DESC, u.score DESC';
            break;
        case 'week':
            whereClause = 'AND qa.created_at >= datetime("now", "-7 days")';
            orderBy = 'week_score DESC, u.score DESC';
            break;
        default:
            orderBy = 'u.score DESC';
    }
    
    const query = `
        SELECT 
            u.id,
            u.username,
            u.nickname,
            u.avatar,
            u.score,
            u.questions_answered,
            u.correct_answers,
            COALESCE(SUM(CASE WHEN date(qa.created_at) = date("now") THEN qa.score_earned ELSE 0 END), 0) as today_score,
            COALESCE(SUM(CASE WHEN qa.created_at >= datetime("now", "-7 days") THEN qa.score_earned ELSE 0 END), 0) as week_score
        FROM users u
        LEFT JOIN quiz_attempts qa ON u.id = qa.user_id ${whereClause}
        GROUP BY u.id
        ${type !== 'score' ? 'HAVING ' + (type === 'today' ? 'today_score > 0' : 'week_score > 0') : ''}
        ORDER BY ${orderBy}
        LIMIT ?
    `;
    
    db.all(query, [limit], (err, leaderboard) => {
        if (err) {
            console.error('查询排行榜失败:', err);
            return res.status(500).json({ success: false, message: '查询排行榜失败' });
        }
        
        // 如果用户已登录，查找其排名
        let myRanking = null;
        if (req.user && req.user.userId) {
            db.get(`
                SELECT rank FROM (
                    SELECT u.id, RANK() OVER (ORDER BY u.score DESC) as rank
                    FROM users u
                ) ranked WHERE id = ?
            `, [req.user.userId], (err, row) => {
                if (row) {
                    myRanking = { rank: row.rank };
                }
                
                res.json({
                    success: true,
                    data: {
                        leaderboard: leaderboard.map((user, index) => ({
                            ...user,
                            rank: index + 1
                        })),
                        myRanking,
                        type,
                        updateTime: new Date().toISOString()
                    }
                });
            });
        } else {
            res.json({
                success: true,
                data: {
                    leaderboard: leaderboard.map((user, index) => ({
                        ...user,
                        rank: index + 1
                    })),
                    myRanking: null,
                    type,
                    updateTime: new Date().toISOString()
                }
            });
        }
    });
});

/**
 * GET /api/activity/stats - 获取活跃度统计（用于趋势图）
 */
app.get('/api/activity/stats', (req, res) => {
    db.all(
        `SELECT * FROM activity_stats ORDER BY date DESC LIMIT 7`,
        [],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ success: false, message: '查询失败' });
            }
            res.json({ 
                success: true, 
                data: stats.reverse() // 按日期升序排列 
            });
        }
    );
});

// ==================== 默认路由 ====================

// 根路径重定向到主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 登录页面
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// ==================== 启动服务器 ====================

app.listen(PORT, () => {
    console.log('\n========================================');
    console.log(`🚀 服务器已启动！`);
    console.log(`   本地访问: http://localhost:${PORT}`);
    console.log(`   登录页面: http://localhost:${PORT}/login.html`);
    console.log(`========================================\n`);
});
