const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const COLLECTIONS = ['family_users', 'family_households', 'family_data']
let collectionsReady = false
const RESOURCE_LIMITS = {
  todos: 500,
  orders: 100,
  places: 500
}

function success(data) {
  return { ok: true, data }
}

function failure(message) {
  return { ok: false, message }
}

async function ensureCollections() {
  if (collectionsReady) return
  if (typeof db.createCollection !== 'function') return
  await Promise.all(COLLECTIONS.map(async (name) => {
    try {
      await db.createCollection(name)
    } catch (error) {
      const message = String(error.errMsg || error.message || '')
      if (!message.includes('exist') && !message.includes('-502005')) throw error
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
    places: [],
    updatedAt: db.serverDate()
  }
}

function publicHousehold(household) {
  return {
    id: household._id,
    name: household.name,
    inviteCode: household.inviteCode,
    memberCount: Array.isArray(household.members) ? household.members.length : 0,
    maxMembers: 2
  }
}

async function getSession(openid) {
  const user = await getUser(openid)
  if (!user || !user.householdId) return success({ active: false })
  const household = await getHousehold(user.householdId)
  if (!household || !household.members.includes(openid)) return success({ active: false })
  return success({ active: true, household: publicHousehold(household) })
}

async function createHousehold(openid, event) {
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) {
    const existing = await getHousehold(currentUser.householdId)
    if (existing) return success({ household: publicHousehold(existing) })
  }
  const inviteCode = await uniqueInviteCode()
  const response = await db.collection('family_households').add({
    data: {
      name: String(event.name || '我们的小家').slice(0, 20),
      inviteCode,
      ownerOpenid: openid,
      members: [openid],
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
  return success({ household: publicHousehold(household) })
}

async function joinHousehold(openid, event) {
  const inviteCode = String(event.inviteCode || '').trim().toUpperCase()
  if (inviteCode.length !== 6) throw new Error('请输入 6 位邀请码')
  const currentUser = await getUser(openid)
  if (currentUser && currentUser.householdId) throw new Error('你已经加入了一个家庭')
  const response = await db.collection('family_households').where({ inviteCode }).limit(1).get()
  const household = response.data[0]
  if (!household) throw new Error('没有找到这个邀请码')
  const members = Array.isArray(household.members) ? household.members : []
  if (!members.includes(openid) && members.length >= 2) throw new Error('这个家庭已经有两位成员')
  await Promise.all([
    db.collection('family_households').doc(household._id).update({
      data: { members: command.addToSet(openid), updatedAt: db.serverDate() }
    }),
    db.collection('family_users').doc(openid).set({
      data: { openid, householdId: household._id, joinedAt: db.serverDate() }
    })
  ])
  const updated = await getHousehold(household._id)
  return success({ household: publicHousehold(updated) })
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
    places: Array.isArray(data.places) ? data.places : [],
    updatedAt: data.updatedAt || null
  })
}

function sanitizeResource(resource, value) {
  if (resource === 'cart') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
  }
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_LIMITS, resource)) throw new Error('不支持的数据类型')
  if (!Array.isArray(value)) throw new Error('数据格式不正确')
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
  if (!(current.places || []).length) update.places = sanitizeResource('places', local.places || [])
  await db.collection('family_data').doc(household._id).update({ data: update })
  return getSharedData(openid)
}

exports.main = async (event) => {
  try {
    await ensureCollections()
    if (event.action === 'health') {
      return success({ status: 'ok', collections: COLLECTIONS })
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
      default: return failure('未知操作')
    }
  } catch (error) {
    console.error(error)
    return failure(error.message || '云端服务异常')
  }
}
