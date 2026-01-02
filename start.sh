#!/bin/bash

# TextCut 启动脚本
# 用法: ./start.sh [dev|prod|stop]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# PID 文件
PID_DIR="$PROJECT_DIR/.pids"
mkdir -p "$PID_DIR"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# 检查端口是否被占用
check_port() {
    if lsof -i :$1 &> /dev/null; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 等待服务启动
wait_for_service() {
    local port=$1
    local name=$2
    local max_wait=30
    local count=0
    
    while ! check_port $port; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $max_wait ]; then
            log_error "$name 启动超时"
            return 1
        fi
    done
    log_success "$name 已启动 (端口 $port)"
}

# 检查依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    check_command python3
    check_command node
    check_command npm
    check_command redis-server
    check_command ffmpeg
    
    log_success "系统依赖检查通过"
}

# 安装 Python 依赖
setup_backend() {
    log_info "设置后端环境..."
    
    cd "$BACKEND_DIR"
    
    # 创建虚拟环境
    if [ ! -d "venv" ]; then
        log_info "创建 Python 虚拟环境..."
        python3 -m venv venv
    fi
    
    # 激活虚拟环境并安装依赖
    source venv/bin/activate
    
    log_info "安装 Python 依赖..."
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # 检查 .env 文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warn "已从 .env.example 创建 .env 文件，请编辑填入真实的 API 密钥"
        else
            log_error "缺少 .env 文件，请创建"
            exit 1
        fi
    fi
    
    # 创建 storage 目录
    mkdir -p storage/videos storage/audio storage/renders
    
    # 初始化数据库
    log_info "初始化数据库..."
    python init_db.py
    
    log_success "后端环境设置完成"
}

# 安装前端依赖
setup_frontend() {
    log_info "设置前端环境..."
    
    cd "$FRONTEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        log_info "安装 Node.js 依赖..."
        npm install
    fi
    
    log_success "前端环境设置完成"
}

# 启动 Redis
start_redis() {
    if check_port 6379; then
        log_info "Redis 已在运行"
    else
        log_info "启动 Redis..."
        redis-server --daemonize yes
        wait_for_service 6379 "Redis"
    fi
}

# 启动后端 API
start_backend() {
    cd "$BACKEND_DIR"
    source venv/bin/activate
    
    if check_port 8000; then
        log_warn "端口 8000 已被占用，尝试停止旧进程..."
        lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    log_info "启动后端 API 服务..."
    nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$PID_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    wait_for_service 8000 "后端 API"
}

# 启动 Celery Worker
start_celery() {
    cd "$BACKEND_DIR"
    source venv/bin/activate
    
    log_info "启动 Celery Worker..."
    nohup python start_celery.py > "$PID_DIR/celery.log" 2>&1 &
    echo $! > "$PID_DIR/celery.pid"
    sleep 2
    log_success "Celery Worker 已启动"
}

# 启动前端
start_frontend() {
    cd "$FRONTEND_DIR"
    
    if check_port 5173; then
        log_warn "端口 5173 已被占用，尝试停止旧进程..."
        lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    log_info "启动前端开发服务器..."
    nohup npm run dev > "$PID_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"
    wait_for_service 5173 "前端"
}

# 停止所有服务
stop_all() {
    log_info "停止所有服务..."
    
    # 停止前端
    if [ -f "$PID_DIR/frontend.pid" ]; then
        kill $(cat "$PID_DIR/frontend.pid") 2>/dev/null || true
        rm "$PID_DIR/frontend.pid"
    fi
    lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    
    # 停止后端
    if [ -f "$PID_DIR/backend.pid" ]; then
        kill $(cat "$PID_DIR/backend.pid") 2>/dev/null || true
        rm "$PID_DIR/backend.pid"
    fi
    lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    
    # 停止 Celery
    if [ -f "$PID_DIR/celery.pid" ]; then
        kill $(cat "$PID_DIR/celery.pid") 2>/dev/null || true
        rm "$PID_DIR/celery.pid"
    fi
    pkill -f "celery.*textcut" 2>/dev/null || true
    pkill -f "start_celery.py" 2>/dev/null || true
    
    log_success "所有服务已停止"
}

# 显示状态
show_status() {
    echo ""
    echo "========================================="
    echo "         TextCut 服务状态"
    echo "========================================="
    
    if check_port 6379; then
        echo -e "Redis:        ${GREEN}运行中${NC} (端口 6379)"
    else
        echo -e "Redis:        ${RED}未运行${NC}"
    fi
    
    if check_port 8000; then
        echo -e "后端 API:     ${GREEN}运行中${NC} (端口 8000)"
    else
        echo -e "后端 API:     ${RED}未运行${NC}"
    fi
    
    if pgrep -f "celery.*worker" > /dev/null || pgrep -f "start_celery.py" > /dev/null; then
        echo -e "Celery:       ${GREEN}运行中${NC}"
    else
        echo -e "Celery:       ${RED}未运行${NC}"
    fi
    
    if check_port 5173; then
        echo -e "前端:         ${GREEN}运行中${NC} (端口 5173)"
    else
        echo -e "前端:         ${RED}未运行${NC}"
    fi
    
    echo "========================================="
    echo ""
}

# 开发模式启动
start_dev() {
    log_info "以开发模式启动 TextCut..."
    echo ""
    
    check_dependencies
    setup_backend
    setup_frontend
    
    echo ""
    log_info "启动服务..."
    
    start_redis
    start_backend
    start_celery
    start_frontend
    
    show_status
    
    echo -e "访问地址: ${GREEN}http://localhost:5173${NC}"
    echo -e "API 文档: ${GREEN}http://localhost:8000/docs${NC}"
    echo ""
    echo "查看日志:"
    echo "  后端: tail -f $PID_DIR/backend.log"
    echo "  Celery: tail -f $PID_DIR/celery.log"
    echo "  前端: tail -f $PID_DIR/frontend.log"
    echo ""
    echo "停止服务: ./start.sh stop"
}

# 主函数
main() {
    case "${1:-dev}" in
        dev)
            start_dev
            ;;
        stop)
            stop_all
            ;;
        status)
            show_status
            ;;
        restart)
            stop_all
            sleep 2
            start_dev
            ;;
        *)
            echo "用法: $0 [dev|stop|status|restart]"
            echo ""
            echo "命令:"
            echo "  dev      开发模式启动 (默认)"
            echo "  stop     停止所有服务"
            echo "  status   查看服务状态"
            echo "  restart  重启所有服务"
            exit 1
            ;;
    esac
}

main "$@"
