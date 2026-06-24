const { categories, menuItems } = require('../../data/menu')
const storage = require('../../utils/storage')
const dateUtil = require('../../utils/date')

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
    showCart: false,
    orderRemark: '',
    orders: [],
    selectedOrder: null,
    showOrderDetail: false,
    showOrderSuccess: false,
    latestOrderId: '',
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
  },

  onShow() {
    this.setData({ greeting: dateUtil.greeting(), dateLabel: dateUtil.todayLabel() })
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
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + 1
    this.setData({ cart })
    storage.write('cart', cart)
    this.refreshCart()
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  changeCartQuantity(event) {
    const { id, delta } = event.currentTarget.dataset
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + Number(delta)
    if (cart[id] <= 0) delete cart[id]
    this.setData({ cart })
    storage.write('cart', cart)
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

  refreshTodos() {
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
    this.refreshTodos()
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
    this.refreshTodos()
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
        this.refreshTodos()
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
    wx.showModal({
      title: '清空本地数据？',
      content: '购物车、订单和待办都会恢复到初始状态。',
      confirmText: '清空',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        storage.clear()
        this.setData({ cart: {}, orders: [], todos: DEFAULT_TODOS, activeTab: 'home' })
        this.refreshCart()
        this.refreshTodos()
        this.refreshProfile()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
