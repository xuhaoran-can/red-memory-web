/**
 * 数据库初始化脚本
 * 创建所有必要的表结构和初始数据
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'red_memory.db');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
        process.exit(1);
    }
    console.log('✅ 已连接到SQLite数据库:', DB_PATH);
});

// 启用外键约束
db.run('PRAGMA foreign_keys = ON');

// ==================== 创建表结构 ====================

db.serialize(() => {
    // 1. 用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nickname TEXT,
            avatar TEXT DEFAULT 'default.png',
            score INTEGER DEFAULT 50,
            total_earned INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            questions_answered INTEGER DEFAULT 0,
            correct_answers INTEGER DEFAULT 0,
            clues_purchased INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('❌ 创建users表失败:', err.message);
        else console.log('✅ users表创建成功');
    });

    // 2. 勋章定义表
    db.run(`
        CREATE TABLE IF NOT EXISTS medals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            description TEXT NOT NULL,
            unlock_condition TEXT
        )
    `, (err) => {
        if (err) console.error('❌ 创建medals表失败:', err.message);
        else console.log('✅ medals表创建成功');
        
        // 插入初始勋章数据
        const medals = [
            ['初识战役', '🎖️', '完成首次解密挑战', '答对第1题'],
            ['名将风采', '🏅', '了解战役指挥将领', '答对第3题'],
            ['战略眼光', '🔓', '理解战役重要意义', '答对第5题'],
            ['史料达人', '📚', '深入研究历史细节', '答对第7题'],
            ['线索猎人', '💡', '积极收集历史线索', '购买5条线索'],
            ['荣耀之星', '⭐', '完成全部挑战', '全部答对']
        ];
        
        const medalStmt = db.prepare('INSERT OR IGNORE INTO medals (name, icon, description, unlock_condition) VALUES (?, ?, ?, ?)');
        medals.forEach(medal => medalStmt.run(...medal));
        medalStmt.finalize();
        console.log('✅ 勋章初始数据插入完成');
    });

    // 3. 用户勋章关联表
    db.run(`
        CREATE TABLE IF NOT EXISTS user_medals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            medal_id INTEGER NOT NULL,
            unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (medal_id) REFERENCES medals(id),
            UNIQUE(user_id, medal_id)
        )
    `, (err) => {
        if (err) console.error('❌ 创建user_medals表失败:', err.message);
        else console.log('✅ user_medals表创建成功');
    });

    // 4. 积分变动记录表
    db.run(`
        CREATE TABLE IF NOT EXISTS score_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            type TEXT CHECK(type IN ('earn', 'spend')) NOT NULL,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error('❌ 创建score_history表失败:', err.message);
        else console.log('✅ score_history表创建成功');
    });

    // 5. 答题记录表
    db.run(`
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            user_answer TEXT,
            is_correct BOOLEAN NOT NULL,
            score_earned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error('❌ 创建quiz_attempts表失败:', err.message);
        else console.log('✅ quiz_attempts表创建成功');
    });

    // 6. 线索购买记录表
    db.run(`
        CREATE TABLE IF NOT EXISTS clue_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            clue_id INTEGER NOT NULL,
            cost INTEGER NOT NULL,
            purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error('❌ 创建clue_purchases表失败:', err.message);
        else console.log('✅ clue_purchases表创建成功');
    });

    // 7. 线索库表
    db.run(`
        CREATE TABLE IF NOT EXISTS clues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT,
            keywords TEXT
        )
    `, (err) => {
        if (err) console.error('❌ 创建clues表失败:', err.message);
        else {
            console.log('✅ clues表创建成功');
            
            // 插入初始线索数据
            const cluesData = [
                ['济南战役时间', '济南战役发生于1948年9月16日至24日，历时8天。这是解放战争时期的一次重要城市攻坚战役。', '历史事件', '济南 战役 1948 时间'],
                ['解放济南', '1948年9月24日，华东野战军攻克济南，歼敌10万余人。这次胜利揭开了人民解放军战略决战的序幕。', '重大胜利', '解放 华东野战军 攻克'],
                ['英雄人物', '济南战役中涌现出众多英雄模范，如"一级战斗英雄"王克勤等，他们用生命诠释了革命精神。', '人物故事', '英雄 模范 人物 王克勤'],
                ['战役指挥', '济南战役由粟裕将军指挥华东野战军实施，采用"攻济打援"的战略方针，展现了高超的军事指挥艺术。', '军事指挥', '指挥 粟裕 战略 攻济打援'],
                ['城防工事', '国民党军在济南构筑了坚固的城防工事，包括外壕、城墙、碉堡等多层防御体系，但最终被人民解放军突破。', '战争细节', '城防 工事 城墙 碉堡 防御'],
                ['群众支援', '济南战役得到了人民群众的广泛支援，数十万民工参与支前工作，运送物资、抢救伤员，为战役胜利做出重要贡献。', '民众支援', '群众 支援 民工 支前'],
                ['战后影响', '济南的解放使华北、华东两大解放区连成一片，为后续淮海战役、平津战役的胜利奠定了坚实基础。', '历史意义', '影响 解放区 淮海 平津'],
                ['纪念设施', '如今在济南建有济南战役纪念馆、解放阁等纪念设施，永远铭记这段光辉历史和革命先烈的英勇事迹。', '纪念场所', '纪念馆 解放阁 纪念 设施']
            ];
            
            const clueStmt = db.prepare('INSERT OR IGNORE INTO clues (title, content, category, keywords) VALUES (?, ?, ?, ?)');
            cluesData.forEach(clue => clueStmt.run(...clue));
            clueStmt.finalize();
            console.log('✅ 线索初始数据插入完成');
        }
    });

    // 8. 题目库表
    db.run(`
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_text TEXT NOT NULL,
            options TEXT,
            correct_answers TEXT,
            explanation TEXT NOT NULL,
            score INTEGER DEFAULT 10,
            medal_id INTEGER,
            order_index INTEGER
        )
    `, (err) => {
        if (err) console.error('❌ 创建questions表失败:', err.message);
        else {
            console.log('✅ questions表创建成功');
            
            // 插入初始题目数据
            const questionsData = [
                ['📜 问题1：济南战役发生在哪一年？\nA. 1946年  B. 1948年  C. 1950年', 'A,B,C', 'B', '✅ 回答正确！济南战役确实发生在1948年9月16日至24日。\n\n📖 历史背景：这是解放战争时期的重要战役，由华东野战军司令员粟裕指挥，历时8天攻克济南，歼灭国民党军10万余人。', 10, 1, 1],
                ['📜 问题2：济南战役历时多少天？\nA. 6天  B. 8天  C. 10天', 'A,B,C', 'B', '✅ 回答正确！济南战役从9月16日开始，到24日结束，共历时8天。\n\n📖 这8天的战斗异常激烈，人民解放军以顽强的意志突破了国民党军的坚固防线。', 10, null, 2],
                ['📜 问题3：济南战役的主要指挥将领是谁？\nA. 林彪  B. 粟裕  C. 刘伯承', 'A,B,C', 'B', '✅ 回答正确！济南战役的主要指挥官是粟裕将军。\n\n📖 粟裕(1907-1984)是中国杰出的军事家、战略家，被誉为"常胜将军"。他采用"攻济打援"的英明决策，指挥华东野战军取得了辉煌胜利。', 10, 2, 3],
                ['📜 问题4：济南战役中牺牲的英雄模范是谁？\nA. 王克勤  B. 黄继光  C. 董存瑞', 'A,B,C', 'A', '✅ 回答正确！王克勤是济南战役中涌现出的英雄模范。\n\n📖 王克勤(1927-1947)是华东野战军排长，在战斗中英勇顽强，被评为"一级战斗英雄"。他的事迹激励了无数战士奋勇杀敌。', 10, null, 4],
                ['📜 问题5：济南战役的重大意义是什么？\nA. 解放山东全境  B. 揭开决战序幕  C. 结束内战', 'A,B,C', 'B', '✅ 回答正确！济南战役揭开了人民解放军战略决战的序幕。\n\n📖 济南的解放具有重大战略意义：它使华北、华东两大解放区连成一片，打破了国民党的重点防御体系，为后续淮海战役、平津战役的胜利创造了有利条件。', 15, 3, 5],
                ['📜 问题6：济南解放后成立的政府是什么？\nA. 军事管制委员会  B. 人民政府  C. 革命委员会', 'A,B,C', 'A', '✅ 回答正确！济南解放后成立了军事管制委员会。\n\n📖 1948年9月27日，济南特别市军事管制委员会正式成立，由谭震林任主任。军管会负责维护社会秩序、恢复生产、建立革命秩序等重要工作。', 10, null, 6],
                ['📜 问题7：当时济南国民党守将王耀武的职务是什么？\nA. 第二绥靖区司令官  B. 山东省主席  C. 徐州剿总副总司令', 'A,B,C', 'B', '✅ 回答正确！王耀武当时的职务是山东省政府主席兼第二绥靖区司令官。\n\n📖 王耀武(1904-1968)是国民党陆军中将。济南战役中被俘后，经过教育改造，于1959年获特赦释放，后来担任全国政协委员，为新中国的建设做出了贡献。', 10, 4, 7],
                ['📜 问题8：哪个部队是济南战役的攻城先锋？\nA. 第九纵队  B. 第十纵队  C. 渤海纵队', 'A,B,C', 'A', '✅ 回答正确！第九纵队是济南战役的攻城先锋部队。\n\n📖 第九纵队在宋时轮司令员的指挥下，承担了主攻任务。战士们前赴后继、英勇作战，用鲜血和生命打开了胜利之门。他们的英勇事迹永载史册！', 10, null, 8]
            ];
            
            const questionStmt = db.prepare('INSERT OR IGNORE INTO questions (question_text, options, correct_answers, explanation, score, medal_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
            questionsData.forEach(q => questionStmt.run(...q));
            questionStmt.finalize();
            console.log('✅ 题目初始数据插入完成');
        }
    });

    // 9. 活跃度统计表（用于趋势图）
    db.run(`
        CREATE TABLE IF NOT EXISTS activity_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            active_users INTEGER DEFAULT 0,
            total_questions INTEGER DEFAULT 0,
            total_score_earned INTEGER DEFAULT 0,
            UNIQUE(date)
        )
    `, (err) => {
        if (err) console.error('❌ 创建activity_stats表失败:', err.message);
        else {
            console.log('✅ activity_stats表创建成功');
            
            // 插入最近7天的模拟活跃度数据
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const activeUsers = Math.floor(Math.random() * 300) + 200;
                const totalQuestions = Math.floor(Math.random() * 400) + 300;
                const totalScore = Math.floor(Math.random() * 5000) + 3000;
                
                db.run(
                    `INSERT OR IGNORE INTO activity_stats (date, active_users, total_questions, total_score_earned) VALUES (?, ?, ?, ?)`,
                    [dateStr, activeUsers, totalQuestions, totalScore]
                );
            }
            console.log('✅ 活跃度初始数据插入完成');
        }
    });

    // 创建索引以提高查询性能
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_medals_user_id ON user_medals(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_score_history_user_id ON score_history(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON quiz_attempts(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_clue_purchases_user_id ON clue_purchases(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC)`);

    console.log('\n========================================');
    console.log('🎉 数据库初始化完成！');
    console.log('   - 9张数据表已创建');
    console.log('   - 初始数据已导入');
    console.log('   - 索引已优化');
    console.log('========================================\n');

    // 延迟关闭数据库连接，确保所有异步操作完成
    setTimeout(() => {
        db.close((err) => {
            if (err) console.error('关闭数据库连接失败:', err.message);
            else console.log('✅ 数据库连接已关闭');
        });
    }, 1000); // 等待1秒让所有异步操作完成
});
