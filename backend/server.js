const path = require('path');
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { initDatabase } = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDir = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'start.html'));
});

app.use('/api', apiRoutes);
app.use(express.static(frontendDir, {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

app.use((req, res) => {
  res.status(404).json({
    error: '资源不存在',
    message: '没有找到请求的 Monster Café 资源。'
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: '服务器内部错误',
    message: error.message
  });
});

initDatabase()
  .then(() => {
    startServer(PORT);
  })
  .catch((error) => {
    console.error('数据库初始化失败：', error);
    process.exit(1);
  });

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Monster Café 服务已启动：http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`端口 ${port} 已被占用，正在尝试 http://localhost:${nextPort}`);
      startServer(nextPort);
      return;
    }

    console.error('服务启动失败：', error);
    process.exit(1);
  });
}
