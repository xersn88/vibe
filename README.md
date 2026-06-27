# Monster Café

Monster Café 是一个怪兽咖啡馆经营小游戏，使用 Node.js、Express、SQLite 和原生 HTML/CSS/JavaScript 开发。

## 项目目录

```text
monster-cafe/
├── package.json
├── README.md
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── data/
│   │   └── monster_cafe.db      # 启动后自动生成
│   └── routes/
│       └── api.js
└── frontend/
    ├── start.html
    ├── saves.html
    ├── intro.html
    ├── index.html
    ├── game.html
    ├── collection.html
    ├── achievements.html
    ├── level-rewards.html
    ├── backpack.html
    ├── shop.html
    ├── logs.html
    ├── styles.css
    └── app.js
```

## 数据库表

- `players`：玩家金币、营业天数、店铺等级、总满意度。
- `monsters`：怪兽名称、种族、喜欢的口味、讨厌的口味、描述、台词。
- `ingredients`：原料名称、口味标签、库存、价格、是否解锁。
- `orders`：怪兽编号、需求文本、选择的原料、满意度、金币奖励、创建时间。
- `collection`：怪兽编号、来店次数、最高满意度、是否解锁。
- `dev_logs`：提示词、AI 返回摘要、人工修改、运行结果、创建时间。

数据库会在启动服务时自动创建，并插入默认怪兽和默认原料数据。

## 本地运行

```bash
npm install
npm start
```

浏览器打开：

```text
http://localhost:3000
```

## 基础接口

```text
GET /api/health
GET /api/game/next-customer
POST /api/game/make-drink
POST /api/game/end-day
GET /api/player
GET /api/ingredients
POST /api/shop/buy
GET /api/monsters
GET /api/collection
GET /api/collection/todos
POST /api/collection/:monsterId/read-story
GET /api/achievements
POST /api/achievements/:id/claim
GET /api/level-rewards
POST /api/level-rewards/:id/claim
GET /api/backpack
GET /api/orders
GET /api/logs
POST /api/logs
DELETE /api/logs/:id
```
