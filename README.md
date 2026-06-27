# Monster Cafe

Monster Cafe is a small monster cafe management game built with Node.js, Express, SQLite, and vanilla HTML/CSS/JavaScript.

## Run Locally

Prerequisites:

- Node.js 18 or newer
- npm
- Git

Clone the public repository:

```bash
git clone https://github.com/xersn88/vibe.git
cd vibe
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

You can also use:

```bash
npm run dev
```

Open the game in your browser:

```text
http://localhost:3000
```

If port `3000` is already in use, the server will try the next port, such as `3001`.

## Project Structure

```text
monster-cafe/
├── package.json
├── README.md
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── data/
│   │   └── monster_cafe.db      # Created automatically after startup
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

## Scripts

```bash
npm start
npm run dev
```

Both commands run:

```bash
node backend/server.js
```

## Data

The SQLite database is created automatically when the server starts.

Main tables include:

- `players`
- `monsters`
- `ingredients`
- `orders`
- `collection`
- `dev_logs`

## API

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
