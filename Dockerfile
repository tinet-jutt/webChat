# 基础 Node.js 镜像
FROM node:18-alpine

# 设置容器内工作目录
WORKDIR /app

# 复制依赖包配置
COPY package*.json ./

# 安装依赖包 (使用 --production 安装依赖)
RUN npm install --production

# 复制源代码
COPY . .

# 确保图片上传目录与数据持久化目录存在
RUN mkdir -p public/uploads data

# 暴露 7001 端口
ENV PORT=7001
EXPOSE 7001

# 挂载上传文件与房间数据持久化卷
VOLUME ["/app/public/uploads", "/app/data"]

# 启动服务器命令
CMD ["npm", "start"]
