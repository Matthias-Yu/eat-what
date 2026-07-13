const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const COLLECTIONS = ['family_users', 'family_households', 'family_data', 'family_resources', 'family_visits', 'family_ai_usage', 'family_rate_limits']
let collectionsReady = false
const RESOURCE_LIMITS = {
  todos: 500,
  orders: 100,
  wishes: 300,
  menus: 100,
  places: 500,
  messages: 200,
  letters: 60
}
const SHARDED_RESOURCES = ['todos', 'orders', 'wishes', 'menus', 'places']
const MENU_CATEGORIES = ['main', 'dish', 'light', 'drink']
const MESSAGE_REACTION_EMOJIS = ['❤️', '😂', '👍', '🎉', '😢']
const MESSAGE_REACTION_USER_LIMIT = 50
const LETTER_TEXT_LIMIT = 4000
const FARM_CROP_IDS = ['tomato', 'corn', 'carrot', 'berry']
const FARM_PLOT_COUNT = 6
const FLOWER_IDS = ['rose', 'tulip', 'daisy', 'sunflower', 'babysbreath', 'lavender', 'lily', 'hydrangea']
const FLOWER_PLOT_COUNT = 6
const AI_NAME = '饭团'
const GLM_HOST = 'open.bigmodel.cn'
const GLM_PATH = '/api/paas/v4/chat/completions'
const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2'
const AI_MAX_HISTORY = 12
const AI_MAX_CONTENT = 800
const AI_DAILY_LIMIT = 50
const AI_MIN_INTERVAL_MS = 3000
const VISIT_RETENTION_DAYS = 90
const JOIN_ATTEMPT_LIMIT = 12
const JOIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const CATEGORY_TONE = {
  main: 'honey',
  dish: 'sunset',
  light: 'mint',
  drink: 'blush'
}

function success(data) {
  return { ok: true, data }
}

function failure(message) {
  return { ok: false, message }
}

function isDocumentNotFoundError(error) {
  const detail = String(error && (error.errMsg || error.message || error))
  return /not\s*exist|not\s*found|DATABASE_DOCUMENT_NOT_EXIST/i.test(detail)
}

async function ensureCollections() {
  if (collectionsReady) return
  if (typeof db.createCollection !== 'function') {
    collectionsReady = true
    return
  }
  await Promise.all(COLLECTIONS.map(async (name) => {
    try {
      await db.createCollection(name)
    } catch (error) {
      // 集合已存在、无权限或不支持自动建表时，均不阻断主流程（集合可在控制台手动创建）
      console.warn(`createCollection ${name} 跳过`, error.errMsg || error.message || error)
    }
  }))
  collectionsReady = true
}

async function getUser(openid) {
  try {
    const response = await db.collection('family_users').doc(openid).get()
    return response.data || null
  } catch (error) {
    if (isDocumentNotFoundError(error)) return null
    throw error
  }
}

async function getHousehold(householdId) {
  if (!householdId) return null
  try {
    const response = await db.collection('family_households').doc(householdId).get()
    return response.data || null
  } catch (error) {
    if (isDocumentNotFoundError(error)) return null
    throw error
  }
}

async function requireMembership(openid) {
  const user = await getUser(openid)
  if (!user || !user.householdId) throw new Error('请先创建或加入家庭')
  const household = await getHousehold(user.householdId)
  if (!household || !Array.isArray(household.members) || !household.members.includes(openid)) {
    throw new Error('没有访问这个家庭的权限')
  }
  return { user, household }
}

async function uniqueInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = ''
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    const existing = await db.collection('family_households').where({ inviteCode: code }).limit(1).get()
    if (!existing.data.length) return code
  }
  throw new Error('邀请码生成失败，请重试')
}

function emptySharedData(householdId) {
  return {
    householdId,
    cart: {},
    todos: [],
    orders: [],
    wishes: [],
    menus: [],
    farm: createDefaultFarmState(),
    flower: createDefaultFlowerState(),
    places: [],
    orderNotices: [],
    anniversary: null,
    messages: [],
    letters: [],
    resourceVersions: {},
    updatedAt: db.serverDate()
  }
}

function resourceDocumentId(householdId, resource) {
  return `${householdId}_${resource}`
}

async function loadShardedResources(householdId, legacyData) {
  const values = {}
  const versions = Object.assign({}, legacyData.resourceVersions || {})
  // 逐资源迁移，并让“读取旧字段、创建资源文档、移除旧字段”处于同一事务。
  // 串行执行可避免多个事务同时争用 family_data 元数据文档。
  for (const resource of SHARDED_RESOURCES) {
    await db.runTransaction(async (transaction) => {
      const sharedDocument = transaction.collection('family_data').doc(householdId)
      const resourceDocument = transaction.collection('family_resources').doc(resourceDocumentId(householdId, resource))
      const sharedResponse = await sharedDocument.get()
      const shared = sharedResponse.data || legacyData || {}
      let resourceData = null
      try {
        const resourceResponse = await resourceDocument.get()
        resourceData = resourceResponse.data || null
      } catch (error) {
        if (!isDocumentNotFoundError(error)) throw error
      }
      if (resourceData) {
        values[resource] = sanitizeResource(resource, resourceData.value)
        versions[resource] = Math.max(0, Number(resourceData.version) || 0)
        return
      }
      const sharedVersions = shared.resourceVersions && typeof shared.resourceVersions === 'object' ? shared.resourceVersions : {}
      const value = sanitizeResource(resource, shared[resource] || [])
      const version = Math.max(0, Number(sharedVersions[resource]) || 0)
      await resourceDocument.set({
        data: { householdId, resource, value, version, updatedAt: db.serverDate() }
      })
      const metadata = { resourceSchemaVersion: 1, updatedAt: db.serverDate() }
      metadata[resource] = command.remove()
      metadata[`resourceVersions.${resource}`] = version
      await sharedDocument.update({ data: metadata })
      values[resource] = value
      versions[resource] = version
    })
  }
  return { values, versions }
}

function createDefaultFarmPlots() {
  return Array.from({ length: FARM_PLOT_COUNT }).map((_, index) => ({
    id: index + 1,
    cropId: '',
    plantedAt: 0,
    wateredAt: 0
  }))
}

function createDefaultFarmState() {
  return {
    coins: 30,
    lastBonusDate: '',
    inventory: {},
    plots: createDefaultFarmPlots()
  }
}

function createDefaultFlowerPlots() {
  return Array.from({ length: FLOWER_PLOT_COUNT }).map((_, index) => ({
    id: index + 1,
    flowerId: '',
    plantedAt: 0,
    caredAt: 0
  }))
}

function createDefaultFlowerState() {
  return {
    nectar: 36,
    lastBonusDate: '',
    inventory: {},
    plots: createDefaultFlowerPlots()
  }
}

function getPrimaryAdminOpenid(household) {
  const members = Array.isArray(household.members) ? household.members : []
  return household.primaryAdminOpenid || household.ownerOpenid || members[0] || ''
}

function publicHousehold(household, openid) {
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  const isPrimaryAdmin = openid === primaryAdminOpenid
  return {
    id: household._id,
    name: household.name,
    inviteCode: household.inviteCode,
    memberCount: members.length,
    isAdmin: isPrimaryAdmin,
    role: isPrimaryAdmin ? 'primary' : 'secondary',
    roleLabel: isPrimaryAdmin ? '管理员' : '成员',
    canNotifyAdmin: !isPrimaryAdmin && members.length > 1 && members.includes(primaryAdminOpenid),
    orderNoticeTemplateId: process.env.ORDER_NOTICE_TEMPLATE_ID || '',
    aiName: AI_NAME,
    aiConfigured: !!textSlice(household.glmApiKey, 200)
  }
}

async function getSession(openid) {
  const user = await getUser(openid)
  if (!user || !user.householdId) return success({ active: false, openid })
  const household = await getHousehold(user.householdId)
  if (!household || !household.members.includes(openid)) return success({ active: false, openid })
  const isPrimaryAdmin = openid === getPrimaryAdminOpenid(household)
  const nickname = textSlice(user.nickname, 12) || (isPrimaryAdmin ? '管理员' : '成员')
  return success({ active: true, openid, nickname, household: publicHousehold(household, openid) })
}

async function createHousehold(openid, event) {
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) {
    const existing = await getHousehold(currentUser.householdId)
    if (existing) return success({ household: publicHousehold(existing, openid) })
  }
  await acquireOperationLock(openid, 'create_household')
  const inviteCode = await uniqueInviteCode()
  const householdId = `family-${openid}`
  await db.runTransaction(async (transaction) => {
    const householdDocument = transaction.collection('family_households').doc(householdId)
    const userDocument = transaction.collection('family_users').doc(openid)
    const dataDocument = transaction.collection('family_data').doc(householdId)
    let latestUser = null
    try {
      const userResponse = await userDocument.get()
      latestUser = userResponse.data || null
    } catch (error) {
      if (!isDocumentNotFoundError(error)) throw error
    }
    if (latestUser && latestUser.householdId) throw new Error('你已经加入了一个家庭')
    await householdDocument.set({ data: {
      name: String(event.name || '我们的小家').slice(0, 20),
      inviteCode,
      ownerOpenid: openid,
      primaryAdminOpenid: openid,
      members: [openid],
      inviteActive: true,
      createdAt: db.serverDate()
    } })
    await userDocument.set({
      data: { openid, householdId, nickname: textSlice(event.nickname, 12) || '管理员', joinedAt: db.serverDate() }
    })
    await dataDocument.set({ data: emptySharedData(householdId) })
  })
  const household = await getHousehold(householdId)
  return success({ household: publicHousehold(household, openid) })
}

async function joinHousehold(openid, event) {
  const inviteCode = String(event.inviteCode || '').trim().toUpperCase()
  if (inviteCode.length !== 6) throw new Error('请输入邀请码')
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) throw new Error('你已经加入了一个家庭')
  await consumeJoinAttempt(openid)
  const response = await db.collection('family_households').where({ inviteCode, inviteActive: true }).limit(1).get()
  const household = response.data[0]
  if (!household) throw new Error('没有找到这个邀请码')
  await db.runTransaction(async (transaction) => {
    const householdDocument = transaction.collection('family_households').doc(household._id)
    const userDocument = transaction.collection('family_users').doc(openid)
    const householdResponse = await householdDocument.get()
    const latestHousehold = householdResponse.data
    if (!latestHousehold || !latestHousehold.inviteActive || latestHousehold.inviteCode !== inviteCode) {
      throw new Error('这个邀请码已失效')
    }
    let latestUser = null
    try {
      const userResponse = await userDocument.get()
      latestUser = userResponse.data || null
    } catch (error) {
      if (!isDocumentNotFoundError(error)) throw error
    }
    if (latestUser && latestUser.householdId) throw new Error('你已经加入了一个家庭')
    await householdDocument.update({ data: { members: command.addToSet(openid), updatedAt: db.serverDate() } })
    await userDocument.set({
      data: { openid, householdId: household._id, nickname: textSlice(event.nickname, 12) || '成员', joinedAt: db.serverDate() }
    })
  })
  const updated = await getHousehold(household._id)
  await db.collection('family_rate_limits').doc(`${openid}_join`).remove().catch(() => {})
  return success({ household: publicHousehold(updated, openid) })
}

async function consumeJoinAttempt(openid) {
  const documentId = `${openid}_join`
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_rate_limits').doc(documentId)
    let current = null
    try {
      const response = await document.get()
      current = response.data || null
    } catch (error) {
      if (!isDocumentNotFoundError(error)) throw error
    }
    const now = Date.now()
    const windowStartedAt = Number(current && current.windowStartedAt) || now
    const inWindow = now - windowStartedAt < JOIN_ATTEMPT_WINDOW_MS
    const count = inWindow ? Math.max(0, Number(current && current.count) || 0) : 0
    if (count >= JOIN_ATTEMPT_LIMIT) throw new Error('邀请码尝试过于频繁，请稍后再试')
    await document.set({
      data: {
        type: 'join',
        openid,
        count: count + 1,
        windowStartedAt: inWindow ? windowStartedAt : now,
        updatedAt: db.serverDate()
      }
    })
  })
}

async function acquireOperationLock(openid, type) {
  const documentId = `${openid}_${type}`
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_rate_limits').doc(documentId)
    let current = null
    try {
      const response = await document.get()
      current = response.data || null
    } catch (error) {
      if (!isDocumentNotFoundError(error)) throw error
    }
    const now = Date.now()
    if (current && now - Number(current.lockedAt || 0) < 10000) throw new Error('操作正在处理中，请勿重复提交')
    await document.set({ data: { type, openid, lockedAt: now, updatedAt: db.serverDate() } })
  })
}

function getVisibleOrderNotices(data, openid) {
  const notices = Array.isArray(data.orderNotices) ? data.orderNotices : []
  return notices
    .filter((notice) => notice && notice.receiverOpenid === openid)
    .slice(0, 30)
    .map((notice) => ({
      id: notice.id,
      orderId: notice.orderId,
      summary: notice.summary,
      remark: notice.remark,
      itemCount: notice.itemCount,
      createdAt: notice.createdAt,
      createdAtText: notice.createdAtText,
      read: !!notice.read
    }))
}

async function getSharedData(openid) {
  const { household } = await requireMembership(openid)
  let data
  try {
    const response = await db.collection('family_data').doc(household._id).get()
    data = response.data
  } catch (error) {
    if (!isDocumentNotFoundError(error)) throw error
    data = emptySharedData(household._id)
    await db.collection('family_data').doc(household._id).set({ data })
  }
  const sharded = await loadShardedResources(household._id, data)
  return success({
    openid,
    cart: sanitizeResource('cart', data.cart || {}),
    todos: sharded.values.todos,
    orders: sharded.values.orders,
    wishes: sharded.values.wishes,
    menus: sharded.values.menus,
    farm: sanitizeFarmState(data.farm),
    flower: sanitizeFlowerState(data.flower),
    places: sharded.values.places,
    orderNotices: getVisibleOrderNotices(data, openid),
    anniversary: sanitizeResource('anniversary', data.anniversary || null),
    messages: sanitizeResource('messages', data.messages || []),
    letters: sanitizeResource('letters', data.letters || []),
    resourceVersions: Object.assign({}, data.resourceVersions || {}, sharded.versions),
    updatedAt: data.updatedAt || null
  })
}

async function getDataMeta(openid) {
  const { household } = await requireMembership(openid)
  try {
    const response = await db.collection('family_data').doc(household._id).get()
    const data = response.data || {}
    return success({
      updatedAt: data.updatedAt || null,
      resourceVersions: data.resourceVersions && typeof data.resourceVersions === 'object' ? data.resourceVersions : {}
    })
  } catch (error) {
    if (isDocumentNotFoundError(error)) return success({ updatedAt: null, resourceVersions: {} })
    throw error
  }
}

function textSlice(value, length) {
  return Array.from(String(value || '').trim()).slice(0, length).join('')
}

function sanitizeMenuItem(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const category = MENU_CATEGORIES.includes(source.category) ? source.category : 'dish'
  const tags = Array.isArray(source.tags)
    ? source.tags.map((tag) => textSlice(tag, 8)).filter(Boolean).slice(0, 2)
    : []
  if (!tags.length) tags.push('自定义')
  if (tags.length === 1) tags.push('新菜')
  return {
    id: textSlice(source.id, 40) || `custom-${Date.now()}-${index}`,
    name: textSlice(source.name, 18) || '小家新菜',
    description: textSlice(source.description, 28) || '小家新增菜单',
    highlight: textSlice(source.highlight || tags[0], 12) || '小家新增',
    category,
    emoji: textSlice(source.emoji, 2) || '🍽',
    image: textSlice(source.image, 240),
    tone: CATEGORY_TONE[category] || 'sunset',
    tags,
    recommended: !!source.recommended,
    custom: true
  }
}

function sanitizeWishItem(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const createdAt = Number(source.createdAt) || Date.now()
  return {
    id: source.id || `wish-${createdAt}-${index}`,
    title: textSlice(source.title, 30) || '一起做一件小事',
    note: textSlice(source.note, 40),
    completed: !!source.completed,
    createdAt
  }
}

function sanitizeCart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const cart = {}
  Object.keys(value).slice(0, 100).forEach((id) => {
    const safeId = textSlice(id, 48)
    const quantity = Math.min(99, Math.max(0, Math.floor(Number(value[id]) || 0)))
    if (safeId && quantity) cart[safeId] = quantity
  })
  return cart
}

function sanitizeTodoItem(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  return {
    id: textSlice(source.id, 48) || `todo-${Date.now()}-${index}`,
    title: textSlice(source.title, 40) || '一件小事',
    note: textSlice(source.note, 100),
    category: ['生活', '家务', '采购', '工作'].includes(source.category) ? source.category : '生活',
    due: textSlice(source.due, 16) || '今天',
    completed: !!source.completed
  }
}

function sanitizeOrderItem(item) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  return {
    id: textSlice(source.id, 48),
    name: textSlice(source.name, 30) || '菜品',
    emoji: textSlice(source.emoji, 2),
    image: textSlice(source.image, 300),
    quantity: Math.min(99, Math.max(1, Math.floor(Number(source.quantity) || 1)))
  }
}

function sanitizeOrder(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const items = (Array.isArray(source.items) ? source.items : []).slice(0, 100).map(sanitizeOrderItem)
  return {
    id: textSlice(source.id, 48) || `order-${Date.now()}-${index}`,
    createdAt: textSlice(source.createdAt, 40),
    items,
    itemSummary: textSlice(source.itemSummary, 300),
    remark: textSlice(source.remark, 100),
    status: textSlice(source.status, 30) || '等你开饭'
  }
}

function sanitizePlace(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  return {
    id: textSlice(source.id, 48) || `place-${Date.now()}-${index}`,
    name: textSlice(source.name, 40),
    address: textSlice(source.address, 120),
    latitude: Math.max(-90, Math.min(90, Number(source.latitude) || 0)),
    longitude: Math.max(-180, Math.min(180, Number(source.longitude) || 0))
  }
}

function sanitizeOrderNoticeOrder(order) {
  const source = order && typeof order === 'object' && !Array.isArray(order) ? order : {}
  const items = Array.isArray(source.items) ? source.items : []
  const itemCount = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0)
  const summary = textSlice(source.itemSummary || items.map((item) => `${item.name || '菜品'} ×${item.quantity || 1}`).join('、'), 80)
  return {
    id: textSlice(source.id, 20) || String(Date.now()).slice(-6),
    summary: summary || '有新的点餐订单',
    remark: textSlice(source.remark, 40),
    itemCount,
    createdAtText: textSlice(source.createdAt, 30)
  }
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatNoticeTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now())
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

async function trySendOrderSubscribeMessage(openid, notice) {
  const templateId = process.env.ORDER_NOTICE_TEMPLATE_ID || ''
  if (!templateId || !cloud.openapi || !cloud.openapi.subscribeMessage) {
    return { sent: false, reason: 'not_configured' }
  }
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page: 'pages/index/index',
      data: {
        thing18: { value: textSlice(notice.summary, 20) || '新的点餐订单' },
        time23: { value: formatNoticeTime(notice.createdAt) },
        thing29: { value: textSlice(notice.remark || '没有特别备注', 20) }
      }
    })
    return { sent: true }
  } catch (error) {
    console.warn('发送订阅消息失败', error)
    return { sent: false, reason: error.errMsg || error.message || 'send_failed' }
  }
}

function sanitizeAnniversary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const date = textSlice(value.date, 10)
  // 期望 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return {
    title: textSlice(value.title, 12) || '在一起',
    date
  }
}

function sanitizeMessageReactions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  MESSAGE_REACTION_EMOJIS.forEach((emoji) => {
    const users = value[emoji]
    if (!Array.isArray(users)) return
    const cleaned = [...new Set(users.map((u) => textSlice(u, 60)).filter(Boolean))].slice(0, MESSAGE_REACTION_USER_LIMIT)
    if (cleaned.length) result[emoji] = cleaned
  })
  return result
}

function sanitizeMessageItem(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const createdAt = Number(source.createdAt) || Date.now()
  return {
    id: textSlice(source.id, 40) || `msg-${createdAt}-${index}`,
    text: textSlice(source.text, 80),
    authorOpenid: textSlice(source.authorOpenid, 60),
    authorName: textSlice(source.authorName, 12) || '小家成员',
    createdAt,
    reactions: sanitizeMessageReactions(source.reactions)
  }
}

function sanitizeLetterItem(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const createdAt = Number(source.createdAt) || Date.now()
  return {
    id: textSlice(source.id, 48) || `letter-${createdAt}-${index}`,
    text: textSlice(source.text, LETTER_TEXT_LIMIT),
    authorOpenid: textSlice(source.authorOpenid, 60),
    authorName: textSlice(source.authorName, 12) || '小家成员',
    createdAt,
    openedBy: Array.isArray(source.openedBy)
      ? [...new Set(source.openedBy.map((value) => textSlice(value, 60)).filter(Boolean))]
      : []
  }
}

function sanitizeFarmState(value) {
  const fallback = createDefaultFarmState()
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const inventory = {}
  if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
    Object.keys(source.inventory).forEach((id) => {
      if (FARM_CROP_IDS.includes(id)) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
    })
  }
  const rawPlots = Array.isArray(source.plots) ? source.plots : []
  const plots = fallback.plots.map((plot, index) => {
    const raw = rawPlots[index] && typeof rawPlots[index] === 'object' && !Array.isArray(rawPlots[index])
      ? rawPlots[index]
      : {}
    const cropId = FARM_CROP_IDS.includes(raw.cropId) ? raw.cropId : ''
    return {
      id: plot.id,
      cropId,
      plantedAt: cropId ? Number(raw.plantedAt) || Date.now() : 0,
      wateredAt: cropId ? Number(raw.wateredAt) || 0 : 0
    }
  })
  return {
    coins: Object.prototype.hasOwnProperty.call(source, 'coins') ? Math.max(0, Number(source.coins) || 0) : fallback.coins,
    lastBonusDate: textSlice(source.lastBonusDate, 10),
    inventory,
    plots
  }
}

function sanitizeFlowerState(value) {
  const fallback = createDefaultFlowerState()
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const inventory = {}
  if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
    Object.keys(source.inventory).forEach((id) => {
      if (FLOWER_IDS.includes(id)) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
    })
  }
  const rawPlots = Array.isArray(source.plots) ? source.plots : []
  const plots = fallback.plots.map((plot, index) => {
    const raw = rawPlots[index] && typeof rawPlots[index] === 'object' && !Array.isArray(rawPlots[index])
      ? rawPlots[index]
      : {}
    const flowerId = FLOWER_IDS.includes(raw.flowerId) ? raw.flowerId : ''
    return {
      id: plot.id,
      flowerId,
      plantedAt: flowerId ? Number(raw.plantedAt) || Date.now() : 0,
      caredAt: flowerId ? Number(raw.caredAt) || 0 : 0
    }
  })
  return {
    nectar: Object.prototype.hasOwnProperty.call(source, 'nectar') ? Math.max(0, Number(source.nectar) || 0) : fallback.nectar,
    lastBonusDate: textSlice(source.lastBonusDate, 10),
    inventory,
    plots
  }
}

function sanitizeResource(resource, value) {
  if (resource === 'cart') {
    return sanitizeCart(value)
  }
  if (resource === 'anniversary') {
    return sanitizeAnniversary(value)
  }
  if (resource === 'farm') {
    return sanitizeFarmState(value)
  }
  if (resource === 'flower') {
    return sanitizeFlowerState(value)
  }
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_LIMITS, resource)) throw new Error('不支持的数据类型')
  if (!Array.isArray(value)) throw new Error('数据格式不正确')
  if (resource === 'wishes') return value.slice(0, RESOURCE_LIMITS.wishes).map(sanitizeWishItem)
  if (resource === 'menus') return value.slice(0, RESOURCE_LIMITS.menus).map(sanitizeMenuItem)
  if (resource === 'messages') {
    return value
      .slice(0, RESOURCE_LIMITS.messages)
      .map(sanitizeMessageItem)
      .filter((item) => item.text)
  }
  if (resource === 'letters') {
    return value
      .slice(0, RESOURCE_LIMITS.letters)
      .map(sanitizeLetterItem)
      .filter((item) => item.text)
  }
  if (resource === 'todos') return value.slice(0, RESOURCE_LIMITS.todos).map(sanitizeTodoItem)
  if (resource === 'orders') return value.slice(0, RESOURCE_LIMITS.orders).map(sanitizeOrder)
  if (resource === 'places') return value.slice(0, RESOURCE_LIMITS.places).map(sanitizePlace)
  return value.slice(0, RESOURCE_LIMITS[resource])
}

async function sendLetter(openid, event) {
  const { user, household } = await requireMembership(openid)
  const text = String(event.text || '')
  if (!text.trim()) throw new Error('先写下想说的话吧')
  const createdAt = Date.now()
  const letter = sanitizeLetterItem({
    id: `letter-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    authorOpenid: openid,
    authorName: textSlice(user.nickname, 12) || (openid === getPrimaryAdminOpenid(household) ? '管理员' : '小家成员'),
    createdAt,
    openedBy: []
  }, 0)
  let letters = []
  try {
    await db.runTransaction(async (transaction) => {
      const document = transaction.collection('family_data').doc(household._id)
      const response = await document.get()
      const data = response.data || {}
      letters = [letter].concat(Array.isArray(data.letters) ? data.letters.map(sanitizeLetterItem) : [])
        .slice(0, RESOURCE_LIMITS.letters)
      await document.update({
        data: {
          letters: command.set(letters),
          updatedAt: db.serverDate(),
          updatedBy: openid
        }
      })
    })
  } catch (error) {
    if (!isDocumentNotFoundError(error)) throw error
    letters = [letter]
    await db.collection('family_data').doc(household._id).set({
      data: Object.assign(emptySharedData(household._id), {
        letters,
        updatedAt: db.serverDate(),
        updatedBy: openid
      })
    })
  }
  return success({ letter, letters })
}

async function openLetter(openid, event) {
  const { household } = await requireMembership(openid)
  const letterId = textSlice(event.letterId, 48)
  if (!letterId) throw new Error('没有找到这封信')
  let letters = []
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const data = response.data || emptySharedData(household._id)
    letters = (Array.isArray(data.letters) ? data.letters : []).map(sanitizeLetterItem)
    const target = letters.find((item) => item.id === letterId)
    if (!target) throw new Error('这封信已经不在了')
    if (!target.openedBy.includes(openid)) target.openedBy.push(openid)
    await document.update({ data: { letters: command.set(letters), updatedAt: db.serverDate(), updatedBy: openid } })
  })
  return success({ letters })
}

async function withdrawLetter(openid, event) {
  const { household } = await requireMembership(openid)
  const letterId = textSlice(event.letterId, 48)
  if (!letterId) throw new Error('没有找到这封信')
  let letters = []
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const data = response.data || emptySharedData(household._id)
    const current = (Array.isArray(data.letters) ? data.letters : []).map(sanitizeLetterItem)
    const target = current.find((item) => item.id === letterId)
    if (!target) throw new Error('这封信已经不在了')
    if (target.authorOpenid !== openid) throw new Error('只能撤回自己写的信')
    letters = current.filter((item) => item.id !== letterId)
    await document.update({
      data: {
        letters: command.set(letters),
        updatedAt: db.serverDate(),
        updatedBy: openid
      }
    })
  })
  return success({ letters })
}

async function updateResource(openid, event) {
  const { household } = await requireMembership(openid)
  const resource = String(event.resource || '')
  const value = sanitizeResource(resource, event.value)
  const expectedVersion = Math.max(0, Number(event.version) || 0)
  let nextVersion = expectedVersion + 1
  try {
    if (SHARDED_RESOURCES.includes(resource)) {
      await db.runTransaction(async (transaction) => {
        const sharedDocument = transaction.collection('family_data').doc(household._id)
        const resourceDocument = transaction.collection('family_resources').doc(resourceDocumentId(household._id, resource))
        const sharedResponse = await sharedDocument.get()
        const shared = sharedResponse.data || {}
        let current = null
        try {
          const resourceResponse = await resourceDocument.get()
          current = resourceResponse.data || null
        } catch (error) {
          if (!isDocumentNotFoundError(error)) throw error
        }
        const versions = shared.resourceVersions && typeof shared.resourceVersions === 'object' ? shared.resourceVersions : {}
        const currentVersion = Math.max(0, Number(current ? current.version : versions[resource]) || 0)
        if (currentVersion !== expectedVersion) throw new Error('DATA_CONFLICT: 数据已被其他成员更新')
        nextVersion = currentVersion + 1
        await resourceDocument.set({
          data: { householdId: household._id, resource, value, version: nextVersion, updatedAt: db.serverDate(), updatedBy: openid }
        })
        const metadata = { updatedAt: db.serverDate(), updatedBy: openid, resourceSchemaVersion: 1 }
        metadata[resource] = command.remove()
        metadata[`resourceVersions.${resource}`] = nextVersion
        await sharedDocument.update({ data: metadata })
      })
      return success({ resource, updated: true, version: nextVersion })
    }
    await db.runTransaction(async (transaction) => {
      const document = transaction.collection('family_data').doc(household._id)
      const response = await document.get()
      const data = response.data || {}
      const versions = data.resourceVersions && typeof data.resourceVersions === 'object' ? data.resourceVersions : {}
      const currentVersion = Math.max(0, Number(versions[resource]) || 0)
      if (currentVersion !== expectedVersion) throw new Error('DATA_CONFLICT: 数据已被其他成员更新')
      nextVersion = currentVersion + 1
      const update = { updatedAt: db.serverDate(), updatedBy: openid }
      update[resource] = command.set(value)
      update[`resourceVersions.${resource}`] = nextVersion
      await document.update({ data: update })
    })
  } catch (error) {
    if (isDocumentNotFoundError(error)) throw new Error('家庭数据尚未初始化，请重新进入云空间')
    throw error
  }
  return success({ resource, updated: true, version: nextVersion })
}

async function migrateLocal(openid, event) {
  const { household } = await requireMembership(openid)
  await getSharedData(openid)
  const local = event.data || {}
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const current = response.data || emptySharedData(household._id)
    const update = { updatedAt: db.serverDate(), updatedBy: openid }
    if (!Object.keys(current.cart || {}).length) update.cart = sanitizeResource('cart', local.cart || {})
    const currentFarm = sanitizeFarmState(current.farm)
    const currentFlower = sanitizeFlowerState(current.flower)
    if (JSON.stringify(currentFarm) === JSON.stringify(createDefaultFarmState())) update.farm = sanitizeResource('farm', local.farm || null)
    if (JSON.stringify(currentFlower) === JSON.stringify(createDefaultFlowerState())) update.flower = sanitizeResource('flower', local.flower || null)
    if (!current.anniversary) update.anniversary = sanitizeResource('anniversary', local.anniversary || null)
    const localMessages = sanitizeResource('messages', local.messages || [])
    if (!(current.messages || []).length && localMessages.length) {
      const versions = current.resourceVersions && typeof current.resourceVersions === 'object' ? current.resourceVersions : {}
      update.messages = localMessages
      update['resourceVersions.messages'] = Math.max(0, Number(versions.messages) || 0) + 1
    }
    const localLetters = sanitizeResource('letters', local.letters || [])
    if (!(current.letters || []).length && localLetters.length) update.letters = localLetters
    await document.update({ data: update })
  })
  for (const resource of SHARDED_RESOURCES) {
    const candidate = sanitizeResource(resource, local[resource] || [])
    if (!candidate.length) continue
    await db.runTransaction(async (transaction) => {
      const sharedDocument = transaction.collection('family_data').doc(household._id)
      const resourceDocument = transaction.collection('family_resources').doc(resourceDocumentId(household._id, resource))
      const sharedResponse = await sharedDocument.get()
      const resourceResponse = await resourceDocument.get()
      const existing = resourceResponse.data || {}
      if (Array.isArray(existing.value) && existing.value.length) return
      const shared = sharedResponse.data || {}
      const versions = shared.resourceVersions && typeof shared.resourceVersions === 'object' ? shared.resourceVersions : {}
      const version = Math.max(0, Number(existing.version || versions[resource]) || 0) + 1
      await resourceDocument.set({
        data: { householdId: household._id, resource, value: candidate, version, updatedAt: db.serverDate(), updatedBy: openid }
      })
      const metadata = { updatedAt: db.serverDate(), updatedBy: openid }
      metadata[`resourceVersions.${resource}`] = version
      await sharedDocument.update({ data: metadata })
    })
  }
  return getSharedData(openid)
}

async function notifyOrderAdmin(openid, event) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (!primaryAdminOpenid || openid === primaryAdminOpenid || !members.includes(primaryAdminOpenid)) {
    return success({ notified: false, reason: 'no_receiver' })
  }
  const order = sanitizeOrderNoticeOrder(event.order)
  const timestamp = Date.now()
  const notice = {
    id: `notice-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    householdId: household._id,
    orderId: order.id,
    summary: order.summary,
    remark: order.remark,
    itemCount: order.itemCount,
    createdAt: timestamp,
    createdAtText: order.createdAtText,
    read: false,
    type: 'order',
    actorOpenid: openid,
    receiverOpenid: primaryAdminOpenid
  }

  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const data = response.data || emptySharedData(household._id)
    const orderNotices = [notice].concat(Array.isArray(data.orderNotices) ? data.orderNotices : []).slice(0, 50)
    await document.update({
      data: { orderNotices: command.set(orderNotices), updatedAt: db.serverDate(), updatedBy: openid }
    })
  })
  const push = await trySendOrderSubscribeMessage(primaryAdminOpenid, notice)
  return success({ notified: true, pushed: push.sent, notice: { id: notice.id, orderId: notice.orderId } })
}

async function markOrderNoticesRead(openid) {
  const { household } = await requireMembership(openid)
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const data = response.data || emptySharedData(household._id)
    const orderNotices = (Array.isArray(data.orderNotices) ? data.orderNotices : []).map((notice) => {
      if (notice && notice.receiverOpenid === openid) return Object.assign({}, notice, { read: true })
      return notice
    })
    await document.update({ data: { orderNotices: command.set(orderNotices), updatedAt: db.serverDate(), updatedBy: openid } })
  })
  return success({ updated: true })
}

async function toggleMessageReaction(openid, event) {
  const { household } = await requireMembership(openid)
  const messageId = textSlice(event.messageId, 40)
  const emoji = String(event.emoji || '')
  if (!messageId) throw new Error('缺少消息标识')
  if (!MESSAGE_REACTION_EMOJIS.includes(emoji)) throw new Error('不支持的表情')
  let messages = []
  let nextVersion = 0
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_data').doc(household._id)
    const response = await document.get()
    const data = response.data || emptySharedData(household._id)
    const versions = data.resourceVersions && typeof data.resourceVersions === 'object' ? data.resourceVersions : {}
    nextVersion = Math.max(0, Number(versions.messages) || 0) + 1
    messages = Array.isArray(data.messages) ? data.messages.map(sanitizeMessageItem) : []
    const target = messages.find((item) => item.id === messageId)
    if (!target) throw new Error('这条悄悄话不存在了')
    const reactions = target.reactions || {}
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : []
    if (users.includes(openid)) {
      const next = users.filter((u) => u !== openid)
      if (next.length) reactions[emoji] = next
      else delete reactions[emoji]
    } else {
      reactions[emoji] = users.concat(openid).slice(0, MESSAGE_REACTION_USER_LIMIT)
    }
    target.reactions = reactions
    await document.update({
      data: {
        messages: command.set(messages),
        'resourceVersions.messages': nextVersion,
        updatedAt: db.serverDate(),
        updatedBy: openid
      }
    })
  })
  return success({ messages, version: nextVersion })
}

async function listMembers(openid) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  const users = await Promise.all(members.map((memberOpenid) => getUser(memberOpenid)))
  const list = members.map((memberOpenid, index) => {
    const user = users[index] || {}
    const isAdmin = memberOpenid === primaryAdminOpenid
    return {
      openid: memberOpenid,
      nickname: textSlice(user.nickname, 12) || (isAdmin ? '管理员' : `成员${index + 1}`),
      isAdmin,
      isSelf: memberOpenid === openid,
      roleLabel: isAdmin ? '管理员' : '成员'
    }
  })
  return success({ members: list, isAdmin: openid === primaryAdminOpenid })
}

async function recordVisit(openid, event) {
  const user = await getUser(openid)
  if (!user || !user.householdId) return success({ recorded: false })
  const household = await getHousehold(user.householdId)
  const members = household && Array.isArray(household.members) ? household.members : []
  if (!household || !members.includes(openid)) return success({ recorded: false })
  await db.collection('family_visits').add({
    data: {
      householdId: household._id,
      openid,
      scene: textSlice(event.scene, 20),
      path: textSlice(event.path, 80),
      enteredAtMs: Date.now(),
      enteredAt: db.serverDate()
    }
  })
  if (Math.random() < 0.05) cleanupExpiredVisits(household._id).catch((error) => console.warn('清理过期访问记录失败', error))
  return success({ recorded: true })
}

function maskOpenid(openid) {
  const value = String(openid || '')
  if (value.length <= 8) return value ? `${value.slice(0, 2)}***` : ''
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

async function cleanupExpiredVisits(householdId) {
  const cutoff = Date.now() - VISIT_RETENTION_DAYS * 86400000
  for (let guard = 0; guard < 5; guard += 1) {
    const response = await db.collection('family_visits')
      .where({ householdId, enteredAtMs: command.lt(cutoff) })
      .limit(100)
      .get()
    const expired = response.data || []
    if (!expired.length) break
    await Promise.all(expired.map((item) => db.collection('family_visits').doc(item._id).remove()))
    if (expired.length < 100) break
  }
}

async function cleanupHouseholdAuxiliaryData(householdId) {
  await Promise.all(SHARDED_RESOURCES.map((resource) => (
    db.collection('family_resources').doc(resourceDocumentId(householdId, resource)).remove().catch(() => {})
  )))
  for (let guard = 0; guard < 20; guard += 1) {
    const response = await db.collection('family_visits').where({ householdId }).limit(100).get()
    const records = response.data || []
    if (!records.length) break
    await Promise.all(records.map((item) => db.collection('family_visits').doc(item._id).remove().catch(() => {})))
    if (records.length < 100) break
  }
  for (let guard = 0; guard < 20; guard += 1) {
    const usage = await db.collection('family_ai_usage').where({ householdId }).limit(100).get()
    const records = usage.data || []
    if (!records.length) break
    await Promise.all(records.map((item) => db.collection('family_ai_usage').doc(item._id).remove().catch(() => {})))
    if (records.length < 100) break
  }
}

async function listVisitRecords(openid, event = {}) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (openid !== primaryAdminOpenid) throw new Error('只有管理员可以查看进入记录')
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 5, 1), 20)
  const page = Math.max(Number(event.page) || 1, 1)
  const skip = (page - 1) * pageSize
  const users = await Promise.all(members.map((memberOpenid) => getUser(memberOpenid)))
  const nicknameMap = members.reduce((map, memberOpenid, index) => {
    const user = users[index] || {}
    const isAdmin = memberOpenid === primaryAdminOpenid
    map[memberOpenid] = textSlice(user.nickname, 12) || (isAdmin ? '管理员' : `成员${index + 1}`)
    return map
  }, {})
  const [countResponse, response] = await Promise.all([
    db.collection('family_visits').where({ householdId: household._id }).count(),
    db.collection('family_visits')
      .where({ householdId: household._id })
      .orderBy('enteredAtMs', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ])
  const records = (response.data || []).map((record) => {
    const actorOpenid = record.openid || ''
    const isAdmin = actorOpenid === primaryAdminOpenid
    return {
      id: record._id,
      openidMasked: maskOpenid(actorOpenid),
      nickname: nicknameMap[actorOpenid] || '已退出成员',
      isAdmin,
      isSelf: actorOpenid === openid,
      roleLabel: isAdmin ? '管理员' : '成员',
      scene: record.scene || '',
      path: record.path || '',
      enteredAtMs: Number(record.enteredAtMs) || 0
    }
  })
  return success({
    records,
    page,
    pageSize,
    total: Number(countResponse.total) || 0
  })
}

async function clearVisitRecords(openid) {
  const { household } = await requireMembership(openid)
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (openid !== primaryAdminOpenid) throw new Error('只有管理员可以清空进入记录')
  let removed = 0
  // 云开发单次 remove 最多删 1000 条，循环批量清空当前家庭的全部进入记录
  for (let guard = 0; guard < 50; guard += 1) {
    const response = await db.collection('family_visits')
      .where({ householdId: household._id })
      .limit(1000)
      .get()
    const ids = (response.data || []).map((item) => item._id)
    if (!ids.length) break
    await Promise.all(ids.map((id) => db.collection('family_visits').doc(id).remove().catch(() => {})))
    removed += ids.length
    if (ids.length < 1000) break
  }
  return success({ cleared: true, removed })
}

function buildAiSystemPrompt(context) {
  const lines = [
    `你叫"${AI_NAME}"，是"家庭空间"小程序里的家庭生活助手，说话温暖、简洁、口语化。`,
    '主要帮家人决定"今晚吃什么"、根据菜单推荐搭配、给生活与家务小建议。',
    '回答控制在 120 字以内，能直接给结论就不要绕弯。'
  ]
  const menu = context && Array.isArray(context.menu) ? context.menu : []
  if (menu.length) {
    const names = menu.map((item) => textSlice(item, 20)).filter(Boolean).slice(0, 40)
    if (names.length) lines.push(`家里现有菜单可参考：${names.join('、')}。推荐时尽量从中挑选。`)
  }
  return lines.join('\n')
}

function normalizeAiMessages(rawMessages) {
  const list = Array.isArray(rawMessages) ? rawMessages : []
  const cleaned = list
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && item.content)
    .slice(-AI_MAX_HISTORY)
    .map((item) => ({ role: item.role, content: textSlice(item.content, AI_MAX_CONTENT) }))
  // 丢弃开头的 assistant 消息（如欢迎语），保证对话从用户提问开始，避免浪费 token 与语义错乱
  while (cleaned.length && cleaned[0].role === 'assistant') cleaned.shift()
  return cleaned
}

function requestGlm(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const req = https.request({
      hostname: GLM_HOST,
      path: GLM_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 20000
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, json: JSON.parse(data || '{}') })
        } catch (error) {
          reject(new Error('AI 返回解析失败'))
        }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('AI 请求超时')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function setAiApiKey(openid, event) {
  const { household } = await requireMembership(openid)
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (openid !== primaryAdminOpenid) throw new Error(`只有管理员可以配置${AI_NAME}`)
  const apiKey = textSlice(event.apiKey, 200)
  await db.collection('family_households').doc(household._id).update({
    data: { glmApiKey: apiKey, updatedAt: db.serverDate() }
  })
  const updated = await getHousehold(household._id)
  return success({ household: publicHousehold(updated, openid) })
}

async function aiChat(openid, event) {
  const { household } = await requireMembership(openid)
  const apiKey = textSlice(household.glmApiKey, 200)
  if (!apiKey) throw new Error(`${AI_NAME}还没配置，请让管理员在家庭云空间里添加 API Key`)
  const history = normalizeAiMessages(event.messages)
  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new Error('请先说点什么')
  }
  await consumeAiQuota(household._id, openid)
  const messages = [{ role: 'system', content: buildAiSystemPrompt(event.context) }].concat(history)
  const { statusCode, json } = await requestGlm(apiKey, {
    model: GLM_MODEL,
    messages,
    // 饭团是轻量家庭对话，关闭深度思考：GLM-5.2 默认开启 thinking 会消耗大量 token 且拖慢响应
    thinking: { type: 'disabled' },
    temperature: 0.7,
    max_tokens: 2048
  })
  if (statusCode !== 200) {
    const detail = json && json.error && json.error.message
    console.warn('GLM 调用失败', statusCode, detail)
    throw new Error(detail || `${AI_NAME}暂时不可用`)
  }
  const choice = json && Array.isArray(json.choices) ? json.choices[0] : null
  const reply = choice && choice.message ? textSlice(choice.message.content, AI_MAX_CONTENT) : ''
  if (!reply) throw new Error(`${AI_NAME}没有返回内容`)
  return success({ reply })
}

function aiUsageDate() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

async function consumeAiQuota(householdId, openid) {
  const documentId = `${householdId}_${openid}_${aiUsageDate()}`
  await db.runTransaction(async (transaction) => {
    const document = transaction.collection('family_ai_usage').doc(documentId)
    let usage = null
    try {
      const response = await document.get()
      usage = response.data || null
    } catch (error) {
      if (!isDocumentNotFoundError(error)) throw error
      usage = null
    }
    const now = Date.now()
    const count = Math.max(0, Number(usage && usage.count) || 0)
    const lastAt = Math.max(0, Number(usage && usage.lastAt) || 0)
    if (count >= AI_DAILY_LIMIT) throw new Error(`今天的 ${AI_NAME} 次数已经用完啦`)
    if (lastAt && now - lastAt < AI_MIN_INTERVAL_MS) throw new Error('说得太快啦，稍等几秒再试')
    await document.set({
      data: {
        householdId,
        openid,
        date: aiUsageDate(),
        count: count + 1,
        lastAt: now,
        updatedAt: db.serverDate()
      }
    })
  })
  if (Math.random() < 0.02) cleanupOldAiUsage().catch((error) => console.warn('清理 AI 用量记录失败', error))
}

async function cleanupOldAiUsage() {
  const cutoff = new Date(Date.now() - 90 * 86400000 + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
  const response = await db.collection('family_ai_usage').where({ date: command.lt(cutoff) }).limit(20).get()
  await Promise.all((response.data || []).map((item) => db.collection('family_ai_usage').doc(item._id).remove()))
}

async function setMemberNickname(openid, event) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  const targetOpenid = String(event.targetOpenid || openid)
  if (!members.includes(targetOpenid)) throw new Error('找不到这位成员')
  if (targetOpenid !== openid && openid !== primaryAdminOpenid) throw new Error('只有管理员可以修改其他成员的昵称')
  const nickname = textSlice(event.nickname, 12)
  if (!nickname) throw new Error('请输入昵称')
  await db.collection('family_users').doc(targetOpenid).update({
    data: { nickname, updatedAt: db.serverDate() }
  })
  return listMembers(openid)
}

async function removeMember(openid, event) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (openid !== primaryAdminOpenid) throw new Error('只有管理员可以移除成员')
  const targetOpenid = String(event.targetOpenid || '')
  if (!targetOpenid || !members.includes(targetOpenid)) throw new Error('找不到这位成员')
  if (targetOpenid === primaryAdminOpenid) throw new Error('管理员不能移除自己')
  await db.runTransaction(async (transaction) => {
    const householdDocument = transaction.collection('family_households').doc(household._id)
    const userDocument = transaction.collection('family_users').doc(targetOpenid)
    const dataDocument = transaction.collection('family_data').doc(household._id)
    const dataResponse = await dataDocument.get()
    const data = dataResponse.data || {}
    const orderNotices = (Array.isArray(data.orderNotices) ? data.orderNotices : []).filter((notice) => (
      notice && notice.receiverOpenid !== targetOpenid && notice.actorOpenid !== targetOpenid
    ))
    await householdDocument.update({ data: { members: command.pull(targetOpenid), updatedAt: db.serverDate() } })
    await userDocument.set({
      data: { openid: targetOpenid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    })
    await dataDocument.update({ data: { orderNotices: command.set(orderNotices), updatedAt: db.serverDate() } })
  })
  return listMembers(openid)
}

async function leaveHousehold(openid) {
  const user = await getUser(openid)
  if (!user || !user.householdId) return success({ active: false, dissolved: false })
  const household = await getHousehold(user.householdId)
  if (!household) {
    await db.collection('family_users').doc(openid).set({
      data: { openid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    })
    return success({ active: false, dissolved: false })
  }
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  const isAdmin = openid === primaryAdminOpenid

  if (isAdmin) {
    // 先禁止新成员加入；后续步骤均可安全重试，只有全部清理成功才返回完成。
    await db.collection('family_households').doc(household._id).update({
      data: { dissolving: true, inviteActive: false, updatedAt: db.serverDate() }
    })
    const otherMembers = members.filter((memberOpenid) => memberOpenid !== openid)
    await Promise.all(otherMembers.map((memberOpenid) => (
      db.collection('family_users').doc(memberOpenid).set({
        data: { openid: memberOpenid, householdId: '', nickname: '', updatedAt: db.serverDate() }
      })
    )))
    await cleanupHouseholdAuxiliaryData(household._id)
    await db.collection('family_data').doc(household._id).remove().catch((error) => {
      if (!isDocumentNotFoundError(error)) throw error
    })
    await db.collection('family_households').doc(household._id).remove().catch((error) => {
      if (!isDocumentNotFoundError(error)) throw error
    })
    await db.collection('family_users').doc(openid).set({
      data: { openid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    })
    return success({ active: false, dissolved: true })
  }

  // 普通成员仅退出自己
  await db.runTransaction(async (transaction) => {
    const householdDocument = transaction.collection('family_households').doc(household._id)
    const userDocument = transaction.collection('family_users').doc(openid)
    const dataDocument = transaction.collection('family_data').doc(household._id)
    const dataResponse = await dataDocument.get()
    const data = dataResponse.data || {}
    const orderNotices = (Array.isArray(data.orderNotices) ? data.orderNotices : []).filter((notice) => (
      notice && notice.receiverOpenid !== openid && notice.actorOpenid !== openid
    ))
    await householdDocument.update({ data: { members: command.pull(openid), updatedAt: db.serverDate() } })
    await userDocument.set({
      data: { openid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    })
    await dataDocument.update({ data: { orderNotices: command.set(orderNotices), updatedAt: db.serverDate() } })
  })
  return success({ active: false, dissolved: false })
}

exports.main = async (event) => {
  try {
    if (event.action === 'health') {
      return success({ status: 'ok', collections: COLLECTIONS })
    }
    try {
      await ensureCollections()
    } catch (error) {
      console.warn('ensureCollections 失败，继续执行', error.errMsg || error.message || error)
    }
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return failure('无法识别微信用户')
    switch (event.action) {
      case 'getSession': return getSession(OPENID)
      case 'createHousehold': return createHousehold(OPENID, event)
      case 'joinHousehold': return joinHousehold(OPENID, event)
      case 'getData': return getSharedData(OPENID)
      case 'getDataMeta': return getDataMeta(OPENID)
      case 'updateResource': return updateResource(OPENID, event)
      case 'migrateLocal': return migrateLocal(OPENID, event)
      case 'notifyOrderAdmin': return notifyOrderAdmin(OPENID, event)
      case 'markOrderNoticesRead': return markOrderNoticesRead(OPENID)
      case 'toggleMessageReaction': return toggleMessageReaction(OPENID, event)
      case 'sendLetter': return sendLetter(OPENID, event)
      case 'openLetter': return openLetter(OPENID, event)
      case 'withdrawLetter': return withdrawLetter(OPENID, event)
      case 'listMembers': return listMembers(OPENID)
      case 'recordVisit': return recordVisit(OPENID, event)
      case 'listVisitRecords': return listVisitRecords(OPENID, event)
      case 'clearVisitRecords': return clearVisitRecords(OPENID)
      case 'setAiApiKey': return setAiApiKey(OPENID, event)
      case 'aiChat': return aiChat(OPENID, event)
      case 'setMemberNickname': return setMemberNickname(OPENID, event)
      case 'removeMember': return removeMember(OPENID, event)
      case 'leaveHousehold': return leaveHousehold(OPENID)
      default: return failure('未知操作')
    }
  } catch (error) {
    console.error(error)
    return failure(error.message || '云端服务异常')
  }
}
