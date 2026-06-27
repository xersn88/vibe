const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'backend', 'data', 'monster_cafe.db');

const logs = [
  {
    prompt: '[对话整理 01] 从零创建 Monster Café 项目骨架：Node.js + Express + SQLite，frontend/backend 目录，静态托管和运行方式。',
    ai_summary: '创建项目基础结构、package.json、后端服务入口、数据库入口、前端基础页面，并说明 npm install / npm start。',
    manual_change: '用户明确第一阶段只做完整项目骨架。',
    run_result: '项目骨架可本地启动，后端托管前端静态页面。'
  },
  {
    prompt: '[对话整理 02] 要求网页交互文字中文化，并实现 SQLite 数据库表：玩家、怪兽、原料、订单、图鉴、开发日志。',
    ai_summary: '完善 database.js 初始化建表逻辑，启动 server 自动建表，并插入默认怪兽和默认原料。',
    manual_change: '保留 Monster Café 和怪兽名等特殊名称，其余展示文案改为中文。',
    run_result: '数据库初始化和默认数据写入可用。'
  },
  {
    prompt: '[对话整理 03] 实现随机顾客和订单生成接口 GET /api/game/next-customer，支持 8 种口味标签。',
    ai_summary: '新增随机怪兽选择、按喜欢口味生成趣味订单文本，并返回怪兽、订单描述和推荐标签。',
    manual_change: '订单文案要求更有趣，包含甜、苦、冰、热、奶、气泡、星光、辣。',
    run_result: '可通过接口生成下一位顾客和订单需求。'
  },
  {
    prompt: '[对话整理 04] 实现 POST /api/game/make-drink 饮品调配、评分、金币、订单保存和图鉴更新。',
    ai_summary: '实现原料命中评分、讨厌口味扣分、组合奖励、满意度限制、金币奖励、订单记录、库存和图鉴更新。',
    manual_change: '按用户给定评分规则实现基础闭环。',
    run_result: '制作饮品接口可返回饮品名、满意度、奖励和评价。'
  },
  {
    prompt: '[对话整理 05] 实现 game.html 主游戏页：状态栏、顾客、订单、原料选择、制作饮品、评价和下一位顾客。',
    ai_summary: '搭建游戏页面交互，绑定顾客生成、原料选择、制作饮品和结果展示。',
    manual_change: '页面风格按可爱像素风、课程展示友好设计。',
    run_result: '主游戏页具备基础可玩流程。'
  },
  {
    prompt: '[对话整理 06] 实现怪兽图鉴功能：GET /api/collection，已解锁卡片和未解锁问号卡片。',
    ai_summary: '新增图鉴接口和 collection.html 卡片展示，显示名称、种族、描述、来店次数和最高满意度。',
    manual_change: '未解锁怪兽使用问号卡片。',
    run_result: '怪兽图鉴页面可展示存档图鉴数据。'
  },
  {
    prompt: '[对话整理 07] 实现原料商店：GET /api/ingredients、POST /api/shop/buy，购买库存和解锁原料。',
    ai_summary: '新增原料列表和购买接口，shop.html 展示原料、标签、价格、库存、解锁状态并更新金币库存。',
    manual_change: '商店支持补货和解锁两类操作。',
    run_result: '原料商店可购买和解锁原料。'
  },
  {
    prompt: '[对话整理 08] 修复当前无法生成顾客开始游戏的问题，使游戏可运行并完成交互闭环。',
    ai_summary: '排查游戏启动和接口调用路径，修复顾客生成与开始游戏流程。',
    manual_change: '用户要求优先让现有阶段能跑通。',
    run_result: '游戏可以正常开始并生成顾客。'
  },
  {
    prompt: '[对话整理 09] 增加更多顾客和原料标签覆盖，设计日结弹窗、评级、经验升级、成就和奖励功能。',
    ai_summary: '扩展怪兽和原料数据，加入日结统计、星级评价、经验等级、成就进度和奖励概念。',
    manual_change: '用户指出第一天不结束、顾客少、口味标签不全、缺少日结与成就。',
    run_result: '日结与成长系统初步接入。'
  },
  {
    prompt: '[对话整理 10] 根据截图修复结算错误，并调整评分机制，避免全覆盖标签仍只有低分。',
    ai_summary: '修复结算资源查找错误，重做评分逻辑，使需求标签覆盖、喜欢/讨厌标签和组合奖励更合理。',
    manual_change: '用户认为 40/65 分等结果不合理。',
    run_result: '结算错误被修复，评分结果更接近期望。'
  },
  {
    prompt: '[对话整理 11] 继续修正评分：第一和第二标签地位均等，订单必须存在满分可能，避免无解需求。',
    ai_summary: '统一处理原料多标签命中，订单生成时基于已解锁原料判断可解性，避免生成无法满分的需求。',
    manual_change: '用户指出第二标签满足需求也应计分，并要求从生成阶段避免无解。',
    run_result: '多标签评分和可解订单生成逻辑得到改进。'
  },
  {
    prompt: '[对话整理 12] 增加暂停弹窗、补货状态、商店补货返回、缺货标识、顾客等待时间和差评机制。',
    ai_summary: '实现暂停、继续、退出本天、前往商店补货，补货时隐藏导航并保持暂停；增加等待条、心情变化和超时差评。',
    manual_change: '用户要求营业中只能通过暂停进入相关跳转，导航栏禁用。',
    run_result: '暂停、补货和等待机制接入游戏页。'
  },
  {
    prompt: '[对话整理 13] 用户说明更新了新要求文本文档，要求读取文档并按新要求更改。',
    ai_summary: '根据新要求方向继续调整页面流转、存档、教程和功能页面设计。',
    manual_change: '用户以外部文档补充需求，后续实现围绕新结构展开。',
    run_result: '后续页面结构和存档逻辑按新要求继续迭代。'
  },
  {
    prompt: '[对话整理 14] 重新设计标题页、存档页、首页导航、图鉴拆分、首页信息卡和游戏页布局。',
    ai_summary: '新增 start.html、saves.html、成就页等结构；调整首页为存档内主页；游戏页改为上方顾客、制作、评价，下方横向原料。',
    manual_change: '用户明确开始游戏应先到存档页，index 只作为读档后的咖啡馆主页。',
    run_result: '标题页、存档页和新的主导航结构完成。'
  },
  {
    prompt: '[对话整理 15] 修复多存档不隔离，新增背包，调整教程初始奖励、工作进度读取、成就待办和订单可解判断。',
    ai_summary: '实现存档维度的金币、经验、原料、图鉴、成就、背包数据；完善未完成工作进度判断和成就领取逻辑。',
    manual_change: '用户要求每个档完全独立，初始资源为 500 金币和已解锁原料各 2。',
    run_result: '存档隔离和背包功能接入。'
  },
  {
    prompt: '[对话整理 16] 修复新手教程不应计入营业天数、怪兽来店次数、图鉴解锁；修正成就和故事待办排序、日结收益提交。',
    ai_summary: '新档从已营业 0 天开始，怪兽全锁；成就按可领、未完成、已领取排序；金币经验改为日结后统一入账。',
    manual_change: '用户指出教程不能算正式营业，局内收益保存退出不应提前入账。',
    run_result: '新档初始状态、成就待办和日结提交逻辑修正。'
  },
  {
    prompt: '[对话整理 17] 确认新档成就待办异常、允许删到无存档、首页返回标题、加载过场动画和加载慢原因。',
    ai_summary: '修复空存档、删除最后一个存档、返回标题登录态清理；新增外部页面布丁加载动画并按页面减少无用请求。',
    manual_change: '用户强调可删除旧档且需要退出登录回标题。',
    run_result: '空存档、返回标题和加载动画完成。'
  },
  {
    prompt: '[对话整理 18] 再次提交同一批问题：新档成就红点、删除最后存档、返回标题和加载动画。',
    ai_summary: '按重复需求再次核对实现，确认成就红点、删除存档和加载流程。',
    manual_change: '保留为独立日志，表示用户重复确认该需求。',
    run_result: '相关修复完成并通过验证。'
  },
  {
    prompt: '[对话整理 19] 调整新建存档流程：先营业过场再弹教程框；设计模块式新手教程和教程模拟营业。',
    ai_summary: '新建存档后进入 intro 过场，再在首页弹教程选择；实现首页模块引导和独立教程营业流程，完成后发初始奖励。',
    manual_change: '用户要求说明型步骤有下一步，交互型步骤只能点高亮模块。',
    run_result: '新手教程和奖励弹窗初步完成。'
  },
  {
    prompt: '[对话整理 20] 修复完成前一天后点击进入下一天无法开始、天数不更新的问题。',
    ai_summary: '修复前端进入下一天只重置不启动的问题，并收窄旧档修复条件避免日结天数被改回 0。',
    manual_change: '用户指出已点结算弹窗进入下一天却仍提示要开始新的一天。',
    run_result: '日结后天数从 0 到 1，进入下一天可自动开始。'
  },
  {
    prompt: '[对话整理 21] 再次提交进入下一天 bug，要求修复无法开始和天数不更新。',
    ai_summary: '按重复反馈再次验证日结和进入下一天流程。',
    manual_change: '保留为独立日志，表示用户重复确认该 bug。',
    run_result: '进入下一天和天数更新验证通过。'
  },
  {
    prompt: '[对话整理 22] 根据截图修复特殊道具制作饮品时报 SQLITE no such column 的问题，并检查类似错误。',
    ai_summary: '修复 UPDATE save_collection 的 WHERE 条件误写成 monster_affinity 字段的问题，并验证普通制作和带礼物制作。',
    manual_change: '用户截图显示制作失败 SQL 错误。',
    run_result: '普通制作和带礼物制作均通过。'
  },
  {
    prompt: '[对话整理 23] 删除设置页和没用上的页面，全面检查网站，并最终实现 AI 协作日志页面的增删查。',
    ai_summary: '删除 settings.html 和 report.html，清理入口；实现 dev_logs 查询、新增、删除接口和 logs.html 表单；完成页面和接口回归。',
    manual_change: '用户要求收尾并把开发日志页作为记录 Codex 辅助开发过程的功能。',
    run_result: '保留页面返回 200，删除页面返回 404，日志增删查和核心游戏接口通过。'
  }
];

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function seedLogs() {
  const tableInfo = await all('PRAGMA table_info(dev_logs)');
  const columnNames = tableInfo.map((column) => column.name);
  const insertColumns = ['prompt', 'ai_summary', 'manual_change', 'run_result'];

  if (columnNames.includes('title')) insertColumns.push('title');
  if (columnNames.includes('content')) insertColumns.push('content');
  if (columnNames.includes('summary')) insertColumns.push('summary');

  await run('DELETE FROM dev_logs');

  for (const log of logs) {
    const values = [
      log.prompt,
      log.ai_summary,
      log.manual_change,
      log.run_result
    ];

    if (columnNames.includes('title')) {
      values.push(log.prompt.slice(0, 40));
    }
    if (columnNames.includes('content')) {
      values.push(`提示词：${log.prompt}\nAI 返回摘要：${log.ai_summary}\n人工修改：${log.manual_change}\n运行结果：${log.run_result}`);
    }
    if (columnNames.includes('summary')) {
      values.push(log.ai_summary);
    }

    await run(
      `
        INSERT INTO dev_logs (${insertColumns.join(', ')})
        VALUES (${insertColumns.map(() => '?').join(', ')})
      `,
      values
    );
  }

  console.log(`已写入 ${logs.length} 条开发日志。`);
}

seedLogs()
  .then(() => db.close())
  .catch((error) => {
    console.error(error.message);
    db.close();
    process.exit(1);
  });
