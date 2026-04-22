/**
 * 红色记忆——济南英雄风云录 - Express后端服务器 (Vercel 优化版)
 * 
 * 功能：
 * 1. 用户认证系统（注册/登录/JWT）
 * 2. 游戏数据API（积分/勋章/线索/排行榜）
 * 3. 静态文件服务
 * 
 * 支持：
 * - SQLite 数据库（本地开发）
 * - JSON 文件存储（Vercel/Serverless部署）
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ==================== 配置 ====================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'red-memory-secret-key-2026';
const USE_JSON_STORE = process.env.USE_JSON_STORE === 'true' || !process.env.SQLITE_PATH;

// 选择数据存储方式
let db; // SQLite 实例
let store; // JSON 存储实例

if (!USE_JSON_STORE) {
    // 使用 SQLite
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'database', 'red_memory.db');
    
    // 确保数据库目录存在
    const fs = require('fs');
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('❌ 数据库连接失败:', err.message);
            // 如果SQLite失败，回退到JSON存储
            console.log('⚠️ 回退到JSON文件存储...');
            useJSONStore();
        } else {
            console.log('✅ 已连接到SQLite数据库');
        }
    });
    
    if (db) {
        db.run('PRAGMA foreign_keys = ON');
    }
} else {
    useJSONStore();
}

function useJSONStore() {
    try {
        store = require('./data-store');
        console.log('✅ 已切换到JSON文件存储模式');
        console.log(`📁 数据目录: ${process.env.USE_JSON_STORE === 'true' ? '/tmp/data (Vercel)' : './data (本地)'}`);
        USE_JSON_STORE = true;
    } catch (error) {
        console.error('❌ 加载数据存储模块失败:', error.message);
        console.error(error.stack);
    }
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 必须在API路由之前
const staticPath = path.join(__dirname);
app.use(express.static(staticPath));
console.log(`📂 静态文件目录: ${staticPath}`);

// 根路径 - 返回主页
app.get('/', (req, res) => {
    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ 
            message: '🎉 红色记忆——济南英雄风云录 API服务器正在运行！',
            status: 'online',
            timestamp: new Date().toISOString(),
            environment: USE_JSON_STORE ? 'Vercel (JSON存储)' : '本地开发 (SQLite)'
        });
    }
});

// ==================== JWT认证中间件 ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
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
        
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ success: false, message: '用户名长度应在3-20个字符之间' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: '密码长度至少6个字符' });
        }
        
        if (USE_JSON_STORE && store) {
            // JSON存储模式
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = store.createUser({ username, password: hashedPassword, nickname });
            
            if (!result.success) {
                return res.status(409).json(result);
            }
            
            // 生成JWT
            const token = jwt.sign(
                { userId: result.user.id, username: result.user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            return res.status(201).json({
                success: true,
                message: '注册成功',
                data: { token, user: result.user }
            });
        } else {
            // SQLite模式
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.get('SELECT id FROM users WHERE username = ?', [username], async (err, user) => {
                if (err) {
                    return res.status(500).json({ success: false, message: '数据库查询错误' });
                }
                
                if (user) {
                    return res.status(409).json({ success: false, message: '用户名已存在' });
                }
                
                db.run(
                    `INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)`,
                    [username, hashedPassword, nickname || username],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ success: false, message: '创建用户失败' });
                        }
                        
                        const token = jwt.sign(
                            { userId: this.lastID, username },
                            JWT_SECRET,
                            { expiresIn: '24h' }
                        );
                        
                        res.status(201).json({
                            success: true,
                            message: '注册成功',
                            data: { userId: this.lastID, username }
                        });
                    }
                );
            });
        }
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
            return res.status(400).json({ success: false, message: '请输入用户名和密码' });
        }
        
        if (USE_JSON_STORE && store) {
            // JSON存储模式
            const user = store.findUserByUsername(username);
            
            if (!user) {
                return res.status(401).json({ success: false, message: '用户名或密码错误' });
            }
            
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ success: false, message: '用户名或密码错误' });
            }
            
            store.updateLastLogin(user.id);
            
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            const { password: _, ...safeUser } = user;
            
            res.json({
                success: true,
                message: '登录成功',
                data: { token, user: safeUser }
            });
        } else {
            // SQLite模式
            db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
                if (err || !user) {
                    return res.status(401).json({ success: false, message: '用户名或密码错误' });
                }
                
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    return res.status(401).json({ success: false, message: '用户名或密码错误' });
                }
                
                db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                
                const token = jwt.sign(
                    { userId: user.id, username: user.username },
                    JWT_SECRET,
                    { expiresIn: '24h' }
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
            });
        }
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

/**
 * GET /api/auth/me - 获取当前用户信息
 */
app.get('/api/auth/me', authenticateToken, (req, res) => {
    if (USE_JSON_STORE && store) {
        const user = store.findUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        const { password, ...safeUser } = user;
        res.json({ success: true, data: safeUser });
    } else {
        db.get(
            'SELECT id, username, nickname, avatar, score, total_earned, total_spent, questions_answered, correct_answers, clues_purchased FROM users WHERE id = ?',
            [req.user.userId],
            (err, user) => {
                if (err || !user) {
                    return res.status(404).json({ success: false, message: '用户不存在' });
                }
                res.json({ success: true, data: user });
            }
        );
    }
});

// ==================== 积分系统 API ====================

app.get('/api/user/score', authenticateToken, (req, res) => {
    if (USE_JSON_STORE && store) {
        const user = store.findUserById(req.user.userId);
        res.json({ success: true, data: { score: user?.score || 0 } });
    } else {
        db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
            res.json({ success: true, data: { score: row?.score || 0 } });
        });
    }
});

app.post('/api/user/score/add', authenticateToken, (req, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '积分数量无效' });
    }
    
    if (USE_JSON_STORE && store) {
        const result = store.updateUserScore(req.user.userId, amount, 'add');
        res.json({
            success: true,
            message: `+${amount}积分 ${reason || ''}`,
            data: { newScore: result.newScore, added: amount }
        });
    } else {
        db.run(`UPDATE users SET score = score + ?, total_earned = total_earned + ? WHERE id = ?`, [amount, amount, req.user.userId], function(err) {
            if (err) return res.status(500).json({ success: false, message: '更新积分失败' });
            
            db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
                res.json({ success: true, message: `+${amount}积分`, data: { newScore: row.score, added: amount } });
            });
        });
    }
});

app.post('/api/user/score/deduct', authenticateToken, (req, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '积分数量无效' });
    }
    
    if (USE_JSON_STORE && store) {
        const result = store.updateUserScore(req.user.userId, amount, 'deduct');
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json({
            success: true,
            message: `-${amount}积分 ${reason || ''}`,
            data: { newScore: result.newScore, deducted: amount }
        });
    } else {
        db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
            if (err || !row || row.score < amount) {
                return res.status(400).json({ success: false, message: `积分不足！需要${amount}分，当前仅${row?.score || 0}分` });
            }
            
            db.run(`UPDATE users SET score = score - ?, total_spent = total_spent + ? WHERE id = ?`, [amount, amount, req.user.userId], function(err) {
                db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, newRow) => {
                    res.json({ success: true, message: `-${amount}积分`, data: { newScore: newRow.score, deducted: amount } });
                });
            });
        });
    }
});

// ==================== 勋章 API ====================

app.get('/api/medals', authenticateToken, (req, res) => {
    if (USE_JSON_STORE && store) {
        const medalsData = store.getUserMedals(req.user.userId);
        res.json({ success: true, data: medalsData });
    } else {
        // SQLite模式的简化实现
        const allMedals = [
            { id: 1, name: '初识战役', icon: '🎖️', description: '完成首次解密挑战', unlocked: false },
            { id: 2, name: '名将风采', icon: '🏅', description: '了解战役指挥将领', unlocked: false },
            { id: 3, name: '战略眼光', icon: '🔓', description: '理解战役重要意义', unlocked: false },
            { id: 4, name: '史料达人', icon: '📚', description: '深入研究历史细节', unlocked: false },
            { id: 5, name: '线索猎人', icon: '💡', description: '积极收集历史线索', unlocked: false },
            { id: 6, name: '荣耀之星', icon: '⭐', description: '完成全部挑战', unlocked: false }
        ];
        
        res.json({
            success: true,
            data: {
                medals: allMedals,
                unlockedCount: 0,
                totalCount: allMedals.length,
                progress: 0
            }
        });
    }
});

app.post('/api/medals/:id/unlock', authenticateToken, (req, res) => {
    const medalId = parseInt(req.params.id);
    
    if (USE_JSON_STORE && store) {
        const success = store.unlockUserMedal(req.user.userId, medalId);
        res.json({
            success: true,
            message: success ? '🎉 恭喜解锁新勋章！' : '该勋章已解锁'
        });
    } else {
        res.json({ success: true, message: '🎉 勋章已记录' });
    }
});

// ==================== 题目和答题 API ====================

app.get('/api/questions', authenticateToken, (req, res) => {
    if (USE_JSON_STORE && store) {
        res.json({ success: true, data: store.getQuestions() });
    } else {
        db.all('SELECT * FROM questions ORDER BY order_index', [], (err, questions) => {
            res.json({ success: true, data: questions || [] });
        });
    }
});

app.post('/api/questions/:id/answer', authenticateToken, (req, res) => {
    const questionId = parseInt(req.params.id);
    const { answer } = req.body;
    
    if (!answer) {
        return res.status(400).json({ success: false, message: '请提供答案' });
    }
    
    if (USE_JSON_STORE && store) {
        const questions = store.getQuestions();
        const question = questions.find(q => q.id === questionId);
        
        if (!question) {
            return res.status(404).json({ success: false, message: '题目不存在' });
        }
        
        const correctAnswers = question.correct_answers.split(',').map(a => a.trim().toLowerCase());
        const isCorrect = correctAnswers.includes(answer.trim().toLowerCase());
        
        const result = store.recordQuizAttempt(req.user.userId, questionId, answer, isCorrect, isCorrect ? question.score : 0);
        
        // 如果答对且有勋章奖励，自动解锁
        if (isCorrect && question.medal_id) {
            setTimeout(() => store.unlockUserMedal(req.user.userId, question.medal_id), 1000);
        }
        
        res.json({
            success: true,
            data: {
                isCorrect: result.isCorrect,
                scoreEarned: result.scoreEarned,
                explanation: question.explanation,
                medalUnlocked: isCorrect && !!question.medal_id
            },
            message: isCorrect ? '✅ 回答正确！' : '❌ 回答错误'
        });
    } else {
        // SQLite模式
        db.get('SELECT * FROM questions WHERE id = ?', [questionId], (err, question) => {
            if (err || !question) {
                return res.status(404).json({ success: false, message: '题目不存在' });
            }
            
            const correctAnswers = question.correct_answers.split(',').map(a => a.trim().toLowerCase());
            const isCorrect = correctAnswers.includes(answer.trim().toLowerCase());
            
            db.run(
                `INSERT INTO quiz_attempts (user_id, question_id, user_answer, is_correct, score_earned) VALUES (?, ?, ?, ?, ?)`,
                [req.user.userId, questionId, answer, isCorrect, isCorrect ? question.score : 0],
                () => {
                    res.json({
                        success: true,
                        data: { isCorrect, scoreEarned: isCorrect ? question.score : 0, explanation: question.explanation },
                        message: isCorrect ? '✅ 回答正确！' : '❌ 回答错误'
                    });
                }
            );
        });
    }
});

// ==================== 线索 API ====================

app.get('/api/clues', (req, res) => {
    const search = req.query.search || '';
    
    if (USE_JSON_STORE && store) {
        res.json({ success: true, data: store.getClues(search) });
    } else {
        let query = 'SELECT * FROM clues';
        let params = [];
        
        if (search) {
            query += ' WHERE title LIKE ? OR content LIKE ?';
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam];
        }
        
        db.all(query + ' ORDER BY id', params, (err, clues) => {
            res.json({ success: true, data: clues || [] });
        });
    }
});

app.post('/api/clues/purchase', authenticateToken, (req, res) => {
    if (USE_JSON_STORE && store) {
        const result = store.purchaseClue(req.user.userId);
        res.json(result);
    } else {
        // SQLite简化版
        const cost = 10;
        
        db.get('SELECT score FROM users WHERE id = ?', [req.user.userId], (err, row) => {
            if (err || !row || row.score < cost) {
                return res.status(400).json({ success: false, message: '积分不足！需要10分' });
            }
            
            const clue = { id: Math.floor(Math.random() * 8) + 1, title: '随机历史线索', content: '这是一条关于济南战役的历史线索...' };
            
            db.run('UPDATE users SET score = score - ? WHERE id = ?', [cost, req.user.userId]);
            
            res.json({ success: true, message: '🎉 成功获取新线索！', data: clue });
        });
    }
});

// ==================== 排行榜 API ⭐核心功能 ====================

app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || 'score';
    
    if (USE_JSON_STORE && store) {
        const leaderboardData = store.getLeaderboard(limit, type);
        res.json({ success: true, data: leaderboardData });
    } else {
        // SQLite模式
        let orderBy = 'u.score DESC';
        
        db.all(`
            SELECT u.id, u.username, u.nickname, u.avatar, u.score, u.questions_answered, u.correct_answers
            FROM users u
            WHERE u.questions_answered > 0
            ORDER BY ${orderBy}
            LIMIT ?
        `, [limit], (err, leaderboard) => {
            const leaderboardWithRank = (leaderboard || []).map((user, index) => ({
                ...user,
                rank: index + 1
            }));
            
            res.json({
                success: true,
                data: {
                    leaderboard: leaderboardWithRank,
                    myRanking: null,
                    type,
                    updateTime: new Date().toISOString()
                }
            });
        });
    }
});

// ==================== 活跃度统计 API ====================

app.get('/api/activity/stats', (req, res) => {
    if (USE_JSON_STORE && store) {
        res.json({ success: true, data: store.getActivityStats() });
    } else {
        db.all('SELECT * FROM activity_stats ORDER BY date DESC LIMIT 7', [], (err, stats) => {
            res.json({ success: true, data: (stats || []).reverse() });
        });
    }
});

// ==================== 启动服务器 ====================

console.log('\n========================================');
console.log('🚀 红色记忆——济南英雄风云录 服务器');
console.log(`   环境: ${process.env.NODE_ENV || 'development'}`);
console.log(`   数据存储: ${USE_JSON_STORE ? 'JSON文件 (Vercel/Serverless)' : 'SQLite数据库'}`);
console.log('========================================\n');

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ 本地服务器已启动: http://localhost:${PORT}`);
        console.log(`   登录页面: http://localhost:${PORT}/login.html`);
    });
}

// 导出 Express app (供 Vercel 使用)
module.exports = app;
