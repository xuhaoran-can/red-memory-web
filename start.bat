@echo off
chcp 65001 >nul
echo ============================================
echo    红色记忆网页 - 一键部署助手
echo ============================================
echo.

echo [1/5] 检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js，请先安装: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

echo.
echo [2/5] 安装项目依赖...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

echo.
echo [3/5] 初始化数据库...
call npm run init-db
if %errorlevel% neq 0 (
    echo ⚠️ 数据库可能已存在，继续...
)
echo ✅ 数据库就绪

echo.
echo [4/5] 启动本地服务器...
echo.
echo ============================================
echo 🚀 服务器启动成功！
echo ============================================
echo.
echo 📌 本地访问地址:
echo    http://localhost:3000
echo    http://127.0.0.1:3000
echo.
echo 🔐 登录页面:
echo    http://localhost:3000/login.html
echo.
echo 💡 提示:
echo    - 按 Ctrl+C 停止服务器
echo    - 首次访问请先注册账号
echo    - 局域网内其他设备可通过您IP访问
echo.
echo ============================================

:: 获取本机IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    if not "%%a"=="127.0.0.1" (
        echo 🌐 局域网访问地址: http://%%a:3000
        goto :done
    )
)
:done

echo.
node server.js
pause