# 🚀 红色记忆网页 - 云端部署完整指南

## 📍 您的网站地址（部署后）

**主站地址**: `https://red-memory-web.onrender.com`  
**登录页面**: `https://red-memory-web.onrender.com/login.html`

---

## 💾 数据库位置说明

### 数据库类型: **SQLite (文件型数据库)**

#### 📂 本地开发环境:
```
项目目录/database/red_memory.db
```
- **位置**: 您的电脑上 `f:\桌面\大二作业\自己做的作品\ai对话网页\database\red_memory.db`
- **特点**: 所有数据保存在这个文件中，包括：
  - 用户账号信息
  - 积分记录
  - 勋章解锁状态
  - 答题历史
  - 排行榜数据
  - 线索购买记录

#### ☁️ 云端环境 (Render):
```
/opt/render/project/src/database/red_memory.db
```
- **位置**: Render 服务器的文件系统
- **⚠️ 重要提示**: 
  - 免费版 Render 每次重启可能会重置数据库
  - 数据会保留到下次部署前
  - **建议**: 定期导出数据库备份

#### 🔒 如何备份数据库:
1. **本地备份**: 直接复制 `red_memory.db` 文件即可
2. **云端备份**: 通过 Render Shell 访问服务器下载
3. **查看数据**: 使用 DB Browser for SQLite 工具打开 .db 文件

---

## 📦 部署方式一：GitHub + Render 自动部署（推荐）

### 步骤 1: 初始化 Git 仓库
```bash
cd "f:\桌面\大二作业\自己做的作品\ai对话网页"
git init
git add .
git commit -m "Initial commit: Red Memory Web App"
```

### 步骤 2: 推送到 GitHub
1. 访问 https://github.com/new
2. 创建新仓库，名称：`red-memory-web`（选择 Private 或 Public）
3. 按照提示执行：
```bash
git remote add origin https://github.com/你的用户名/red-memory-web.git
git push -u origin main
```

### 步骤 3: 在 Render 部署
1. 访问 https://dashboard.render.com
2. 点击 **"New +"** → **"Web Service"**
3. 选择 **"Connect GitHub repository"**
4. 选择 `red-memory-web` 仓库
5. 配置如下：

**Build Settings:**
- Runtime: `Node`
- Build Command: `npm install && npm run init-db`
- Start Command: `node server.js`

**Environment Variables (可选):**
- `PORT`: `10000`
- `JWT_SECRET`: `your-custom-secret-key-here`

6. 点击 **"Deploy Web Service"**
7. 等待 2-3 分钟构建完成
8. ✅ 获得公网访问地址！

---

## 📦 部署方式二：使用 Render CLI 快速部署

### 安装 Render CLI
```bash
npm install -g render-cli
```

### 登录并部署
```bash
# 登录 Render（会打开浏览器授权）
render login

# 部署当前目录
render deploy --env prod
```

---

## 🌐 其他云平台部署方案

### 方案 A: Vercel (适合纯前端)
```bash
# 注意：Vercel 不支持 Node.js 后端，需要改为静态版本
# 或者使用 Vercel Serverless Functions
vercel --prod
```

### 方案 B: Railway (推荐)
1. 访问 https://railway.app
2. 导入 GitHub 仓库
3. 自动检测 Node.js 项目
4. 部署完成获得公网地址

### 方案 C: Glitch (最简单)
1. 访问 https://glitch.com
2. 点击 "New Project"
3. "Import from GitHub"
4. 输入仓库地址
5. 自动部署，获得 `xxx.glitch.me` 地址

### 方案 D: Replit (在线IDE+部署)
1. 访问 https://replit.com
2. Create Repl → Import from GitHub
3. 运行后获得公网访问链接

---

## 🔧 部署后配置清单

### ✅ 必须检查项:
- [ ] 能否正常访问主页？
- [ ] 登录页面是否显示？
- [ ] 注册新用户是否成功？
- [ ] 登录后能否进入主界面？
- [ ] 答题功能是否正常？
- [ ] 积分是否正确增减？
- [ ] 排行榜是否显示真实数据？

### ⚙️ 环境变量配置:
| 变量名 | 说明 | 默认值 | 建议 |
|--------|------|--------|------|
| PORT | 服务端口 | 3000 | 云平台自动设置 |
| JWT_SECRET | 加密密钥 | 默认值 | 生产环境务必修改！ |
| NODE_ENV | 运行环境 | undefined | 设置为 'production' |

---

## 🐛 常见问题解决

### Q1: 部署后数据库是空的？
**A**: 这是正常的！云端是全新的实例，需要重新注册账号。本地数据库不会同步到云端。

### Q2: 如何将本地数据迁移到云端？
**A**: 
1. 导出本地数据库: 复制 `database/red_memory.db`
2. 上传到 Render: 使用 Render Shell 或 Deploy Hook
3. 替换云端数据库文件

### Q3: 免费版的限制是什么？
**A**: 
- Render免费版: 750小时/月，足够个人使用
- 每次部署后15分钟无访问会休眠
- 休眠后再访问会有几秒启动时间
- 数据在重启后会保留（SQLite文件）

### Q4: 如何绑定自定义域名？
**A**:
1. 在 Render Dashboard 选择你的服务
2. Settings → Custom Domains
3. 添加你的域名（如 `www.yourdomain.com`）
4. 在域名DNS添加CNAME指向 Render

### Q5: 如何更新网站？
**A**:
```bash
# 修改代码后
git add .
git commit -m "Update: 新功能"
git push
# Render 会自动重新部署！
```

---

## 📊 监控和维护

### 查看日志:
Render Dashboard → Your Service → Logs

### 查看指标:
- 访问量
- 响应时间
- 错误率
- 内存使用

### 自动备份:
建议定期通过 Render Shell 执行:
```bash
cp /opt/render/project/src/database/red_memory.db /backup/red-memory-$(date +%Y%m%d).db
```

---

## 🎯 性能优化建议

### 1. 启用 Gzip 压缩
在 `server.js` 添加:
```javascript
const compression = require('compression');
app.use(compression());
```
安装依赖: `npm install compression`

### 2. 设置缓存头
```javascript
app.use(express.static(path.join(__dirname), {
    maxAge: '1d', // 缓存静态资源1天
    etag: true
}));
```

### 3. 使用 PM2 进程管理 (生产环境推荐)
```bash
# 安装 PM2
npm install pm2 -g

# 启动应用
pm2 start server.js --name "red-memory"

# 开机自启
pm2 startup
pm2 save
```

---

## 🔐 安全检查清单

- [x] 密码使用 bcrypt 加密存储
- [x] JWT 令牌认证
- [x] XSS 防护（输入转义）
- [ ] HTTPS 已启用（Render 自动提供）
- [ ] CORS 已配置
- [ ] Rate Limiting 限流（防止暴力破解）- 可选增强
- [ ] Helmet 安全头 - 可选增强

---

## 📞 技术支持

遇到部署问题？
1. 查看 Render 日志: Dashboard → Your Service → Logs
2. 检查构建日志: Deployments → Latest → Build Logs
3. 社区支持: https://community.render.com
4. 文档: https://render.com/docs

---

## ✨ 部署成功标志

当您看到以下内容时，说明部署成功：

```
✅ 网站可以通过公网IP或域名访问
✅ 注册/登录功能正常
✅ 所有API接口返回200状态码
✅ 数据库读写正常
✅ 页面加载速度 < 3秒
✅ 移动端适配良好
```

**🎉 恭喜！您的红色记忆网站已成功上线，全世界都可以访问了！**

---

## 📝 维护提醒

### 定期任务:
- [ ] 每周检查一次错误日志
- [ ] 每月备份一次数据库
- [ ] 及时更新依赖包 (`npm update`)
- [ ] 监控流量和性能

### 更新流程:
```bash
# 1. 本地测试
npm test (如果有)

# 2. 提交代码
git add . && git commit -m "Update description"

# 3. 推送到 GitHub
git push

# 4. Render 自动部署（约2分钟）

# 5. 验证功能
curl https://your-site.onrender.com/api/leaderboard
```

---

**🚀 现在就按照上述步骤开始部署吧！如有问题随时询问。**
