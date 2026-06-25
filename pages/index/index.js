const { categories, menuItems } = require('../../data/menu')
const storage = require('../../utils/storage')
const dateUtil = require('../../utils/date')
const cloudService = require('../../utils/cloud')

const SEARCH_DEBOUNCE_MS = 120
const CLOUD_SYNC_DEBOUNCE_MS = 800

const DEFAULT_TODOS = [
  { id: 1, title: '记得给绿植浇水', note: '客厅和阳台', category: '家务', due: '今天', completed: false },
  { id: 2, title: '挑一部周末电影', note: '想看轻松一点的', category: '生活', due: '今晚', completed: false },
  { id: 3, title: '补充厨房纸和牛奶', note: '', category: '采购', due: '已完成', completed: true }
]

const TODO_CATEGORY_CLASS = {
  '生活': 'life',
  '家务': 'housework',
  '采购': 'shopping',
  '工作': 'work'
}

const CUSTOM_MENU_LIMIT = 100
const MENU_CATEGORIES = categories.filter((item) => item.id !== 'recommend')
const MENU_CATEGORY_MAP = MENU_CATEGORIES.reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
const CATEGORY_TONE = {
  main: 'honey',
  dish: 'sunset',
  light: 'mint',
  drink: 'blush'
}
const CATEGORY_EMOJI = {
  main: '🍚',
  dish: '🥢',
  light: '🥗',
  drink: '🥛'
}

function getMenuItemMap(items) {
  return items.reduce((map, item) => {
    map[item.id] = item
    return map
  }, {})
}

function textSlice(value, length) {
  return Array.from(String(value || '').trim()).slice(0, length).join('')
}

function parseMenuTags(value, category) {
  const tags = String(value || '')
    .split(/[,\s，、]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
  if (!tags.length) tags.push((MENU_CATEGORY_MAP[category] && MENU_CATEGORY_MAP[category].name) || '自定义')
  if (tags.length === 1) tags.push('新菜')
  return tags
}

function normalizeCustomMenuItem(item) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const category = MENU_CATEGORY_MAP[source.category] ? source.category : 'dish'
  const tags = Array.isArray(source.tags) ? source.tags.filter(Boolean).slice(0, 2) : parseMenuTags(source.tags, category)
  return {
    id: String(source.id || `custom-${Date.now()}`),
    name: textSlice(source.name, 18) || '小家新菜',
    description: textSlice(source.description, 28) || '小家新增菜单',
    highlight: textSlice(source.highlight || tags[0], 12) || '小家新增',
    category,
    emoji: textSlice(source.emoji, 2) || CATEGORY_EMOJI[category],
    image: textSlice(source.image, 120),
    tone: CATEGORY_TONE[category] || 'sunset',
    tags: tags.length > 1 ? tags : parseMenuTags(tags[0], category),
    recommended: !!source.recommended,
    custom: true
  }
}

function getAllMenuItems(customMenuItems) {
  return menuItems.concat((customMenuItems || []).map(normalizeCustomMenuItem))
}

function getRecommendedMenuItems(items) {
  return items.filter((item) => item.recommended).slice(0, 4)
}

function getFilteredMenuItems(items, category, keyword) {
  const normalizedKeyword = String(keyword || '').toLowerCase()
  return items
    .filter((item) => {
      const categoryMatched = category === 'recommend' ? item.recommended : item.category === category
      const searchText = `${item.name}${item.description}${item.tags.join('')}`.toLowerCase()
      const keywordMatched = !normalizedKeyword || searchText.includes(normalizedKeyword)
      return categoryMatched && keywordMatched
    })
}

function getCartView(cart, items) {
  const cartItems = items
    .filter((item) => cart[item.id])
    .map((item) => Object.assign({}, item, { quantity: cart[item.id] }))
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  return { cartItems, cartCount }
}

function createMenuDraft() {
  return {
    name: '',
    description: '',
    emoji: '',
    tags: '',
    category: 'dish',
    recommended: false
  }
}

function createWishDraft() {
  return { title: '', note: '' }
}

function getTodoView(todos, filter) {
  const normalizedTodos = (todos || [])
    .map((item) => Object.assign({}, item, { categoryClass: TODO_CATEGORY_CLASS[item.category] || 'life' }))
    .sort((a, b) => Number(a.completed) - Number(b.completed))
  const completed = normalizedTodos.filter((item) => item.completed).length
  const total = normalizedTodos.length
  const pending = total - completed
  let visibleTodos = normalizedTodos
  if (filter === 'pending') visibleTodos = normalizedTodos.filter((item) => !item.completed)
  if (filter === 'completed') visibleTodos = normalizedTodos.filter((item) => item.completed)
  return {
    todos: normalizedTodos,
    visibleTodos,
    homeTodos: normalizedTodos.filter((item) => !item.completed).slice(0, 2),
    todoStats: { total, completed, pending, percent: total ? Math.round(completed / total * 100) : 0 }
  }
}

function getWishView(wishes) {
  const normalizedWishes = (wishes || [])
    .map((item) => ({
      id: item.id || Date.now(),
      title: textSlice(item.title, 30) || '一起做一件小事',
      note: textSlice(item.note, 40),
      completed: !!item.completed,
      createdAt: item.createdAt || Date.now()
    }))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.createdAt) - Number(a.createdAt))
  const completed = normalizedWishes.filter((item) => item.completed).length
  const total = normalizedWishes.length
  return {
    wishes: normalizedWishes,
    wishStats: {
      total,
      completed,
      pending: total - completed
    }
  }
}

function getProfileStats(todos, orders) {
  const completedTodos = todos.filter((item) => item.completed).length
  return {
    orders: orders.length,
    todos: completedTodos,
    pending: todos.length - completedTodos
  }
}

function normalizeOrderNotice(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const createdAt = Number(source.createdAt) || Date.now()
  return {
    id: String(source.id || `notice-${createdAt}-${index}`),
    orderId: textSlice(source.orderId, 20),
    summary: textSlice(source.summary, 80) || '有新的点餐订单',
    remark: textSlice(source.remark, 40),
    itemCount: Math.max(0, Number(source.itemCount) || 0),
    createdAt,
    createdAtText: textSlice(source.createdAtText, 30) || '刚刚',
    read: !!source.read
  }
}

function getUnreadOrderNoticeCount(notices) {
  return (notices || []).filter((notice) => !notice.read).length
}

function getRoleManagerSummary(familyStatus, family, unreadCount) {
  if (familyStatus === 'loading') return '正在连接'
  if (familyStatus !== 'active' || !family) return '先连接'
  const roleLabel = family.roleLabel || (family.role === 'primary' ? '主管理员' : '从管理员')
  return unreadCount ? `${roleLabel} · ${unreadCount}条` : roleLabel
}

function getOrderSuccessCopy(order, family) {
  if (family && family.canNotifyAdmin) {
    return `订单 #${order.id} 已放进小家的厨房\n也会提醒主管理员来看一眼`
  }
  return `订单 #${order.id} 已放进小家的厨房\n接下来只需要期待美味`
}

function isSameCart(currentCart, nextCart) {
  const current = currentCart || {}
  const next = nextCart || {}
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  return currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key])
}

function isSameTodos(currentTodos, nextTodos) {
  if ((currentTodos || []).length !== (nextTodos || []).length) return false
  return nextTodos.every((nextTodo, index) => {
    const currentTodo = currentTodos[index] || {}
    return currentTodo.id === nextTodo.id
      && currentTodo.title === nextTodo.title
      && currentTodo.note === nextTodo.note
      && currentTodo.category === nextTodo.category
      && currentTodo.due === nextTodo.due
      && currentTodo.completed === nextTodo.completed
  })
}

function isSameList(currentList, nextList) {
  return JSON.stringify(currentList || []) === JSON.stringify(nextList || [])
}

Page({
  data: {
    activeTab: 'home',
    dateLabel: '',
    greeting: { text: '你好', icon: '☀️' },
    categories,
    menuCategories: MENU_CATEGORIES,
    menuItems,
    customMenuItems: [],
    recommendedItems: getRecommendedMenuItems(menuItems),
    filteredItems: getRecommendedMenuItems(menuItems),
    currentCategory: 'recommend',
    searchKeyword: '',
    cart: {},
    cartItems: [],
    cartCount: 0,
    flyingItem: { visible: false, emoji: '', image: '', name: '', highlight: '', tone: '', x: 0, y: 0, width: 0, height: 0, endX: 0, endY: 0, endRotate: 0 },
    showCart: false,
    orderRemark: '',
    orders: [],
    selectedOrder: null,
    showOrderDetail: false,
    showOrderSuccess: false,
    latestOrderId: '',
    orderSuccessCopy: '',
    familyStatus: 'loading',
    family: null,
    showFamilyPanel: false,
    familyCreateCode: '',
    familyBusy: false,
    familyError: '',
    showRoleManager: false,
    orderNotices: [],
    unreadOrderNoticeCount: 0,
    roleManagerSummary: getRoleManagerSummary('loading', null, 0),
    wishes: [],
    wishStats: { total: 0, completed: 0, pending: 0 },
    showWishComposer: false,
    wishDraft: createWishDraft(),
    todos: [],
    visibleTodos: [],
    homeTodos: [],
    todoFilter: 'all',
    todoStats: { total: 0, completed: 0, pending: 0, percent: 0 },
    showTodoComposer: false,
    editingTodoId: null,
    todoDraft: { title: '', note: '', category: '生活', due: '今天' },
    todoCategories: ['生活', '家务', '采购', '工作'],
    dueOptions: ['今天', '明天', '本周'],
    profileStats: { orders: 0, todos: 0, pending: 0 },
    showMenuManager: false,
    menuDraft: createMenuDraft()
  },

  onLoad() {
    const savedTodos = storage.read('todos', null)
    const cart = storage.read('cart', {})
    const orders = storage.read('orders', [])
    const savedWishes = storage.read('wishes', [])
    const savedOrderNotices = storage.read('orderNotices', [])
    const savedCustomMenuItems = storage.read('customMenuItems', [])
    const customMenuItems = (Array.isArray(savedCustomMenuItems) ? savedCustomMenuItems : [])
      .map(normalizeCustomMenuItem)
      .slice(0, CUSTOM_MENU_LIMIT)
    const allMenuItems = getAllMenuItems(customMenuItems)
    const todoView = getTodoView(savedTodos || DEFAULT_TODOS, this.data.todoFilter)
    const wishView = getWishView(Array.isArray(savedWishes) ? savedWishes : [])
    const orderNotices = (Array.isArray(savedOrderNotices) ? savedOrderNotices : []).map(normalizeOrderNotice)
    const unreadOrderNoticeCount = getUnreadOrderNoticeCount(orderNotices)
    const cartView = getCartView(cart, allMenuItems)
    this.menuItemMap = getMenuItemMap(allMenuItems)
    this.setData({
      dateLabel: dateUtil.todayLabel(),
      greeting: dateUtil.greeting(),
      menuItems: allMenuItems,
      customMenuItems,
      recommendedItems: getRecommendedMenuItems(allMenuItems),
      filteredItems: getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
      todos: todoView.todos,
      visibleTodos: todoView.visibleTodos,
      homeTodos: todoView.homeTodos,
      todoStats: todoView.todoStats,
      wishes: wishView.wishes,
      wishStats: wishView.wishStats,
      orderNotices,
      unreadOrderNoticeCount,
      roleManagerSummary: getRoleManagerSummary(this.data.familyStatus, this.data.family, unreadOrderNoticeCount),
      cart,
      cartItems: cartView.cartItems,
      cartCount: cartView.cartCount,
      orders,
      profileStats: getProfileStats(todoView.todos, orders)
    })
    this.initializeCloud()
  },

  onShow() {
    const greeting = dateUtil.greeting()
    const dateLabel = dateUtil.todayLabel()
    const update = {}
    if (this.data.dateLabel !== dateLabel) update.dateLabel = dateLabel
    if (this.data.greeting.text !== greeting.text || this.data.greeting.icon !== greeting.icon) update.greeting = greeting
    if (Object.keys(update).length) this.setData(update)
    this.startCloudPolling()
  },

  onHide() {
    this.flushCloudSyncs()
    this.stopCloudPolling()
  },

  onUnload() {
    if (this.flyTimer) clearTimeout(this.flyTimer)
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.flushCloudSyncs()
    this.stopCloudPolling()
  },

  onShareAppMessage() {
    return {
      title: '认真吃饭，好好生活｜小家菜单',
      path: '/pages/index/index?from=share'
    }
  },

  onShareTimeline() {
    return {
      title: '认真吃饭，好好生活｜小家菜单',
      query: 'from=timeline'
    }
  },

  async initializeCloud() {
    try {
      cloudService.init()
      const session = await cloudService.call('getSession')
      if (!session.active) {
        this.setData({
          familyStatus: 'none',
          family: null,
          showFamilyPanel: false,
          familyError: '',
          roleManagerSummary: getRoleManagerSummary('none', null, this.data.unreadOrderNoticeCount)
        })
        return
      }
      this.setData({
        familyStatus: 'active',
        family: session.household,
        familyError: '',
        roleManagerSummary: getRoleManagerSummary('active', session.household, this.data.unreadOrderNoticeCount)
      })
      await this.pullCloudData()
      this.startCloudPolling()
    } catch (error) {
      console.warn('云端初始化失败', error)
      this.setData({
        familyStatus: 'offline',
        familyError: error.message || '暂时无法连接云端',
        roleManagerSummary: getRoleManagerSummary('offline', this.data.family, this.data.unreadOrderNoticeCount)
      })
    }
  },

  async pullCloudData() {
    if (this.data.familyStatus !== 'active' || this.cloudWritePending > 0 || this.hasQueuedCloudSync()) return
    try {
      const data = await cloudService.call('getData')
      this.applyCloudData(data)
    } catch (error) {
      console.warn('拉取家庭数据失败', error)
    }
  },

  applyCloudData(data) {
    const cart = data.cart || {}
    const todos = Array.isArray(data.todos) ? data.todos : []
    const orders = Array.isArray(data.orders) ? data.orders : []
    const wishes = Array.isArray(data.wishes) ? data.wishes : []
    const orderNotices = Array.isArray(data.orderNotices) ? data.orderNotices.map(normalizeOrderNotice) : []
    const customMenuItems = Array.isArray(data.menus) ? data.menus.map(normalizeCustomMenuItem).slice(0, CUSTOM_MENU_LIMIT) : []
    const menuItemsForView = getAllMenuItems(customMenuItems)
    const cartView = getCartView(cart, menuItemsForView)
    const todoView = getTodoView(todos, this.data.todoFilter)
    const wishView = getWishView(wishes)
    const cartChanged = !isSameCart(this.data.cart, cart)
    const todosChanged = !isSameTodos(this.data.todos, todoView.todos)
    const ordersChanged = !isSameList(this.data.orders, orders)
    const wishesChanged = !isSameList(this.data.wishes, wishView.wishes)
    const noticesChanged = !isSameList(this.data.orderNotices, orderNotices)
    const menusChanged = !isSameList(this.data.customMenuItems, customMenuItems)
    const previousUnreadNoticeCount = this.data.unreadOrderNoticeCount
    const update = {}

    if (menusChanged) {
      this.menuItemMap = getMenuItemMap(menuItemsForView)
      storage.write('customMenuItems', customMenuItems)
      Object.assign(update, {
        menuItems: menuItemsForView,
        customMenuItems,
        recommendedItems: getRecommendedMenuItems(menuItemsForView),
        filteredItems: getFilteredMenuItems(menuItemsForView, this.data.currentCategory, this.data.searchKeyword)
      })
    }
    if (cartChanged || menusChanged) {
      storage.write('cart', cart)
      Object.assign(update, {
        cart,
        cartItems: cartView.cartItems,
        cartCount: cartView.cartCount
      })
    }
    if (todosChanged) {
      storage.write('todos', todoView.todos)
      Object.assign(update, {
        todos: todoView.todos,
        visibleTodos: todoView.visibleTodos,
        homeTodos: todoView.homeTodos,
        todoStats: todoView.todoStats
      })
    }
    if (ordersChanged) {
      storage.write('orders', orders)
      update.orders = orders
    }
    if (wishesChanged) {
      storage.write('wishes', wishView.wishes)
      Object.assign(update, {
        wishes: wishView.wishes,
        wishStats: wishView.wishStats
      })
    }
    if (noticesChanged) {
      const unreadOrderNoticeCount = getUnreadOrderNoticeCount(orderNotices)
      storage.write('orderNotices', orderNotices)
      Object.assign(update, {
        orderNotices,
        unreadOrderNoticeCount,
        roleManagerSummary: getRoleManagerSummary(this.data.familyStatus, this.data.family, unreadOrderNoticeCount)
      })
      if (this.cloudDataReady && unreadOrderNoticeCount > previousUnreadNoticeCount && this.data.family && this.data.family.role === 'primary') {
        wx.showToast({ title: '收到新的点餐通知', icon: 'none' })
      }
    }
    if (todosChanged || ordersChanged) {
      update.profileStats = getProfileStats(todosChanged ? todoView.todos : this.data.todos, ordersChanged ? orders : this.data.orders)
    }
    if (Object.keys(update).length) this.setData(update)
    this.cloudDataReady = true
  },

  commitCustomMenuItems(customMenuItems, options = {}) {
    const normalizedMenuItems = customMenuItems.map(normalizeCustomMenuItem).slice(0, CUSTOM_MENU_LIMIT)
    const allMenuItems = getAllMenuItems(normalizedMenuItems)
    const cart = options.cart || this.data.cart
    const cartView = getCartView(cart, allMenuItems)
    this.menuItemMap = getMenuItemMap(allMenuItems)
    const update = Object.assign({
      menuItems: allMenuItems,
      customMenuItems: normalizedMenuItems,
      recommendedItems: getRecommendedMenuItems(allMenuItems),
      filteredItems: getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
      cartItems: cartView.cartItems,
      cartCount: cartView.cartCount
    }, options.extraData || {})
    if (options.cart) update.cart = cart
    this.setData(update)
    if (options.persist !== false) storage.write('customMenuItems', normalizedMenuItems)
    if (options.sync) this.syncCloudResource('menus', normalizedMenuItems, { debounce: true })
    return normalizedMenuItems
  },

  hasQueuedCloudSync() {
    return !!(this.cloudSyncQueue && Object.keys(this.cloudSyncQueue).length)
  },

  syncCloudResource(resource, value, options = {}) {
    if (this.data.familyStatus !== 'active') return Promise.resolve()
    if (options.debounce) return this.queueCloudResourceSync(resource, value)
    this.cancelQueuedCloudSync(resource)
    return this.writeCloudResource(resource, value)
  },

  writeCloudResource(resource, value) {
    if (this.data.familyStatus !== 'active') return Promise.resolve()
    this.cloudWritePending = (this.cloudWritePending || 0) + 1
    return cloudService.call('updateResource', { resource, value })
      .catch((error) => console.warn(`同步 ${resource} 失败`, error))
      .finally(() => {
        this.cloudWritePending = Math.max(0, (this.cloudWritePending || 1) - 1)
      })
  },

  queueCloudResourceSync(resource, value) {
    if (!this.cloudSyncQueue) this.cloudSyncQueue = {}
    if (!this.cloudSyncTimers) this.cloudSyncTimers = {}
    this.cloudSyncQueue[resource] = value
    if (this.cloudSyncTimers[resource]) clearTimeout(this.cloudSyncTimers[resource])
    this.cloudSyncTimers[resource] = setTimeout(() => {
      this.flushCloudResourceSync(resource)
    }, CLOUD_SYNC_DEBOUNCE_MS)
    return Promise.resolve()
  },

  cancelQueuedCloudSync(resource) {
    if (this.cloudSyncTimers && this.cloudSyncTimers[resource]) {
      clearTimeout(this.cloudSyncTimers[resource])
      delete this.cloudSyncTimers[resource]
    }
    if (this.cloudSyncQueue) delete this.cloudSyncQueue[resource]
  },

  flushCloudResourceSync(resource) {
    if (!this.cloudSyncQueue || !Object.prototype.hasOwnProperty.call(this.cloudSyncQueue, resource)) {
      return Promise.resolve()
    }
    const value = this.cloudSyncQueue[resource]
    this.cancelQueuedCloudSync(resource)
    return this.writeCloudResource(resource, value)
  },

  flushCloudSyncs() {
    if (!this.cloudSyncQueue) return
    Object.keys(this.cloudSyncQueue).forEach((resource) => {
      this.flushCloudResourceSync(resource)
    })
  },

  startCloudPolling() {
    if (this.data.familyStatus !== 'active' || this.cloudPollTimer) return
    this.cloudPollTimer = setInterval(() => this.pullCloudData(), 12000)
  },

  stopCloudPolling() {
    if (!this.cloudPollTimer) return
    clearInterval(this.cloudPollTimer)
    this.cloudPollTimer = null
  },

  openFamilyPanel() {
    this.setData({ showFamilyPanel: true, familyError: '' })
    if (this.data.familyStatus === 'active') {
      cloudService.call('getSession')
        .then((session) => {
          if (session.active) {
            this.setData({
              family: session.household,
              roleManagerSummary: getRoleManagerSummary(this.data.familyStatus, session.household, this.data.unreadOrderNoticeCount)
            })
          }
        })
        .catch((error) => console.warn('刷新家庭信息失败', error))
    }
  },

  closeFamilyPanel() {
    this.setData({ showFamilyPanel: false, familyError: '' })
  },

  onFamilyCreateCodeInput(event) {
    const value = event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    this.setData({ familyCreateCode: value })
  },

  async enterFamily() {
    if (this.data.familyBusy) return
    if (this.data.familyCreateCode.length !== 10) {
      this.setData({ familyError: '请输入完整的 10 位家庭口令' })
      return
    }
    this.setData({ familyBusy: true, familyError: '' })
    try {
      const result = await cloudService.call('enterHousehold', { familyCode: this.data.familyCreateCode })
      this.setData({
        familyStatus: 'active',
        family: result.household,
        familyCreateCode: '',
        roleManagerSummary: getRoleManagerSummary('active', result.household, this.data.unreadOrderNoticeCount)
      })
      if (result.created) {
        const data = await cloudService.call('migrateLocal', {
          data: { cart: this.data.cart, todos: this.data.todos, orders: this.data.orders, wishes: this.data.wishes, menus: this.data.customMenuItems, places: [] }
        })
        this.applyCloudData(data)
      } else {
        await this.pullCloudData()
      }
      this.startCloudPolling()
      this.setData({ showFamilyPanel: false })
      wx.showToast({ title: result.created ? '小家已建立' : '已经回到小家', icon: 'success' })
    } catch (error) {
      this.setData({ familyError: error.message || '进入失败，请重试' })
    } finally {
      this.setData({ familyBusy: false })
    }
  },

  retryCloud() {
    this.setData({
      familyStatus: 'loading',
      familyError: '',
      roleManagerSummary: getRoleManagerSummary('loading', this.data.family, this.data.unreadOrderNoticeCount)
    })
    this.initializeCloud()
  },

  openRoleManager() {
    this.setData({ showRoleManager: true })
    if (this.data.familyStatus === 'active') {
      cloudService.call('getSession')
        .then((session) => {
          if (!session.active) return
          this.setData({
            family: session.household,
            roleManagerSummary: getRoleManagerSummary('active', session.household, this.data.unreadOrderNoticeCount)
          })
          this.pullCloudData()
        })
        .catch((error) => console.warn('刷新主从管理失败', error))
    }
  },

  closeRoleManager() {
    this.setData({ showRoleManager: false })
  },

  openFamilyFromRoleManager() {
    this.setData({ showRoleManager: false })
    this.openFamilyPanel()
  },

  markOrderNoticesRead() {
    if (!this.data.unreadOrderNoticeCount) return
    const orderNotices = this.data.orderNotices.map((notice) => Object.assign({}, notice, { read: true }))
    this.setData({
      orderNotices,
      unreadOrderNoticeCount: 0,
      roleManagerSummary: getRoleManagerSummary(this.data.familyStatus, this.data.family, 0)
    })
    storage.write('orderNotices', orderNotices)
    cloudService.call('markOrderNoticesRead')
      .catch((error) => {
        console.warn('同步通知已读失败', error)
        wx.showToast({ title: '已读状态稍后同步', icon: 'none' })
      })
  },

  requestOrderNoticeSubscribe() {
    const templateId = this.data.family && this.data.family.orderNoticeTemplateId
    if (!templateId || !wx.requestSubscribeMessage) {
      wx.showToast({ title: '暂未配置微信提醒', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (result) => {
        if (result[templateId] === 'accept') {
          wx.showToast({ title: '已允许一次提醒', icon: 'success' })
        } else {
          wx.showToast({ title: '未开启微信提醒', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '授权失败，请稍后再试', icon: 'none' })
      }
    })
  },

  transferPrimaryAdmin() {
    if (!this.data.family || this.data.family.role !== 'primary') return
    wx.showModal({
      title: '转交主管理员？',
      content: '转交后，对方会成为主管理员，并接收新的点餐通知。',
      confirmText: '转交',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        cloudService.call('transferPrimaryAdmin')
          .then((data) => {
            this.setData({
              family: data.household,
              roleManagerSummary: getRoleManagerSummary('active', data.household, this.data.unreadOrderNoticeCount)
            })
            wx.showToast({ title: '已转交', icon: 'success' })
          })
          .catch((error) => {
            wx.showToast({ title: error.message || '转交失败', icon: 'none' })
          })
      }
    })
  },

  noop() {},

  setTab(event) {
    const activeTab = event.detail.id
    const update = {}
    if (this.data.activeTab !== activeTab) update.activeTab = activeTab
    if (this.data.showCart) update.showCart = false
    if (Object.keys(update).length) this.setData(update)
  },

  navigateFromCard(event) {
    const target = event.currentTarget.dataset.target
    if (target === 'cart') {
      this.openCart()
      return
    }
    if (target === this.data.activeTab) return
    this.setData({ activeTab: target })
  },

  exploreMenu(event) {
    const category = event.currentTarget.dataset.category || 'recommend'
    this.applyMenuFilter(category, '', { activeTab: 'menu' })
  },

  selectCategory(event) {
    const category = event.currentTarget.dataset.id
    if (category === this.data.currentCategory) return
    this.applyMenuFilter(category, this.data.searchKeyword)
  },

  onSearch(event) {
    const searchKeyword = event.detail.value.trim()
    this.setData({ searchKeyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.setData({ filteredItems: getFilteredMenuItems(this.data.menuItems, this.data.currentCategory, this.data.searchKeyword) })
      this.searchTimer = null
    }, SEARCH_DEBOUNCE_MS)
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.applyMenuFilter(this.data.currentCategory, '')
  },

  applyMenuFilter(currentCategory, searchKeyword, extraData = {}) {
    this.setData(Object.assign({
      currentCategory,
      searchKeyword,
      filteredItems: getFilteredMenuItems(this.data.menuItems, currentCategory, searchKeyword)
    }, extraData))
  },

  addToCart(event) {
    const id = event.currentTarget.dataset.id
    const menuItem = (this.menuItemMap && this.menuItemMap[id]) || this.data.menuItems.find((item) => item.id === id)
    if (menuItem) this.playAddToCartAnimation(event, menuItem)
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + 1
    storage.write('cart', cart)
    this.updateCart(cart)
    this.syncCloudResource('cart', cart, { debounce: true })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  playAddToCartAnimation(event, menuItem) {
    const point = (event.changedTouches && event.changedTouches[0])
      || (event.touches && event.touches[0])
      || event.detail
      || {}
    const pointX = point.clientX !== undefined ? point.clientX : point.x
    const pointY = point.clientY !== undefined ? point.clientY : point.y
    const launch = (rect) => {
      const centerX = rect ? rect.left + rect.width / 2 : pointX
      const centerY = rect ? rect.top + rect.height / 2 : pointY
      if (typeof centerX !== 'number' || typeof centerY !== 'number') return
      this.launchFlyingCard(menuItem, centerX, centerY)
    }

    if (!wx.createSelectorQuery) {
      launch(null)
      return
    }
    wx.createSelectorQuery()
      .in(this)
      .select(`#dish-card-${menuItem.id}`)
      .boundingClientRect((rect) => launch(rect || null))
      .exec()
  },

  launchFlyingCard(menuItem, centerX, centerY) {
    const windowInfo = wx.getWindowInfo()
    const rpx = windowInfo.windowWidth / 750
    const safeBottom = windowInfo.safeArea ? Math.max(0, windowInfo.windowHeight - windowInfo.safeArea.bottom) : 0
    const isMenuPage = this.data.activeTab === 'menu'
    const targetX = isMenuPage ? 89 * rpx : 287 * rpx
    const targetY = windowInfo.windowHeight - safeBottom - (isMenuPage ? 188 : 66) * rpx
    const cardWidth = 220 * rpx
    const cardHeight = 132 * rpx
    const deltaX = targetX - centerX
    const deltaY = targetY - centerY
    const tilt = (Math.random() - 0.5) * 18

    if (this.flyTimer) clearTimeout(this.flyTimer)

    const flyingItem = {
      visible: true,
      emoji: menuItem.emoji,
      image: menuItem.image || '',
      name: menuItem.name,
      highlight: menuItem.highlight,
      tone: menuItem.tone,
      x: centerX - cardWidth / 2,
      y: centerY - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
      endX: deltaX,
      endY: deltaY,
      endRotate: tilt
    }

    this.setData({ 'flyingItem.visible': false })
    wx.nextTick(() => {
      this.setData({ flyingItem })
    })

    this.flyTimer = setTimeout(() => {
      this.setData({ 'flyingItem.visible': false })
    }, 1750)
  },

  changeCartQuantity(event) {
    const { id, delta } = event.currentTarget.dataset
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + Number(delta)
    if (cart[id] <= 0) delete cart[id]
    storage.write('cart', cart)
    this.updateCart(cart, !Object.keys(cart).length ? { showCart: false } : {})
    this.syncCloudResource('cart', cart, { debounce: true })
  },

  updateCart(cart, extraData = {}) {
    const cartView = getCartView(cart, this.data.menuItems)
    this.setData(Object.assign({ cart }, cartView, extraData))
    return cartView
  },

  refreshCart() {
    const cartView = getCartView(this.data.cart, this.data.menuItems)
    this.setData(cartView)
    return cartView
  },

  openCart() {
    if (!this.data.cartCount) {
      wx.showToast({ title: '先选几道喜欢的吧', icon: 'none' })
      return
    }
    this.setData({ showCart: true })
  },

  closeCart() {
    this.setData({ showCart: false })
  },

  onRemarkInput(event) {
    this.setData({ orderRemark: event.detail.value })
  },

  submitOrder() {
    if (!this.data.cartCount) return
    const timestamp = Date.now()
    const order = {
      id: String(timestamp).slice(-6),
      createdAt: dateUtil.orderTime(new Date(timestamp)),
      items: this.data.cartItems.map((item) => ({ id: item.id, name: item.name, emoji: item.emoji, image: item.image || '', quantity: item.quantity })),
      itemSummary: this.data.cartItems.map((item) => `${item.name} ×${item.quantity}`).join('、'),
      remark: this.data.orderRemark,
      status: '等你开饭'
    }
    const orders = [order].concat(this.data.orders).slice(0, 20)
    const emptyCartView = getCartView({}, this.data.menuItems)
    storage.write('orders', orders)
    storage.write('cart', {})
    this.syncCloudResource('orders', orders)
    this.syncCloudResource('cart', {})
    this.notifyPrimaryAdmin(order)
    this.setData({
      orders,
      cart: {},
      cartItems: emptyCartView.cartItems,
      cartCount: emptyCartView.cartCount,
      showCart: false,
      orderRemark: '',
      showOrderSuccess: true,
      latestOrderId: order.id,
      orderSuccessCopy: getOrderSuccessCopy(order, this.data.family),
      profileStats: getProfileStats(this.data.todos, orders)
    })
  },

  notifyPrimaryAdmin(order) {
    if (this.data.familyStatus !== 'active' || !this.data.family || !this.data.family.canNotifyAdmin) return
    cloudService.call('notifyOrderAdmin', { order })
      .catch((error) => console.warn('通知主管理员失败', error))
  },

  finishOrder() {
    this.setData({ showOrderSuccess: false, activeTab: 'home' })
  },

  openOrderDetail(event) {
    const id = String(event.currentTarget.dataset.id)
    const selectedOrder = this.data.orders.find((item) => String(item.id) === id)
    if (!selectedOrder) return
    this.setData({ selectedOrder, showOrderDetail: true })
  },

  closeOrderDetail() {
    this.setData({ showOrderDetail: false, selectedOrder: null })
  },

  commitWishes(wishes, options = {}) {
    const wishView = getWishView(wishes)
    this.setData(Object.assign(wishView, options.extraData || {}))
    if (options.persist !== false) storage.write('wishes', wishView.wishes)
    if (options.sync) this.syncCloudResource('wishes', wishView.wishes, { debounce: true })
    return wishView
  },

  openWishComposer() {
    this.setData({ showWishComposer: true })
  },

  closeWishComposer() {
    this.setData({ showWishComposer: false })
  },

  onWishTitleInput(event) {
    this.setData({ 'wishDraft.title': event.detail.value })
  },

  onWishNoteInput(event) {
    this.setData({ 'wishDraft.note': event.detail.value })
  },

  saveWish() {
    const draft = this.data.wishDraft
    const title = textSlice(draft.title, 30)
    if (!title) {
      wx.showToast({ title: '写下想一起做的事吧', icon: 'none' })
      return
    }
    const timestamp = Date.now()
    const wish = {
      id: timestamp,
      title,
      note: textSlice(draft.note, 40),
      completed: false,
      createdAt: timestamp
    }
    this.commitWishes([wish].concat(this.data.wishes), {
      sync: true,
      extraData: { wishDraft: createWishDraft(), showWishComposer: false }
    })
    wx.showToast({ title: '已记到心愿单', icon: 'success' })
  },

  toggleWish(event) {
    const id = String(event.currentTarget.dataset.id)
    const wishes = this.data.wishes.map((item) => {
      if (String(item.id) !== id) return item
      return Object.assign({}, item, { completed: !item.completed })
    })
    this.commitWishes(wishes, { sync: true })
  },

  deleteWish(event) {
    const id = String(event.currentTarget.dataset.id)
    const wish = this.data.wishes.find((item) => String(item.id) === id)
    if (!wish) return
    wx.showModal({
      title: '删除这个心愿？',
      content: `“${wish.title}”会从心愿单里移除。`,
      confirmText: '删除',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        this.commitWishes(this.data.wishes.filter((item) => String(item.id) !== id), { sync: true })
      }
    })
  },

  openMenuManager() {
    this.setData({ showMenuManager: true, menuDraft: createMenuDraft() })
  },

  closeMenuManager() {
    this.setData({ showMenuManager: false })
  },

  onMenuDraftInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) return
    this.setData({ [`menuDraft.${field}`]: event.detail.value })
  },

  selectMenuCategory(event) {
    const category = event.currentTarget.dataset.value
    if (!MENU_CATEGORY_MAP[category]) return
    this.setData({ 'menuDraft.category': category })
  },

  toggleMenuRecommended() {
    this.setData({ 'menuDraft.recommended': !this.data.menuDraft.recommended })
  },

  saveMenuItem() {
    const draft = this.data.menuDraft
    const name = textSlice(draft.name, 18)
    if (!name) {
      wx.showToast({ title: '写下菜名吧', icon: 'none' })
      return
    }
    if (this.data.menuItems.some((item) => item.name === name)) {
      wx.showToast({ title: '菜单里已经有这道啦', icon: 'none' })
      return
    }
    const category = MENU_CATEGORY_MAP[draft.category] ? draft.category : 'dish'
    const tags = parseMenuTags(draft.tags, category)
    const menuItem = normalizeCustomMenuItem({
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      description: textSlice(draft.description, 28) || `${tags[0]} · 小家新增`,
      highlight: tags[0],
      category,
      emoji: textSlice(draft.emoji, 2) || CATEGORY_EMOJI[category],
      tags,
      recommended: draft.recommended
    })
    this.commitCustomMenuItems([menuItem].concat(this.data.customMenuItems), {
      sync: true,
      extraData: { menuDraft: createMenuDraft() }
    })
    wx.showToast({ title: '已加入菜单', icon: 'success' })
  },

  deleteCustomMenuItem(event) {
    const id = String(event.currentTarget.dataset.id || '')
    const menuItem = this.data.customMenuItems.find((item) => item.id === id)
    if (!menuItem) return
    wx.showModal({
      title: '删除这道菜？',
      content: `“${menuItem.name}”会从自定义菜单里移除。`,
      confirmText: '删除',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        const cart = Object.assign({}, this.data.cart)
        const hadCartItem = !!cart[id]
        if (hadCartItem) {
          delete cart[id]
          storage.write('cart', cart)
          this.syncCloudResource('cart', cart, { debounce: true })
        }
        this.commitCustomMenuItems(this.data.customMenuItems.filter((item) => item.id !== id), {
          sync: true,
          cart: hadCartItem ? cart : undefined
        })
      }
    })
  },

  commitTodos(todos, options = {}) {
    const todoFilter = options.todoFilter || this.data.todoFilter
    const todoView = getTodoView(todos, todoFilter)
    const update = Object.assign({ todoFilter }, todoView, options.extraData || {})
    if (options.updateProfile !== false) {
      update.profileStats = getProfileStats(todoView.todos, this.data.orders)
    }
    this.setData(update)
    if (options.persist !== false) storage.write('todos', todoView.todos)
    if (options.sync) this.syncCloudResource('todos', todoView.todos, { debounce: true })
    return todoView
  },

  refreshTodos(shouldSync = false, options = {}) {
    return this.commitTodos(this.data.todos, Object.assign({ sync: shouldSync }, options))
  },

  setTodoFilter(event) {
    const todoFilter = event.currentTarget.dataset.filter
    if (todoFilter === this.data.todoFilter) return
    this.refreshTodos(false, { todoFilter, persist: false, updateProfile: false })
  },

  toggleTodo(event) {
    const id = Number(event.currentTarget.dataset.id)
    const todos = this.data.todos.map((item) => {
      if (Number(item.id) !== id) return item
      return Object.assign({}, item, {
        completed: !item.completed,
        due: !item.completed ? '已完成' : '今天'
      })
    })
    this.commitTodos(todos, { sync: true })
  },

  openTodoComposer() {
    this.setData({
      showTodoComposer: true,
      editingTodoId: null,
      todoDraft: { title: '', note: '', category: '生活', due: '今天' }
    })
  },

  editTodo(event) {
    const id = Number(event.currentTarget.dataset.id)
    const todo = this.data.todos.find((item) => Number(item.id) === id)
    if (!todo) return
    this.setData({
      showTodoComposer: true,
      editingTodoId: id,
      todoDraft: { title: todo.title, note: todo.note, category: todo.category, due: todo.completed ? '今天' : todo.due }
    })
  },

  closeTodoComposer() {
    this.setData({ showTodoComposer: false })
  },

  onTodoTitleInput(event) {
    this.setData({ 'todoDraft.title': event.detail.value })
  },

  onTodoNoteInput(event) {
    this.setData({ 'todoDraft.note': event.detail.value })
  },

  selectTodoCategory(event) {
    this.setData({ 'todoDraft.category': event.currentTarget.dataset.value })
  },

  selectTodoDue(event) {
    this.setData({ 'todoDraft.due': event.currentTarget.dataset.value })
  },

  saveTodo() {
    const draft = this.data.todoDraft
    if (!draft.title.trim()) {
      wx.showToast({ title: '写下要做的事吧', icon: 'none' })
      return
    }
    let todos
    if (this.data.editingTodoId) {
      todos = this.data.todos.map((item) => Number(item.id) === this.data.editingTodoId
        ? Object.assign({}, item, draft, { title: draft.title.trim(), note: draft.note.trim() })
        : item)
    } else {
      const newTodo = Object.assign({}, draft, {
        id: Date.now(),
        title: draft.title.trim(),
        note: draft.note.trim(),
        completed: false
      })
      todos = [newTodo].concat(this.data.todos)
    }
    this.commitTodos(todos, { sync: true, extraData: { showTodoComposer: false } })
  },

  deleteTodo(event) {
    const id = Number(event.currentTarget.dataset.id)
    wx.showModal({
      title: '删除这条待办？',
      content: '删除后就找不回来啦',
      confirmText: '删除',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        this.commitTodos(this.data.todos.filter((item) => Number(item.id) !== id), { sync: true })
      }
    })
  },

  refreshProfile() {
    this.setData({
      profileStats: getProfileStats(this.data.todos, this.data.orders)
    })
  },

  showAbout() {
    wx.showModal({
      title: '关于小家菜单',
      content: '认真吃饭，好好生活。\n这是只属于我们的小小生活助手。',
      showCancel: false,
      confirmText: '好呀',
      confirmColor: '#ee654d'
    })
  },

  clearAllData() {
    const cloudActive = this.data.familyStatus === 'active'
    wx.showModal({
      title: cloudActive ? '清空家庭数据？' : '清空本地数据？',
      content: cloudActive ? '两个人的购物车、订单和待办都会被清空。' : '购物车、订单和待办都会恢复到初始状态。',
      confirmText: '清空',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        const cart = {}
        const orders = []
        const customMenuItems = []
        const allMenuItems = getAllMenuItems(customMenuItems)
        const cartView = getCartView(cart, allMenuItems)
        const todoView = getTodoView(DEFAULT_TODOS, this.data.todoFilter)
        const wishView = getWishView([])
        this.menuItemMap = getMenuItemMap(allMenuItems)
        storage.clear()
        this.setData({
          activeTab: 'home',
          menuItems: allMenuItems,
          customMenuItems,
          recommendedItems: getRecommendedMenuItems(allMenuItems),
          filteredItems: getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
          cart,
          cartItems: cartView.cartItems,
          cartCount: cartView.cartCount,
          orders,
          todos: todoView.todos,
          visibleTodos: todoView.visibleTodos,
          homeTodos: todoView.homeTodos,
          todoStats: todoView.todoStats,
          wishes: wishView.wishes,
          wishStats: wishView.wishStats,
          orderNotices: [],
          unreadOrderNoticeCount: 0,
          roleManagerSummary: getRoleManagerSummary(this.data.familyStatus, this.data.family, 0),
          profileStats: getProfileStats(todoView.todos, orders)
        })
        this.syncCloudResource('cart', cart)
        this.syncCloudResource('orders', orders)
        this.syncCloudResource('todos', todoView.todos)
        this.syncCloudResource('wishes', wishView.wishes)
        this.syncCloudResource('menus', customMenuItems)
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
