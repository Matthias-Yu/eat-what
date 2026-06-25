const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const COLLECTIONS = ['family_users', 'family_households', 'family_data']
let collectionsReady = false
const RESOURCE_LIMITS = {
  todos: 500,
  orders: 100,
  wishes: 300,
  menus: 100,
  places: 500
}
const MENU_CATEGORIES = ['main', 'dish', 'light', 'drink']
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
    places: [],
    orderNotices: [],
    updatedAt: db.serverDate()
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
    maxMembers: 2,
    role: isPrimaryAdmin ? 'primary' : 'secondary',
    roleLabel: isPrimaryAdmin ? '主管理员' : '从管理员',
    canNotifyAdmin: !isPrimaryAdmin && members.length > 1 && members.includes(primaryAdminOpenid),
    orderNoticeTemplateId: process.env.ORDER_NOTICE_TEMPLATE_ID || ''
  }
}

function verifyFamilyCode(familyCode) {
  const expected = process.env.FAMILY_CREATE_SECRET_HASH || ''
  if (!expected) throw new Error('家庭创建权限尚未配置')
  const actual = crypto.createHash('sha256').update(String(familyCode || '').trim().toUpperCase()).digest('hex')
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('家庭创建口令不正确')
  }
}

async function enterHousehold(openid, event) {
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) {
    const existing = await getHousehold(currentUser.householdId)
    if (existing && existing.members.includes(openid)) {
      return success({ household: publicHousehold(existing, openid), created: false })
    }
  }

  verifyFamilyCode(event.familyCode)
  const response = await db.collection('family_households').limit(1).get()
  const household = response.data[0]

  if (!household) {
    const created = await db.collection('family_households').add({
      data: {
        name: '我们的小家',
        ownerOpenid: openid,
        primaryAdminOpenid: openid,
        members: [openid],
        inviteActive: false,
        createdAt: db.serverDate()
      }
    })
    const householdId = created._id
    await Promise.all([
      db.collection('family_users').doc(openid).set({
        data: { openid, householdId, joinedAt: db.serverDate() }
      }),
      db.collection('family_data').doc(householdId).set({
        data: emptySharedData(householdId)
      })
    ])
    const newHousehold = await getHousehold(householdId)
    return success({ household: publicHousehold(newHousehold, openid), created: true })
  }

  const members = Array.isArray(household.members) ? household.members : []
  if (members.length >= 2) throw new Error('这个家庭已经有两位成员')
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: { members: command.addToSet(openid), updatedAt: db.serverDate() }
    }),
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId: household._id, joinedAt: db.serverDate() }
    })
  ])
  const updated = await getHousehold(household._id)
  return success({ household: publicHousehold(updated, openid), created: false })
}

async function getSession(openid) {
  const user = await getUser(openid)
  if (!user || !user.householdId) return success({ active: false })
  const household = await getHousehold(user.householdId)
  if (!household || !household.members.includes(openid)) return success({ active: false })
  return success({ active: true, household: publicHousehold(household, openid) })
}

async function createHousehold(openid, event) {
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) {
    const existing = await getHousehold(currentUser.householdId)
    if (existing) return success({ household: publicHousehold(existing, openid) })
  }
  verifyFamilyCode(event.createCode)
  const anyHousehold = await db.collection('family_households').limit(1).get()
  if (anyHousehold.data.length) throw new Error('家庭已经创建，请使用邀请码加入')
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
      data: { openid, householdId, joinedAt: db.serverDate() }
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
  if (inviteCode.length !== 6) throw new Error('请输入 6 位邀请码')
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) throw new Error('你已经加入了一个家庭')
  const response = await db.collection('family_households').where({ inviteCode, inviteActive: true }).limit(1).get()
  const household = response.data[0]
  if (!household) throw new Error('没有找到这个邀请码')
  const members = Array.isArray(household.members) ? household.members : []
  if (!members.includes(openid) && members.length >= 2) throw new Error('这个家庭已经有两位成员')
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: {
        members: command.addToSet(openid),
        inviteActive: members.includes(openid) || members.length + 1 < 2,
        updatedAt: db.serverDate()
      }
    }),
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId: household._id, joinedAt: db.serverDate() }
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
    cart: data.cart || {},
    todos: Array.isArray(data.todos) ? data.todos : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    wishes: Array.isArray(data.wishes) ? data.wishes : [],
    menus: Array.isArray(data.menus) ? data.menus : [],
    places: Array.isArray(data.places) ? data.places : [],
    orderNotices: getVisibleOrderNotices(data, openid),
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
        thing1: { value: textSlice(notice.summary, 20) || '新的点餐订单' },
        thing2: { value: textSlice(notice.remark || '没有特别备注', 20) },
        thing3: { value: textSlice(notice.createdAtText || '刚刚', 20) }
      }
    })
    return { sent: true }
  } catch (error) {
    console.warn('发送订阅消息失败', error)
    return { sent: false, reason: error.errMsg || error.message || 'send_failed' }
  }
}

function sanitizeResource(resource, value) {
  if (resource === 'cart') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
  }
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_LIMITS, resource)) throw new Error('不支持的数据类型')
  if (!Array.isArray(value)) throw new Error('数据格式不正确')
  if (resource === 'wishes') return value.slice(0, RESOURCE_LIMITS.wishes).map(sanitizeWishItem)
  if (resource === 'menus') return value.slice(0, RESOURCE_LIMITS.menus).map(sanitizeMenuItem)
  return value.slice(0, RESOURCE_LIMITS[resource])
}

async function updateResource(openid, event) {
  const { household } = await requireMembership(openid)
  const resource = String(event.resource || '')
  const value = sanitizeResource(resource, event.value)
  const update = {
    updatedAt: db.serverDate(),
    updatedBy: openid
  }
  update[resource] = value
  await db.collection('family_data').doc(household._id).update({ data: update })
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

async function transferPrimaryAdmin(openid) {
  const { household } = await requireMembership(openid)
  const members = Array.isArray(household.members) ? household.members : []
  const primaryAdminOpenid = getPrimaryAdminOpenid(household)
  if (openid !== primaryAdminOpenid) throw new Error('只有主管理员可以转交权限')
  const nextAdminOpenid = members.find((member) => member !== openid)
  if (!nextAdminOpenid) throw new Error('需要另一位成员加入后才能转交')
  await db.collection('family_households').doc(household._id).update({
    data: {
      primaryAdminOpenid: nextAdminOpenid,
      updatedAt: db.serverDate()
    }
  })
  const updated = await getHousehold(household._id)
  return success({ household: publicHousehold(updated, openid) })
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
      case 'enterHousehold': return enterHousehold(OPENID, event)
      case 'getData': return getSharedData(OPENID)
      case 'updateResource': return updateResource(OPENID, event)
      case 'migrateLocal': return migrateLocal(OPENID, event)
      case 'notifyOrderAdmin': return notifyOrderAdmin(OPENID, event)
      case 'markOrderNoticesRead': return markOrderNoticesRead(OPENID)
      case 'transferPrimaryAdmin': return transferPrimaryAdmin(OPENID)
      default: return failure('未知操作')
    }
  } catch (error) {
    console.error(error)
    return failure(error.message || '云端服务异常')
  }
}
