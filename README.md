# 抖音评论采集系统（douyin-bee）

抖音视频评论采集 + 可视化管理后台。支持抖音账户扫码登录、视频素材录入、串行采集、评论查询与 Excel 导出。

## 开发模式

```bash
pnpm install

# 终端 1：后端（tsx watch，端口 3000）
pnpm dev

# 终端 2：前端（Vite dev server，端口 5173，/api 自动代理到 3000）
pnpm --filter web dev
```

访问 <http://127.0.0.1:5173>。

## 构建

```bash
pnpm --filter web build     # 前端 -> web/dist
pnpm build                  # 类型检查 + 后端 -> dist/index.js
pnpm start                  # 运行生产包（同时托管 web/dist）
```

## 功能模块

| 模块 | 说明 |
|---|---|
| **概览** | 账户/素材/采集/评论统计，视频评论分布、近 14 天趋势、归属地 Top 10 |
| **账户管理** | 扫码登录（本机弹出 Edge 窗口）、登录态检测、停用/删除、自动回填昵称头像 |
| **视频素材** | 录入（分享文本/短链/视频ID，支持多行批量）、采集控制（开始/暂停/继续/取消）、进度与日志、导出该视频评论 |
| **评论数据** | 多条件查询、二级回复展开、按视频或全部导出 Excel（.xlsx） |

## 数据模型

**采集状态直接挂在 `videos` 表上**，不再有独立的任务表：

- 一个视频对应一次采集，重采即覆盖，不留历史记录
- 采集配置：`collect_account_id` / `collect_replies` / `collect_max_comments` / `collect_interval_ms`
- 采集状态：`collect_status`（`idle` / `pending` / `running` / `paused` / `success` / `failed` / `canceled`）、`collect_cursor`、`collect_total` 等
- 采集日志按视频存于 `video_logs` 表

## 采集规则

- **一个视频对应一次采集**；采集前清空该视频的旧评论（不做增量）。
- 二级回复在录入或开始采集时勾选，**默认关闭**（仅采集一级评论）。只采一级评论 + 其下回复，平铺存储（`parent_id` 指向一级评论）。
- **全局串行**：同一时刻只采集一个视频，其余排队。
- 录入时勾选「录入后立即开始采集」会直接入队；也可之后在列表点「开始采集」。
- 「暂停」后可从断点继续；「重新采集」会清空重采。

## 数据与目录

```
douyin-bee/
├── data/
│   ├── app.db                 # SQLite 数据库（账户/视频/评论/日志）
│   └── auth/{accountId}.json  # 抖音登录态（Playwright storageState）
├── web/                       # 前端（Vue3 + Element Plus）
├── src/                       # 后端（Express 5 + node:sqlite）
│   ├── db/                    # 表结构与数据访问
│   ├── services/              # 账户检测、视频解析、采集调度
│   ├── routes/                # REST 接口
│   └── douyin/                # 抖音接口采集与签名
└── dist/                      # 后端构建产物
```

## 待接入：视频详情接口

素材录入时会自动补全标题、封面、作者、计数、发布时间。补全所需的
`api_fetch.getAwemeDetail` 目前为**占位实现**（返回 `null`，不阻塞录入）。

实现位置：[`src/douyin/api_fetch.ts`](src/douyin/api_fetch.ts)，
接口签名与字段映射已在注释中写明。未实现时素材仍可正常录入，标题/封面可在列表页手动编辑。

## 主要接口

```
GET    /api/account/list | /options | /login | /login/status | /:id/health
PATCH  /api/account/:id          DELETE /api/account/:id

GET    /api/videos | /options | /scheduler
POST   /api/videos | /batch | /resolve
POST   /api/videos/:id/collect | /pause | /resume | /cancel
GET    /api/videos/:id/logs
PATCH  /api/videos/:id           DELETE /api/videos/:id

GET    /api/comments | /ips | /:awemeId/:commentId/replies
POST   /api/comments/export      # 返回 xlsx 二进制
GET    /api/stats/overview
```
## 沟通&交流
![alt text](0f8107657ff5cb78243d85c29b18a957.jpg)

## License & 免责声明

本项目采用 [MIT License](LICENSE)，仅供技术学习与研究使用。使用前请务必阅读 [免责声明](DISCLAIMER.md)。
