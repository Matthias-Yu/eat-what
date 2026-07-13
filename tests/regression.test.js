const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pageSource = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'cloudfunctions/familyApi/index.js'), 'utf8')
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const imageCache = require('../utils/image-cache')
const conflict = require('../utils/conflict')
const storageModule = require('../utils/storage')
const sync = require('../utils/sync')
const { createHomeModels } = require('../utils/home-model')
const { createGardenModels } = require('../utils/garden-model')

test('主包排除 assets 图片目录', () => {
  assert.ok(projectConfig.packOptions.ignore.some((item) => item.type === 'folder' && item.value === 'assets'))
  assert.ok(projectConfig.packOptions.ignore.some((item) => item.type === 'folder' && item.value === 'docs'))
  assert.ok(projectConfig.packOptions.ignore.some((item) => item.type === 'folder' && item.value === 'tests'))
})

test('图片加载具有版本、超时和持久缓存保护', () => {
  assert.match(pageSource, /const IMAGE_CACHE_VERSION = '[^']+'/)
  assert.match(pageSource, /图片预加载超时/)
  assert.match(pageSource, /storage\.write\('persistentImageCache', saved\)/)
})

test('图片缓存版本变化会删除旧文件并清空映射', () => {
  const values = new Map([
    ['imageCacheVersion', 'old'],
    ['persistentImageCache', { cloud: { url: 'wxfile://usr/old.png', expireAt: 4102444800000 } }]
  ])
  const removed = []
  global.wx = { getFileSystemManager: () => ({ unlinkSync: (file) => removed.push(file), accessSync: () => {} }) }
  const storage = {
    read: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    write: (key, value) => values.set(key, value)
  }
  assert.deepEqual(imageCache.initialize(storage, 'new', 0), {})
  assert.deepEqual(removed, ['wxfile://usr/old.png'])
  assert.equal(values.get('imageCacheVersion'), 'new')
  assert.deepEqual(values.get('persistentImageCache'), {})
})

test('云端更新使用版本冲突保护且不再用空文档兜底覆盖', () => {
  assert.match(apiSource, /not\\s\*exist\|not\\s\*found\|DATABASE_DOCUMENT_NOT_EXIST/)
  assert.match(apiSource, /DATA_CONFLICT/)
  assert.match(apiSource, /resourceVersions/)
  const updateResourceSource = apiSource.slice(apiSource.indexOf('async function updateResource'), apiSource.indexOf('async function migrateLocal'))
  assert.doesNotMatch(updateResourceSource, /emptySharedData/)
})

test('高风险资源均经过独立清洗', () => {
  for (const sanitizer of ['sanitizeCart', 'sanitizeTodoItem', 'sanitizeOrder', 'sanitizePlace']) {
    assert.match(apiSource, new RegExp(`function ${sanitizer}\\(`))
  }
})

test('AI 调用具备每日额度和最短间隔', () => {
  assert.match(apiSource, /AI_DAILY_LIMIT/)
  assert.match(apiSource, /AI_MIN_INTERVAL_MS/)
  assert.match(apiSource, /consumeAiQuota/)
})

test('并发数组合并保留远端新增、本地修改和本地删除', () => {
  const base = [{ id: 1, title: '旧' }, { id: 2, title: '删除我' }]
  const local = [{ id: 1, title: '本地修改' }, { id: 3, title: '本地新增' }]
  const remote = [{ id: 1, title: '旧' }, { id: 2, title: '删除我' }, { id: 4, title: '远端新增' }]
  assert.deepEqual(conflict.merge('todos', base, local, remote), [
    { id: 1, title: '本地修改' },
    { id: 3, title: '本地新增' },
    { id: 4, title: '远端新增' }
  ])
})

test('购物车冲突只覆盖本地实际改动的键', () => {
  assert.deepEqual(conflict.merge('cart', { a: 1, b: 1 }, { a: 2 }, { a: 1, b: 3, c: 1 }), { a: 2, c: 1 })
})

test('页面使用的本地存储键全部已注册', () => {
  const usedKeys = [...pageSource.matchAll(/storage\.(?:read|write)\('([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(usedKeys.filter((key) => !storageModule.KEYS[key]), [])
  assert.ok(storageModule.KEYS.orderPushEnabled)
})

test('未知存储键会安全拒绝而不是写入 undefined', () => {
  const writes = []
  global.wx = {
    getStorageSync: () => undefined,
    setStorageSync: (...args) => writes.push(args),
    removeStorageSync: () => {}
  }
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(storageModule.read('missing', 'fallback'), 'fallback')
    assert.equal(storageModule.write('missing', true), false)
  } finally {
    console.warn = originalWarn
  }
  assert.deepEqual(writes, [])
})

test('轻量同步元数据只在版本变化时触发拉取', () => {
  const first = { updatedAt: '2026-07-13T00:00:00.000Z', resourceVersions: { todos: 2, cart: 1 } }
  const revision = sync.revisionKey(first)
  assert.equal(sync.shouldPull(revision, { resourceVersions: { cart: 1, todos: 2 }, updatedAt: first.updatedAt }), false)
  assert.equal(sync.shouldPull(revision, { resourceVersions: { cart: 1, todos: 3 }, updatedAt: first.updatedAt }), true)
})

test('首页数据模型会清洗留言、信件和纪念日', () => {
  const model = createHomeModels({
    storage: { read: () => null },
    homeImages: { morning: 'm', noon: 'n', afternoon: 'a', night: 'x' },
    reactionEmojis: ['❤️'],
    messagesLimit: 2,
    lettersLimit: 2
  })
  assert.equal(model.normalizeAnniversary({ title: '纪念日', date: 'bad' }), null)
  assert.equal(model.normalizeMessages([{ text: '' }, { text: '你好', reactions: { '❤️': ['u', 'u'] } }]).length, 1)
  assert.deepEqual(model.normalizeLetters([{ text: '信', openedBy: ['u'] }])[0].openedBy, ['u'])
})

test('农场与花园模型限制非法库存和地块', () => {
  const farm = { id: 'tomato', growDays: 1, name: '番茄', emoji: '🍅', tone: 'red' }
  const flower = { id: 'rose', growDays: 1, name: '玫瑰', image: 'rose.jpg', tone: 'red' }
  const model = createGardenModels({
    farmPlotCount: 1,
    farmCrops: [farm],
    farmCropMap: { tomato: farm },
    farmImages: {},
    flowerPlotCount: 1,
    flowerTypes: [flower],
    flowerTypeMap: { rose: flower },
    flowerImages: {},
    textSlice: (value, length) => String(value || '').slice(0, length),
    todayDateString: () => '2026-07-13'
  })
  assert.deepEqual(model.normalizeFarmState({ inventory: { bad: 9 }, plots: [{ cropId: 'bad' }] }).inventory, {})
  assert.equal(model.normalizeFlowerState({ nectar: -5 }).nectar, 0)
})

test('云端读取只在文档不存在时初始化且高增长资源已分片', () => {
  const getDataSource = apiSource.slice(apiSource.indexOf('async function getSharedData'), apiSource.indexOf('async function getDataMeta'))
  assert.match(getDataSource, /if \(!isDocumentNotFoundError\(error\)\) throw error/)
  assert.match(apiSource, /const SHARDED_RESOURCES = \['todos', 'orders', 'wishes', 'menus', 'places'\]/)
  assert.match(apiSource, /family_resources/)
  for (const operation of ['openLetter', 'toggleMessageReaction', 'notifyOrderAdmin']) {
    const start = apiSource.indexOf(`async function ${operation}`)
    const next = apiSource.indexOf('\nasync function ', start + 1)
    assert.match(apiSource.slice(start, next < 0 ? undefined : next), /runTransaction/)
  }
})

test('访问记录具备留存限制且不向管理页返回完整 OpenID', () => {
  const visitSource = apiSource.slice(apiSource.indexOf('async function recordVisit'), apiSource.indexOf('async function clearVisitRecords'))
  assert.match(visitSource, /VISIT_RETENTION_DAYS/)
  assert.match(visitSource, /openidMasked: maskOpenid/)
  assert.doesNotMatch(visitSource, /openid: actorOpenid/)
  assert.match(apiSource, /JOIN_ATTEMPT_LIMIT/)
})
