const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pageSource = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'cloudfunctions/familyApi/index.js'), 'utf8')
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const imageCache = require('../utils/image-cache')

test('主包排除 assets 图片目录', () => {
  assert.deepEqual(projectConfig.packOptions.ignore, [{ type: 'folder', value: 'assets' }])
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

test('云端更新仅在文档不存在时执行初始化 set', () => {
  assert.match(apiSource, /not\\s\*exist\|not\\s\*found\|DATABASE_DOCUMENT_NOT_EXIST/)
  assert.match(apiSource, /DATA_CONFLICT/)
  assert.match(apiSource, /resourceVersions/)
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
