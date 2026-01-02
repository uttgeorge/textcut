# TextCut - AI 视频剪辑助手

TextCut 是一款基于 **"文稿即剪辑"** 理念的 AI 视频编辑工具。通过自动转录和 AI 理解，让你像编辑 Word 文档一样编辑视频。

## 功能特性

- **自动转录**：上传视频后自动生成带时间戳的文稿（基于 WhisperX）
- **文稿编辑**：删除文字 = 删除视频片段，所见即所得
- **AI 剪辑**：通过自然语言指令完成剪辑（如"删除静音"、"提取精华"、"做一个鬼畜视频"）
- **实时预览**：剪辑后直接在时间线上预览效果
- **导出支持**：导出 XML 工程文件（兼容 Premiere/Final Cut Pro）

## 技术栈

**后端**
- Python 3.10+
- FastAPI
- PostgreSQL
- Redis + Celery
- WhisperX（语音转文字）
- DeepSeek（AI 剪辑）
- FFmpeg（视频处理）

**前端**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand（状态管理）
- Wavesurfer.js（波形显示）

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- FFmpeg

### 1. 克隆项目

```bash
git clone <repository-url>
cd TextCut
```

### 2. 后端配置

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件，填入你的配置
# - DATABASE_URL: PostgreSQL 连接地址
# - REDIS_URL: Redis 连接地址
# - DEEPSEEK_API_KEY: DeepSeek API 密钥
# - HF_TOKEN: HuggingFace Token（用于说话人分离模型）
```

### 3. 数据库初始化

```bash
# 确保 PostgreSQL 已启动，并创建数据库
createdb textcut

# 初始化数据库表
python init_db.py
```

### 4. 前端配置

```bash
cd ../frontend

# 安装依赖
npm install
```

### 5. 启动服务

需要启动 4 个服务：

**终端 1 - Redis**（如果未作为系统服务运行）
```bash
redis-server
```

**终端 2 - 后端 API**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**终端 3 - Celery Worker**（处理转录任务）
```bash
cd backend
source venv/bin/activate
python start_celery.py worker -l info -P solo
```

**终端 4 - 前端**
```bash
cd frontend
npm run dev
```

### 6. 访问应用

打开浏览器访问 http://localhost:5173

## 环境变量说明

### 后端 (.env)

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接地址 | `postgresql+asyncpg://postgres:postgres@localhost:5432/textcut` |
| `REDIS_URL` | Redis 连接地址 | `redis://localhost:6379/0` |
| `USE_LOCAL_STORAGE` | 是否使用本地存储 | `true` |
| `LOCAL_STORAGE_PATH` | 本地存储路径 | `./storage` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `sk-xxx` |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 使用的模型 | `deepseek-chat` |
| `WHISPERX_MODEL` | WhisperX 模型 | `large-v2` |
| `WHISPERX_DEVICE` | 运行设备 | `cpu` 或 `cuda` |
| `HF_TOKEN` | HuggingFace Token | `hf_xxx` |
| `CELERY_BROKER_URL` | Celery Broker | `redis://localhost:6379/1` |
| `CELERY_RESULT_BACKEND` | Celery Backend | `redis://localhost:6379/2` |

## 项目结构

```
TextCut/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 配置管理
│   │   ├── database.py       # 数据库连接
│   │   ├── models.py         # SQLAlchemy 模型
│   │   ├── schemas.py        # Pydantic 模式
│   │   ├── routers/          # API 路由
│   │   │   ├── projects.py   # 项目管理
│   │   │   ├── ai.py         # AI 剪辑
│   │   │   └── export.py     # 导出功能
│   │   ├── services/         # 业务逻辑
│   │   │   ├── ai_agent.py   # AI 剪辑代理
│   │   │   └── export_service.py
│   │   └── tasks/            # Celery 任务
│   │       └── transcribe.py # 转录任务
│   ├── storage/              # 本地文件存储
│   ├── requirements.txt
│   ├── start_celery.py       # Celery 启动脚本
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/       # React 组件
│   │   │   ├── editor/       # 编辑器组件
│   │   │   └── ...
│   │   ├── pages/            # 页面
│   │   ├── store/            # Zustand 状态
│   │   ├── lib/              # 工具函数
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## 使用指南

### 1. 创建项目并上传视频

1. 点击"新建项目"
2. 上传 MP4/MOV 格式视频
3. 等待转录完成（约为视频时长的 1/6）

### 2. 编辑文稿

- **删除片段**：选中文字后按 Delete 键
- **恢复片段**：点击已删除（灰色）的文字
- **定位播放**：点击任意文字跳转到对应时间点

### 3. AI 剪辑

在 AI 面板输入指令，例如：
- "删除所有静音片段"
- "提取最精彩的30秒内容"
- "做一个鬼畜视频，把有节奏感的句子重复几次"

AI 会自动分析文稿内容，选择合适的时间段进行剪辑。

### 4. 预览与导出

- 点击播放按钮预览剪辑效果
- 点击"导出"下载 XML 工程文件

## 常见问题

### Q: 转录速度很慢？
A: 首次运行需要下载 WhisperX 模型（约 3GB）。如果有 NVIDIA GPU，可以在 `.env` 中设置 `WHISPERX_DEVICE=cuda` 加速。

### Q: AI 剪辑没有响应？
A: 检查 `DEEPSEEK_API_KEY` 是否正确配置，以及网络是否能访问 DeepSeek API。

### Q: 视频播放卡顿？
A: 建议使用 H.264 编码的 MP4 文件，其他格式可能需要转码。

### Q: 说话人分离不工作？
A: 需要在 [HuggingFace](https://huggingface.co/pyannote/speaker-diarization-3.1) 同意模型使用协议，并配置 `HF_TOKEN`。

## 开发说明

### 运行测试

```bash
# 后端测试
cd backend
pytest

# 前端测试
cd frontend
npm test
```

### 代码检查

```bash
# 前端 lint
cd frontend
npm run lint
```

## License

MIT License
