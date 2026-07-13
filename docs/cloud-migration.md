# 云端升级说明

本次升级保持客户端返回结构不变，并把高增长数组从单个 `family_data` 文档迁移到 `family_resources`。

## 部署顺序

1. 部署最新版 `familyApi` 云函数及依赖，并保留现有 `ORDER_NOTICE_TEMPLATE_ID`、`GLM_MODEL` 等变量。
2. 首次请求会自动创建 `family_resources`、`family_rate_limits` 等集合；如果生产环境禁止自动建集合，请提前在云开发控制台创建。
3. 已有家庭第一次调用 `getData` 时，会将 `todos`、`orders`、`wishes`、`menus`、`places` 写入独立资源文档，并从主文档移除对应字段。

## 回滚与兼容

- 客户端仍通过 `getData` 和 `updateResource` 使用原来的字段结构。
- 迁移前数据会被复制到资源文档后再从主文档移除。
- 不要在升级后回滚到只读取 `family_data` 数组字段的旧云函数。

## 隐私与留存

- 新的进入记录默认保留 90 天，清理由访问请求低频触发。
- 管理页面不再返回完整 OpenID，只显示脱敏标识。
- 邀请码在 10 分钟内最多尝试 12 次。
