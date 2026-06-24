const { categories, menuItems } = require('../../data/menu')
const storage = require('../../utils/storage')
const dateUtil = require('../../utils/date')
const cloudService = require('../../utils/cloud')

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

Page({
  data: {
    activeTab: 'home',
    dateLabel: '',
    greeting: { text: '你好', icon: '☀️' },
    categories,
    menuItems,
    recommendedItems: menuItems.filter((item) => item.recommended).slice(0, 4),
    filteredItems: menuItems,
    currentCategory: 'recommend',
    searchKeyword: '',
    cart: {},
    cartItems: [],
    cartCount: 0,
    flyingItem: { visible: false, emoji: '', name: '', highlight: '', tone: '', x: 0, y: 0, width: 0, height: 0, endX: 0, endY: 0, endRotate: 0 },
    showCart: false,
    orderRemark: '',
    orders: [],
    selectedOrder: null,
    showOrderDetail: false,
    showOrderSuccess: false,
    latestOrderId: '',
    familyStatus: 'loading',
    family: null,
    showFamilyPanel: false,
    familyCreateCode: '',
    familyBusy: false,
    familyError: '',
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
    profileStats: { orders: 0, todos: 0, pending: 0 }
  },

  onLoad() {
    const savedTodos = storage.read('todos', null)
    const cart = storage.read('cart', {})
    const orders = storage.read('orders', [])
    this.setData({
      dateLabel: dateUtil.todayLabel(),
      greeting: dateUtil.greeting(),
      todos: savedTodos || DEFAULT_TODOS,
      cart,
      orders
    })
    this.refreshCart()
    this.refreshTodos()
    this.refreshProfile()
    this.initializeCloud()
  },

  onShow() {
    this.setData({ greeting: dateUtil.greeting(), dateLabel: dateUtil.todayLabel() })
    this.startCloudPolling()
  },

  onHide() {
    this.stopCloudPolling()
  },

  onUnload() {
    if (this.flyTimer) clearTimeout(this.flyTimer)
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
        this.setData({ familyStatus: 'none', family: null, showFamilyPanel: false, familyError: '' })
        return
      }
      this.setData({ familyStatus: 'active', family: session.household, familyError: '' })
      await this.pullCloudData()
      this.startCloudPolling()
    } catch (error) {
      console.warn('云端初始化失败', error)
      this.setData({ familyStatus: 'offline', familyError: error.message || '暂时无法连接云端' })
    }
  },

  async pullCloudData() {
    if (this.data.familyStatus !== 'active' || this.cloudWritePending > 0) return
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
    storage.write('cart', cart)
    storage.write('todos', todos)
    storage.write('orders', orders)
    this.setData({ cart, todos, orders })
    this.refreshCart()
    this.refreshTodos()
    this.refreshProfile()
  },

  syncCloudResource(resource, value) {
    if (this.data.familyStatus !== 'active') return Promise.resolve()
    this.cloudWritePending = (this.cloudWritePending || 0) + 1
    return cloudService.call('updateResource', { resource, value })
      .catch((error) => console.warn(`同步 ${resource} 失败`, error))
      .finally(() => {
        this.cloudWritePending = Math.max(0, (this.cloudWritePending || 1) - 1)
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
          if (session.active) this.setData({ family: session.household })
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
      this.setData({ familyStatus: 'active', family: result.household, familyCreateCode: '' })
      if (result.created) {
        const data = await cloudService.call('migrateLocal', {
          data: { cart: this.data.cart, todos: this.data.todos, orders: this.data.orders, places: [] }
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
    this.setData({ familyStatus: 'loading', familyError: '' })
    this.initializeCloud()
  },

  noop() {},

  setTab(event) {
    const activeTab = event.detail.id
    this.setData({ activeTab, showCart: false })
    if (activeTab === 'todo') this.refreshTodos()
    if (activeTab === 'profile') this.refreshProfile()
  },

  navigateFromCard(event) {
    const target = event.currentTarget.dataset.target
    if (target === 'cart') {
      this.openCart()
      return
    }
    this.setData({ activeTab: target })
  },

  exploreMenu(event) {
    const category = event.currentTarget.dataset.category || 'recommend'
    this.setData({ activeTab: 'menu', currentCategory: category, searchKeyword: '' })
    this.filterMenu()
  },

  selectCategory(event) {
    this.setData({ currentCategory: event.currentTarget.dataset.id })
    this.filterMenu()
  },

  onSearch(event) {
    this.setData({ searchKeyword: event.detail.value.trim() })
    this.filterMenu()
  },

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.filterMenu()
  },

  filterMenu() {
    const { currentCategory, searchKeyword } = this.data
    const keyword = searchKeyword.toLowerCase()
    const filteredItems = menuItems.filter((item) => {
      const categoryMatched = currentCategory === 'recommend' ? item.recommended : item.category === currentCategory
      const keywordMatched = !keyword || `${item.name}${item.description}${item.tags.join('')}`.toLowerCase().includes(keyword)
      return categoryMatched && keywordMatched
    })
    this.setData({ filteredItems })
  },

  addToCart(event) {
    const id = event.currentTarget.dataset.id
    const menuItem = menuItems.find((item) => item.id === id)
    if (menuItem) this.playAddToCartAnimation(event, menuItem)
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + 1
    this.setData({ cart })
    storage.write('cart', cart)
    this.syncCloudResource('cart', cart)
    this.refreshCart()
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
    this.setData({ cart })
    storage.write('cart', cart)
    this.syncCloudResource('cart', cart)
    this.refreshCart()
    if (!this.data.cartCount) this.setData({ showCart: false })
  },

  refreshCart() {
    const cartItems = menuItems
      .filter((item) => this.data.cart[item.id])
      .map((item) => Object.assign({}, item, { quantity: this.data.cart[item.id] }))
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
    this.setData({ cartItems, cartCount })
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
      items: this.data.cartItems.map((item) => ({ id: item.id, name: item.name, emoji: item.emoji, quantity: item.quantity })),
      itemSummary: this.data.cartItems.map((item) => `${item.name} ×${item.quantity}`).join('、'),
      remark: this.data.orderRemark,
      status: '等你开饭'
    }
    const orders = [order].concat(this.data.orders).slice(0, 20)
    storage.write('orders', orders)
    storage.write('cart', {})
    this.syncCloudResource('orders', orders)
    this.syncCloudResource('cart', {})
    this.setData({
      orders,
      cart: {},
      showCart: false,
      orderRemark: '',
      showOrderSuccess: true,
      latestOrderId: order.id
    })
    this.refreshCart()
    this.refreshProfile()
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

  refreshTodos(shouldSync = false) {
    const todos = this.data.todos
      .map((item) => Object.assign({}, item, { categoryClass: TODO_CATEGORY_CLASS[item.category] || 'life' }))
      .sort((a, b) => Number(a.completed) - Number(b.completed))
    const completed = todos.filter((item) => item.completed).length
    const total = todos.length
    const pending = total - completed
    let visibleTodos = todos
    if (this.data.todoFilter === 'pending') visibleTodos = todos.filter((item) => !item.completed)
    if (this.data.todoFilter === 'completed') visibleTodos = todos.filter((item) => item.completed)
    this.setData({
      todos,
      visibleTodos,
      homeTodos: todos.filter((item) => !item.completed).slice(0, 2),
      todoStats: { total, completed, pending, percent: total ? Math.round(completed / total * 100) : 0 }
    })
    storage.write('todos', todos)
    if (shouldSync) this.syncCloudResource('todos', todos)
  },

  setTodoFilter(event) {
    this.setData({ todoFilter: event.currentTarget.dataset.filter })
    this.refreshTodos()
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
    this.setData({ todos })
    this.refreshTodos(true)
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
    this.setData({ todos, showTodoComposer: false })
    this.refreshTodos(true)
    this.refreshProfile()
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
        this.setData({ todos: this.data.todos.filter((item) => Number(item.id) !== id) })
        this.refreshTodos(true)
        this.refreshProfile()
      }
    })
  },

  refreshProfile() {
    const completedTodos = this.data.todos.filter((item) => item.completed).length
    const pendingTodos = this.data.todos.filter((item) => !item.completed).length
    this.setData({
      profileStats: { orders: this.data.orders.length, todos: completedTodos, pending: pendingTodos }
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
        storage.clear()
        this.setData({ cart: {}, orders: [], todos: DEFAULT_TODOS, activeTab: 'home' })
        this.refreshCart()
        this.refreshTodos(true)
        this.refreshProfile()
        this.syncCloudResource('cart', {})
        this.syncCloudResource('orders', [])
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
