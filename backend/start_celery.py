#!/usr/bin/env python
"""
Celery 启动脚本 - 在导入任何模块前 patch torch.load
"""
import sys
import os

# 设置环境变量
os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"

# 在导入 torch 之前，先 patch 它
import torch

# 保存原始的 torch.load
_original_load = torch.load

def _patched_load(*args, **kwargs):
    """强制使用 weights_only=False"""
    kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)

# 替换 torch.load
torch.load = _patched_load

# 现在可以安全地导入其他模块
if __name__ == "__main__":
    from celery.__main__ import main
    sys.exit(main())
