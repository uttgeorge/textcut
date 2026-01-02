import os
import aiofiles
from pathlib import Path
from fastapi import UploadFile
import boto3
from botocore.exceptions import ClientError

from app.config import settings


class LocalStorageService:
    """本地文件存储服务（开发环境）"""
    
    def __init__(self):
        self.base_path = Path(settings.LOCAL_STORAGE_PATH)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    async def upload(self, file: UploadFile, key: str) -> str:
        """上传文件到本地存储"""
        file_path = self.base_path / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                await f.write(chunk)
        
        return f"/storage/{key}"
    
    async def download(self, key: str) -> bytes:
        """下载文件"""
        file_path = self.base_path / key
        async with aiofiles.open(file_path, "rb") as f:
            return await f.read()
    
    async def delete(self, key: str) -> bool:
        """删除文件"""
        file_path = self.base_path / key
        if file_path.exists():
            file_path.unlink()
            return True
        return False
    
    async def delete_directory(self, dir_key: str) -> bool:
        """删除整个目录"""
        import shutil
        dir_path = self.base_path / dir_key
        if dir_path.exists() and dir_path.is_dir():
            shutil.rmtree(dir_path)
            return True
        return False
    
    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        """获取文件 URL"""
        return f"/storage/{key}"
    
    def get_local_path(self, key: str) -> str:
        """获取本地文件路径"""
        return str(self.base_path / key)


class S3StorageService:
    """S3 文件存储服务（生产环境）"""
    
    def __init__(self):
        self.s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION,
        )
        self.bucket = settings.AWS_S3_BUCKET
    
    async def upload(self, file: UploadFile, key: str) -> str:
        """上传文件到 S3"""
        content = await file.read()
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
        return await self.get_url(key)
    
    async def download(self, key: str) -> bytes:
        """下载文件"""
        response = self.s3.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()
    
    async def delete(self, key: str) -> bool:
        """删除文件"""
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False
    
    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        """获取预签名 URL"""
        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
    
    def get_local_path(self, key: str) -> str:
        """S3 不支持本地路径，需要先下载"""
        raise NotImplementedError("S3 storage does not support local paths")


# 根据配置选择存储服务
if settings.USE_LOCAL_STORAGE:
    storage_service = LocalStorageService()
else:
    storage_service = S3StorageService()
