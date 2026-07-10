const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const COLLECTIONS = ['family_users', 'family_households', 'family_data', 'family_visits']
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
const MENU_CATEGORIES = ['main', 'dish', 'light', 'drink']
const MESSAGE_REACTION_EMOJIS = ['❤️', '😂', '👍', '🎉', '😢']
const MESSAGE_REACTION_USER_LIMIT = 50
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
    return null
  }
}

async function getHousehold(householdId) {
  if (!householdId) return null
  try {
    const response = await db.collection('family_households').doc(householdId).get()
    return response.data || null
  } catch (error) {
    return null
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
    updatedAt: db.serverDate()
  }
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
  const inviteCode = await uniqueInviteCode()
  const response = await db.collection('family_households').add({
    data: {
      name: String(event.name || '我们的小家').slice(0, 20),
      inviteCode,
      ownerOpenid: openid,
      primaryAdminOpenid: openid,
      members: [openid],
      inviteActive: true,
      createdAt: db.serverDate()
    }
  })
  const householdId = response._id
  await Promise.all([
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId, nickname: textSlice(event.nickname, 12) || '管理员', joinedAt: db.serverDate() }
    }),
    db.collection('family_data').doc(householdId).set({
      data: emptySharedData(householdId)
    })
  ])
  const household = await getHousehold(householdId)
  return success({ household: publicHousehold(household, openid) })
}

async function joinHousehold(openid, event) {
  const inviteCode = String(event.inviteCode || '').trim().toUpperCase()
  if (inviteCode.length !== 6) throw new Error('请输入邀请码')
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) throw new Error('你已经加入了一个家庭')
  const response = await db.collection('family_households').where({ inviteCode, inviteActive: true }).limit(1).get()
  const household = response.data[0]
  if (!household) throw new Error('没有找到这个邀请码')
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: {
        members: command.addToSet(openid),
        updatedAt: db.serverDate()
      }
    }),
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId: household._id, nickname: textSlice(event.nickname, 12) || '成员', joinedAt: db.serverDate() }
    })
  ])
  const updated = await getHousehold(household._id)
  return success({ household: publicHousehold(updated, openid) })
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
    data = emptySharedData(household._id)
    await db.collection('family_data').doc(household._id).set({ data })
  }
  return success({
    openid,
    cart: data.cart || {},
    todos: Array.isArray(data.todos) ? data.todos : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    wishes: Array.isArray(data.wishes) ? data.wishes : [],
    menus: Array.isArray(data.menus) ? data.menus : [],
    farm: sanitizeFarmState(data.farm),
    flower: sanitizeFlowerState(data.flower),
    places: Array.isArray(data.places) ? data.places : [],
    orderNotices: getVisibleOrderNotices(data, openid),
    anniversary: data.anniversary || null,
    messages: Array.isArray(data.messages) ? data.messages : [],
    letters: Array.isArray(data.letters) ? data.letters : [],
    updatedAt: data.updatedAt || null
  })
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
    text: textSlice(source.text, 360),
    authorOpenid: textSlice(source.authorOpenid, 60),
    authorName: textSlice(source.authorName, 12) || '小家成员',
    createdAt,
    openedBy: Array.isArray(source.openedBy)
      ? [...new Set(source.openedBy.map((value) => textSlice(value, 60)).filter(Boolean))].slice(0, 50)
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
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
  return value.slice(0, RESOURCE_LIMITS[resource])
}

async function sendLetter(openid, event) {
  const { user, household } = await requireMembership(openid)
  const text = textSlice(event.text, 360)
  if (!text) throw new Error('先写下想说的话吧')
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
      const data = response.data || emptySharedData(household._id)
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
    let data
    try {
      const response = await db.collection('family_data').doc(household._id).get()
      data = response.data || emptySharedData(household._id)
    } catch (missingError) {
      letters = [letter]
      await db.collection('family_data').doc(household._id).set({
        data: Object.assign(emptySharedData(household._id), {
          letters,
          updatedAt: db.serverDate(),
          updatedBy: openid
        })
      })
      return success({ letter, letters })
    }
    letters = [letter].concat(Array.isArray(data.letters) ? data.letters.map(sanitizeLetterItem) : [])
      .slice(0, RESOURCE_LIMITS.letters)
    await db.collection('family_data').doc(household._id).update({
      data: {
        letters: command.set(letters),
        updatedAt: db.serverDate(),
        updatedBy: openid
      }
    })
  }
  return success({ letter, letters })
}

async function openLetter(openid, event) {
  const { household } = await requireMembership(openid)
  const letterId = textSlice(event.letterId, 48)
  if (!letterId) throw new Error('没有找到这封信')
  const response = await db.collection('family_data').doc(household._id).get()
  const data = response.data || emptySharedData(household._id)
  const letters = (Array.isArray(data.letters) ? data.letters : []).map(sanitizeLetterItem)
  const targetIndex = letters.findIndex((item) => item.id === letterId)
  if (targetIndex === -1) throw new Error('这封信已经不在了')
  if (letters[targetIndex].openedBy.indexOf(openid) === -1) {
    const update = {
      updatedAt: db.serverDate(),
      updatedBy: openid
    }
    update[`letters.${targetIndex}.openedBy`] = command.addToSet(openid)
    await db.collection('family_data').doc(household._id).update({ data: update })
  }
  const updated = await db.collection('family_data').doc(household._id).get()
  return success({
    letters: (Array.isArray(updated.data.letters) ? updated.data.letters : []).map(sanitizeLetterItem)
  })
}

async function updateResource(openid, event) {
  const { household } = await requireMembership(openid)
  const resource = String(event.resource || '')
  const value = sanitizeResource(resource, event.value)
  const update = {
    updatedAt: db.serverDate(),
    updatedBy: openid
  }
  // 用 command.set 强制整字段替换：空对象 {} 直接 update 时 MongoDB 不会清空原字段（无子键即无操作），会导致清空购物车失效
  update[resource] = command.set(value)
  try {
    await db.collection('family_data').doc(household._id).update({ data: update })
  } catch (error) {
    // 文档不存在或更新失败时，确保有基础文档后重试，避免数据写丢
    const base = emptySharedData(household._id)
    await db.collection('family_data').doc(household._id).set({ data: Object.assign(base, { [resource]: value, updatedAt: db.serverDate(), updatedBy: openid }) })
  }
  return success({ resource, updated: true })
}

async function migrateLocal(openid, event) {
  const { household } = await requireMembership(openid)
  const response = await db.collection('family_data').doc(household._id).get()
  const current = response.data || emptySharedData(household._id)
  const local = event.data || {}
  const update = { updatedAt: db.serverDate(), updatedBy: openid }
  if (!Object.keys(current.cart || {}).length) update.cart = sanitizeResource('cart', local.cart || {})
  if (!(current.todos || []).length) update.todos = sanitizeResource('todos', local.todos || [])
  if (!(current.orders || []).length) update.orders = sanitizeResource('orders', local.orders || [])
  if (!(current.wishes || []).length) update.wishes = sanitizeResource('wishes', local.wishes || [])
  if (!(current.menus || []).length) update.menus = sanitizeResource('menus', local.menus || [])
  if (!current.farm) update.farm = sanitizeResource('farm', local.farm || null)
  if (!current.flower) update.flower = sanitizeResource('flower', local.flower || null)
  if (!(current.places || []).length) update.places = sanitizeResource('places', local.places || [])
  await db.collection('family_data').doc(household._id).update({ data: update })
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

  let data
  try {
    const response = await db.collection('family_data').doc(household._id).get()
    data = response.data || emptySharedData(household._id)
  } catch (error) {
    data = emptySharedData(household._id)
    await db.collection('family_data').doc(household._id).set({ data })
  }
  const orderNotices = [notice].concat(Array.isArray(data.orderNotices) ? data.orderNotices : []).slice(0, 50)
  await db.collection('family_data').doc(household._id).update({
    data: {
      orderNotices,
      updatedAt: db.serverDate(),
      updatedBy: openid
    }
  })
  const push = await trySendOrderSubscribeMessage(primaryAdminOpenid, notice)
  return success({ notified: true, pushed: push.sent, notice: { id: notice.id, orderId: notice.orderId } })
}

async function markOrderNoticesRead(openid) {
  const { household } = await requireMembership(openid)
  const response = await db.collection('family_data').doc(household._id).get()
  const data = response.data || emptySharedData(household._id)
  const orderNotices = (Array.isArray(data.orderNotices) ? data.orderNotices : []).map((notice) => {
    if (notice && notice.receiverOpenid === openid) return Object.assign({}, notice, { read: true })
    return notice
  })
  await db.collection('family_data').doc(household._id).update({
    data: {
      orderNotices,
      updatedAt: db.serverDate(),
      updatedBy: openid
    }
  })
  return success({ updated: true })
}

async function toggleMessageReaction(openid, event) {
  const { household } = await requireMembership(openid)
  const messageId = textSlice(event.messageId, 40)
  const emoji = String(event.emoji || '')
  if (!messageId) throw new Error('缺少消息标识')
  if (!MESSAGE_REACTION_EMOJIS.includes(emoji)) throw new Error('不支持的表情')
  const response = await db.collection('family_data').doc(household._id).get()
  const data = response.data || emptySharedData(household._id)
  const messages = Array.isArray(data.messages) ? data.messages.map(sanitizeMessageItem) : []
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
  await db.collection('family_data').doc(household._id).update({
    data: {
      messages: command.set(messages),
      updatedAt: db.serverDate(),
      updatedBy: openid
    }
  })
  return success({ messages })
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
  return success({ recorded: true })
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
      openid: actorOpenid,
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
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: { members: command.pull(targetOpenid), updatedAt: db.serverDate() }
    }),
    db.collection('family_users').doc(targetOpenid).set({
      data: { openid: targetOpenid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    }),
    removeMemberNotices(household._id, targetOpenid)
  ])
  return listMembers(openid)
}

// 清理某位成员相关（发给 TA 或由 TA 触发）的点餐通知
async function removeMemberNotices(householdId, memberOpenid) {
  try {
    const response = await db.collection('family_data').doc(householdId).get()
    const data = response.data
    if (!data || !Array.isArray(data.orderNotices) || !data.orderNotices.length) return
    const orderNotices = data.orderNotices.filter((notice) => (
      notice && notice.receiverOpenid !== memberOpenid && notice.actorOpenid !== memberOpenid
    ))
    if (orderNotices.length === data.orderNotices.length) return
    await db.collection('family_data').doc(householdId).update({
      data: { orderNotices, updatedAt: db.serverDate() }
    })
  } catch (error) {
    console.warn('清理成员通知失败', error.errMsg || error.message || error)
  }
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
    // 管理员退出即解散整个云空间，清理所有成员归属与共享数据
    await Promise.all(members.map((memberOpenid) => (
      db.collection('family_users').doc(memberOpenid).set({
        data: { openid: memberOpenid, householdId: '', nickname: '', updatedAt: db.serverDate() }
      })
    )))
    await Promise.all([
      db.collection('family_households').doc(household._id).remove().catch(() => {}),
      db.collection('family_data').doc(household._id).remove().catch(() => {})
    ])
    return success({ active: false, dissolved: true })
  }

  // 普通成员仅退出自己
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: { members: command.pull(openid), updatedAt: db.serverDate() }
    }),
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId: '', nickname: '', updatedAt: db.serverDate() }
    }),
    removeMemberNotices(household._id, openid)
  ])
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
      case 'updateResource': return updateResource(OPENID, event)
      case 'migrateLocal': return migrateLocal(OPENID, event)
      case 'notifyOrderAdmin': return notifyOrderAdmin(OPENID, event)
      case 'markOrderNoticesRead': return markOrderNoticesRead(OPENID)
      case 'toggleMessageReaction': return toggleMessageReaction(OPENID, event)
      case 'sendLetter': return sendLetter(OPENID, event)
      case 'openLetter': return openLetter(OPENID, event)
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
