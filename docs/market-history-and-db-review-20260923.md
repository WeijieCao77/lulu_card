# 成交历史与数据库容量验收（2026-09-23）

本轮参考开瓦包62c16d1，并实际调用 DeepSeek v4-pro 完成两个独立施工任务：成交统计/API/UI/测试和数据库容量/请求维护/测试。两项各返修一次，审核修正了错误文件路径、PGlite调用、路由返回值、测试种子字段、并发容量分支重复查询、缺少索引集成、UI异常作用域等问题。未照搬没有唯一卡实例ID的“第几手”推断。

## 市场成交历史

- POST `/api/market/history`，参数cardId、可选level（0至MAX_LEVEL=5）；仅读取真实存在的卡。公开价格信息无需绑定手机，不返回买卖双方、账号哈希或其他身份字段。
- 仅 `card_listings.status=sold` 且 `card_offers.status=accepted` 的记录入统计；返回累计成交次数、均价、中位数、近7日次数/均价、同等级次数/均价和最近8笔等级/价格/日期。不是挂牌价，也不是回收价；不会推测卡片转手次数。
- 上架定价与出价面板均提供“成交记录”按钮，展开才查询；关闭、卸载、选卡/等级改变时取消请求，错误可重试。货架每张卡不会自动发查询。
- 卡ID+等级缓存30秒，最多128项；同键请求合并，最多128个不同键同时查询，超过返回busy/503。每IP bucket每分钟最多30次；价格可能最多延迟30秒刷新。
- 生产CARD_SCHEMA内增加已成交card_id/closed/id和accepted offer listing/price索引，原SCHEMAS自动收录并触发schema hash升级。精确中位数仍需读取指定卡的全部成交，开销随该卡成交历史增长；本轮用索引、限流、缓存与并发上限约束，并不声称查询耗时恒定。没有改挂单、结算、价格、内测即时成交或手机号政策。

## 后台容量（只读）

- GET `/api/admin/db`，沿用管理员header密钥校验；未授权404，其他method405。使用sqlStats连接；连接对象替换会重建健康缓存，避免抓住失效连接。
- 数据库大小、最多200表的总大小/数据/索引/TOAST等空间、估计活行/死行和vacuum时间，WAL目录大小/文件数、最近72小时按UTC日聚合的请求数量。看板列出最大20张表；不把数据库大小误报成磁盘剩余容量。
- 60秒缓存、请求合并。各分项独立降级，WAL权限或扩展不支持时显示不可用，不暴露SQL/连接信息，不把未知当作0。没有vacuum、删表或手工修改按钮。

## 请求日志保留

- 成功或失败的请求幂等键保留至少72小时。6小时至72小时之间，只压缩大回复体为ok/why/trimmed，原action与主键不变，重试仍不会再次执行。
- 严格 `at < now−72h` 才删除；exact72h键保留，exact6h回复不压缩。每次一条DELETE最多500行，再一条UPDATE最多500行，按at索引排序；无追赶循环，每进程最多每10分钟由卡牌操作成功返回后触发，且禁止重叠。
- 72小时之外包含已提交的异常reply=null行。审核了卡牌和市场的真实事务：claim、账户修改及reply写入在同一事务中；未提交INSERT对其他事务不可见，已被事务锁住的行通过FOR UPDATE SKIP LOCKED跳过。不能把历史已提交null当作永远进行中而无限保留。72小时内null仍保留。
- 3天以后同requestId不再保证重放原回复；客户端普通短时重试完全处于窗口内。清理逻辑不回填资产，也不按空reply推测执行结果。老积压按有限批次逐步缩减，不保证物理磁盘即时收缩。

## 验证结果

- `npx tsx scripts/check_market_history.ts`：真实PGlite表和路由，偶数/奇数中位数、均价、近7日、同等级、最近8笔排序、无身份泄露、非法参数、空数据、缓存合并/过期/容量、并发超限、限流、读取前后所有账号/挂牌/报价/邮件完全不变；从CARD_SCHEMA验证索引已建，重复DDL安全。
- `node scripts/check_request_maintenance.mjs`：72h/6h边界、最近null保留、旧已提交null清理、删除和压缩批量上限、连续批次、不重复压缩、action与幂等键保留。PGlite为单连接，不能将此测试宣称为真实多连接锁竞争压测；SKIP LOCKED通过实际SQL语法执行，事务安全另由现有交易测试覆盖。
- `node scripts/check_database_health.mjs`：真实PGlite容量/表/请求聚合，部分不可用与错误脱敏、缓存/请求合并，以及后台嵌入脚本加载失败时的转义渲染。
- `check_schema_boot.ts`迁移/咨询锁/失败重试通过；纠正既有“9份schema”滞后断言为实际10份，并断言新索引已进入清单。
- `check_demo_market.ts`、`check_market_participating.ts`、`check_market_sweep.ts`、`check_market_limits.ts`通过。旧`check_market_protect.ts`需测试进程设置MARKET_PROTECT_SEC=60，已通过。旧`check_market.ts`需TRADE_DAYS=3与TRADE_PULLS=50验证正式门槛，主线程隔离运行通过；内测默认保持0，不能为让旧测试通过而改上线政策。
- typecheck与主线程完整build通过。未改评分、赛区、卡池、杯赛或照片，未提交推送。
