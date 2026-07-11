const { categories, menuItems } = require('../../data/menu')
const storage = require('../../utils/storage')
const dateUtil = require('../../utils/date')
const cloudService = require('../../utils/cloud')

const SEARCH_DEBOUNCE_MS = 120
const CLOUD_SYNC_DEBOUNCE_MS = 800
const AI_REQUEST_TIMEOUT_MS = 25000
const ANNIVERSARY_FLIP_INTERVAL_MS = 90
const ANNIVERSARY_FLIP_MAX_STEPS = 24

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

const FARM_PLOT_COUNT = 6
const FARM_DAILY_BONUS = 12
const HOME_IMG_BASE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/home/'
const HOME_IMAGES = {
  morning: HOME_IMG_BASE + 'home-morning-bg.jpg',
  noon: HOME_IMG_BASE + 'home-noon-bg.jpg',
  afternoon: HOME_IMG_BASE + 'home-afternoon-bg.jpg',
  night: HOME_IMG_BASE + 'home-night-bg.jpg',
  pageBg: HOME_IMG_BASE + 'home-morning-bg.jpg',
  timeSlot: 'morning'
}
const LETTER_IMG_BASE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/letter/'
const LETTER_FONT_FILE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/font/MaShanZheng-Regular.ttf'
const LETTER_IMAGES = {
  envelopeClosed: LETTER_IMG_BASE + 'envelope-closed.png',
  paperTexture: LETTER_IMG_BASE + 'letter-paper-v2.jpg',
  handwritingFont: LETTER_FONT_FILE
}
const MENU_IMAGES = {
  pageBg: 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/menu/menu-page-bg-v2.jpg'
}
const TODO_IMAGES = {
  pageBg: 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/todo/todo-page-bg.jpg'
}
const WISHLIST_IMG_BASE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/wishlist/'
const WISHLIST_IMAGES = {
  pageBg: WISHLIST_IMG_BASE + 'wishlist-page-bg.jpg',
  banner: WISHLIST_IMG_BASE + 'wishlist-banner.jpg'
}
const FARM_IMG_BASE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/farm/'
const FARM_IMAGES = {
  pageBg: FARM_IMG_BASE + 'farm-page-clean-bg.jpg',
  panelBg: FARM_IMG_BASE + 'farm-panel-bg.jpg',
  entry: FARM_IMG_BASE + 'farm-basket-empty.png',
  basketEmpty: FARM_IMG_BASE + 'farm-basket-empty.png',
  hero: FARM_IMG_BASE + 'farm-hero.png',
  field: FARM_IMG_BASE + 'farm-field.png',
  growthSprout: FARM_IMG_BASE + 'growth-sprout.png',
  growthSeedling: FARM_IMG_BASE + 'growth-seedling.png',
  growthGrowing: FARM_IMG_BASE + 'growth-growing.png',
  growthReady: FARM_IMG_BASE + 'growth-ready.png'
}
const FARM_CROPS = [
  { id: 'tomato', name: '番茄', emoji: '🍅', image: FARM_IMG_BASE + 'seed-tomato.jpg', seedCost: 5, growDays: 1, harvest: 2, reward: 9, tone: 'sunset' },
  { id: 'corn', name: '玉米', emoji: '🌽', image: FARM_IMG_BASE + 'seed-corn.jpg', seedCost: 8, growDays: 2, harvest: 3, reward: 14, tone: 'honey' },
  { id: 'carrot', name: '胡萝卜', emoji: '🥕', image: FARM_IMG_BASE + 'seed-carrot.jpg', seedCost: 10, growDays: 3, harvest: 3, reward: 18, tone: 'cream' },
  { id: 'berry', name: '莓果', emoji: '🍓', image: FARM_IMG_BASE + 'seed-berry.jpg', seedCost: 14, growDays: 4, harvest: 4, reward: 24, tone: 'blush' }
]
const FLOWER_PLOT_COUNT = 6
const FLOWER_DAILY_BONUS = 12
const FLOWER_IMG_BASE = 'cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/flower/'
const FLOWER_IMAGES = {
  pageBg: FLOWER_IMG_BASE + 'flower-page-bg.jpg',
  hero: FLOWER_IMG_BASE + 'flower-hero.jpg',
  garden: FLOWER_IMG_BASE + 'flower-garden.jpg',
  entry: FLOWER_IMG_BASE + 'flower-rose.jpg'
}
const FLOWER_TYPES = [
  { id: 'rose', name: '玫瑰', image: FLOWER_IMG_BASE + 'flower-rose.jpg', seedCost: 5, growDays: 1, harvest: 2, reward: 7, tone: 'rose', meaning: '喜欢你' },
  { id: 'tulip', name: '郁金香', image: FLOWER_IMG_BASE + 'flower-tulip.jpg', seedCost: 6, growDays: 1, harvest: 2, reward: 8, tone: 'peach', meaning: '温柔告白' },
  { id: 'daisy', name: '雏菊', image: FLOWER_IMG_BASE + 'flower-daisy.jpg', seedCost: 7, growDays: 2, harvest: 3, reward: 10, tone: 'cream', meaning: '小小快乐' },
  { id: 'sunflower', name: '向日葵', image: FLOWER_IMG_BASE + 'flower-sunflower.jpg', seedCost: 8, growDays: 2, harvest: 3, reward: 12, tone: 'honey', meaning: '明亮陪伴' },
  { id: 'babysbreath', name: '满天星', image: FLOWER_IMG_BASE + 'flower-babysbreath.jpg', seedCost: 9, growDays: 2, harvest: 3, reward: 13, tone: 'mint', meaning: '藏在心里' },
  { id: 'lavender', name: '薰衣草', image: FLOWER_IMG_BASE + 'flower-lavender.jpg', seedCost: 10, growDays: 3, harvest: 4, reward: 16, tone: 'lavender', meaning: '安稳想念' },
  { id: 'lily', name: '铃兰', image: FLOWER_IMG_BASE + 'flower-lily.jpg', seedCost: 12, growDays: 3, harvest: 4, reward: 18, tone: 'sage', meaning: '好运到来' },
  { id: 'hydrangea', name: '绣球', image: FLOWER_IMG_BASE + 'flower-hydrangea.jpg', seedCost: 14, growDays: 4, harvest: 5, reward: 22, tone: 'blue', meaning: '浪漫团圆' }
]
const CUSTOM_MENU_IMAGE_DIR = 'assets/custom-menu'
const FARM_CROP_MAP = FARM_CROPS.reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
const FLOWER_TYPE_MAP = FLOWER_TYPES.reduce((map, item) => {
  map[item.id] = item
  return map
}, {})

const CUSTOM_MENU_LIMIT = 100
const MESSAGES_LIMIT = 200
const LETTERS_LIMIT = 60
const MESSAGE_REACTION_EMOJIS = ['❤️', '😂', '👍', '🎉', '😢']
// 云存储临时链接约 2 小时过期，留出裕量按 90 分钟刷新
const IMAGE_URL_TTL_MS = 90 * 60 * 1000
const IMAGE_URL_EXPIRY_MARGIN_MS = 2 * 60 * 1000
const PERSISTENT_IMAGE_EXPIRY = 4102444800000
// 替换云端同名图片后递增此版本号，客户端会清理旧图片并重新缓存。
const IMAGE_CACHE_VERSION = '2026.07.11.1'

function getValidImageUrlCache(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  Object.keys(value).forEach((fileID) => {
    const entry = value[fileID]
    if (!entry || typeof entry.url !== 'string' || !/^(https?:\/\/|wxfile:\/\/)/.test(entry.url)) return
    if (Number(entry.expireAt) <= now + IMAGE_URL_EXPIRY_MARGIN_MS) return
    if (entry.url.indexOf('wxfile://') === 0) {
      try {
        wx.getFileSystemManager().accessSync(entry.url)
      } catch (error) {
        return
      }
    }
    result[fileID] = { url: entry.url, expireAt: Number(entry.expireAt) }
  })
  return result
}

function clearPersistentImageFiles(cache) {
  if (!cache || typeof cache !== 'object') return
  const fileSystem = wx.getFileSystemManager && wx.getFileSystemManager()
  if (!fileSystem || !fileSystem.unlinkSync) return
  Object.keys(cache).forEach((fileID) => {
    const entry = cache[fileID]
    if (!entry || typeof entry.url !== 'string' || entry.url.indexOf('wxfile://') !== 0) return
    try {
      fileSystem.unlinkSync(entry.url)
    } catch (error) {
      // 文件可能已被微信清理，无需额外处理。
    }
  })
}

function getInitialImageUrlCache() {
  const storedVersion = storage.read('imageCacheVersion', '')
  const persistentCache = storage.read('persistentImageCache', {})
  if (storedVersion !== IMAGE_CACHE_VERSION) {
    clearPersistentImageFiles(persistentCache)
    storage.write('imageUrlCache', {})
    storage.write('persistentImageCache', {})
    storage.write('imageCacheVersion', IMAGE_CACHE_VERSION)
    return {}
  }
  // 永久本地文件优先于会过期的 https 地址，二次启动无需刷新图片 URL。
  return Object.assign(
    {},
    getValidImageUrlCache(storage.read('imageUrlCache', {})),
    getValidImageUrlCache(persistentCache)
  )
}

const INITIAL_IMAGE_URL_CACHE = getInitialImageUrlCache()
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

function todayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function createFarmPlots() {
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
    plots: createFarmPlots()
  }
}

function createFlowerPlots() {
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
    plots: createFlowerPlots()
  }
}

function getHomeTimeSlot(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 18) return 'afternoon'
  return 'night'
}

function getHomeImages(date = new Date()) {
  const timeSlot = getHomeTimeSlot(date)
  return Object.assign({}, HOME_IMAGES, {
    pageBg: HOME_IMAGES[timeSlot] || HOME_IMAGES.morning,
    timeSlot
  })
}

function getAnniversaryDays(date) {
  if (!date) return 0
  const parts = String(date).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !part && part !== 0)) return 0
  const start = new Date(parts[0], parts[1] - 1, parts[2])
  if (isNaN(start.getTime())) return 0
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
  return diff >= 0 ? diff + 1 : 0
}

function getAnniversaryDisplayStart(anniversary, currentDays) {
  if (!anniversary || !currentDays) return currentDays
  const lastOpen = storage.read('anniversaryLastOpen', null)
  if (!lastOpen || lastOpen.date !== anniversary.date) return currentDays
  const lastDays = Number(lastOpen.days) || 0
  if (lastDays <= 0 || lastDays === currentDays) return currentDays
  return lastDays
}

function normalizeAnniversary(value) {
  if (!value || typeof value !== 'object') return null
  const date = textSlice(value.date, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return {
    title: textSlice(value.title, 12) || '在一起',
    date
  }
}

function formatRelativeTime(ts) {
  const time = Number(ts)
  if (!time) return ''
  const diff = Date.now() - time
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`
  const date = new Date(time)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeMessageReactions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  MESSAGE_REACTION_EMOJIS.forEach((emoji) => {
    const users = value[emoji]
    if (Array.isArray(users) && users.length) {
      result[emoji] = users.filter(Boolean)
    }
  })
  return result
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((item) => ({
      id: item && item.id ? item.id : Date.now(),
      text: textSlice(item && item.text, 80),
      authorOpenid: (item && item.authorOpenid) || '',
      authorName: textSlice(item && item.authorName, 12) || '小家成员',
      createdAt: Number(item && item.createdAt) || Date.now(),
      reactions: normalizeMessageReactions(item && item.reactions)
    }))
    .filter((item) => item.text)
    .slice(0, MESSAGES_LIMIT)
}

// 基于 reactions 与自身 openid 生成每条消息的表情展示列表：全部固定表情都展示，count 为 0 不显数字，mine 高亮
function buildReactionList(reactions, myOpenid) {
  const source = reactions || {}
  return MESSAGE_REACTION_EMOJIS.map((emoji) => {
    const users = Array.isArray(source[emoji]) ? source[emoji] : []
    return {
      emoji,
      count: users.length,
      mine: !!myOpenid && users.indexOf(myOpenid) !== -1
    }
  })
}

function getMessagesView(messages, myOpenid) {
  const normalized = normalizeMessages(messages)
  const messagesDisplay = normalized.map((item) => Object.assign({}, item, {
    timeText: formatRelativeTime(item.createdAt),
    reactionList: buildReactionList(item.reactions, myOpenid),
    isMine: !!myOpenid && item.authorOpenid === myOpenid
  }))
  return {
    messages: normalized,
    messagesDisplay,
    recentMessages: messagesDisplay.slice(0, 2)
  }
}

function normalizeLetters(letters) {
  return (Array.isArray(letters) ? letters : [])
    .map((item, index) => ({
      id: textSlice(item && item.id, 48) || `letter-${Date.now()}-${index}`,
      text: String((item && item.text) || ''),
      authorOpenid: textSlice(item && item.authorOpenid, 60),
      authorName: textSlice(item && item.authorName, 12) || '小家成员',
      createdAt: Number(item && item.createdAt) || Date.now(),
      openedBy: Array.isArray(item && item.openedBy) ? item.openedBy.filter(Boolean) : []
    }))
    .filter((item) => item.text)
    .slice(0, LETTERS_LIMIT)
}

function getLettersView(letters, myOpenid) {
  const normalized = normalizeLetters(letters)
  const lettersDisplay = normalized.map((item) => {
    const date = new Date(item.createdAt)
    return Object.assign({}, item, {
      isMine: !!myOpenid && item.authorOpenid === myOpenid,
      isUnread: !!myOpenid && item.openedBy.indexOf(myOpenid) === -1,
      dateText: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    })
  })
  return {
    letters: normalized,
    lettersDisplay,
    latestLetter: lettersDisplay[0] || null,
    hasUnreadLetter: lettersDisplay.some((item) => item.isUnread)
  }
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
    image: textSlice(source.image, 240),
    tone: CATEGORY_TONE[category] || 'sunset',
    tags: tags.length > 1 ? tags : parseMenuTags(tags[0], category),
    recommended: !!source.recommended,
    custom: true
  }
}

function decorateMenuItem(item) {
  const patch = {}
  if (!item.searchText) {
    patch.searchText = `${item.name}${item.description}${(item.tags || []).join('')}`.toLowerCase()
  }
  if (!item.tagSummary) {
    patch.tagSummary = (item.tags || []).filter(Boolean).join(' · ')
  }
  return Object.keys(patch).length ? Object.assign({}, item, patch) : item
}

// 内置菜单的 searchText/tagSummary 只需计算一次，后续复用
const DECORATED_MENU_ITEMS = menuItems.map(decorateMenuItem)

function getAllMenuItems(customMenuItems) {
  return DECORATED_MENU_ITEMS
    .concat((customMenuItems || []).map(normalizeCustomMenuItem).map(decorateMenuItem))
}

// 用 fileID→URL 缓存把 cloud:// 图片替换为可直接加载的 https 临时链接。
// 无任何替换时返回原引用，便于上层据此跳过多余 setData。
function applyImageCache(items, cache) {
  if (!cache || !items) return items
  let changed = false
  const mapped = items.map((item) => {
    if (item && typeof item.image === 'string' && item.image.indexOf('cloud://') === 0) {
      const entry = cache[item.image]
      if (entry && entry.url) {
        changed = true
        return Object.assign({}, item, { image: entry.url })
      }
    }
    return item
  })
  return changed ? mapped : items
}

function applyImageCacheToObject(source, cache) {
  if (!cache || !source || typeof source !== 'object') return source
  let changed = false
  const mapped = {}
  Object.keys(source).forEach((key) => {
    const value = source[key]
    if (typeof value === 'string' && value.indexOf('cloud://') === 0) {
      const entry = cache[value]
      if (entry && entry.url) {
        mapped[key] = entry.url
        changed = true
        return
      }
    }
    mapped[key] = value
  })
  return changed ? mapped : source
}

function applyFlowerPlotImageCache(items, cache) {
  if (!cache || !items) return items
  let changed = false
  const mapped = items.map((item) => {
    if (item && typeof item.flowerImage === 'string' && item.flowerImage.indexOf('cloud://') === 0) {
      const entry = cache[item.flowerImage]
      if (entry && entry.url) {
        changed = true
        return Object.assign({}, item, { flowerImage: entry.url })
      }
    }
    return item
  })
  return changed ? mapped : items
}

function getRecommendedMenuItems(items) {
  return items.filter((item) => item.recommended).slice(0, 4)
}

// 轮播 banner：仅 2 张——「今晚推荐」取第一道推荐菜，「新品」取最近添加的一道（与推荐去重）
function getBannerItems(items) {
  const banner = []
  const firstRecommended = items.find((item) => item.recommended)
  if (firstRecommended) {
    banner.push(Object.assign({}, firstRecommended, { bannerTag: '推荐' }))
  }
  const recommendedId = firstRecommended && firstRecommended.id
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item && item.id !== recommendedId) {
      banner.push(Object.assign({}, item, { bannerTag: '新品' }))
      break
    }
  }
  return banner
}

function getFilteredMenuItems(items, category, keyword) {
  const normalizedKeyword = String(keyword || '').toLowerCase()
  return items
    .filter((item) => {
      const categoryMatched = category === 'recommend' ? item.recommended : item.category === category
      if (!categoryMatched) return false
      if (!normalizedKeyword) return true
      const searchText = item.searchText || `${item.name}${item.description}${item.tags.join('')}`.toLowerCase()
      return searchText.includes(normalizedKeyword)
    })
}

// 所有菜品节点常驻，仅更新可见状态，切换分类时不重新创建 image。
function getMenuDisplayItems(items, category, keyword) {
  const visibleIds = new Set(getFilteredMenuItems(items, category, keyword).map((item) => item.id))
  return items.map((item) => Object.assign({}, item, { menuVisible: visibleIds.has(item.id) }))
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
    image: '',
    imagePreview: '',
    imageUploading: false,
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
    .map((item, index) => ({
      id: item.id || Date.now(),
      title: textSlice(item.title, 30) || '一起做一件小事',
      note: textSlice(item.note, 40),
      completed: !!item.completed,
      createdAt: item.createdAt || Date.now(),
      tone: ['sage', 'peach', 'lavender'][index % 3]
    }))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.createdAt) - Number(a.createdAt))
  const completed = normalizedWishes.filter((item) => item.completed).length
  const total = normalizedWishes.length
  return {
    wishes: normalizedWishes,
    wishStats: {
      total,
      completed,
      pending: total - completed,
      percent: total ? Math.round(completed / total * 100) : 0
    }
  }
}

function normalizeFarmState(value) {
  const fallback = createDefaultFarmState()
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const inventory = {}
  if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
    Object.keys(source.inventory).forEach((id) => {
      if (FARM_CROP_MAP[id]) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
    })
  }
  const rawPlots = Array.isArray(source.plots) ? source.plots : []
  const plots = fallback.plots.map((plot, index) => {
    const raw = rawPlots[index] || {}
    const cropId = FARM_CROP_MAP[raw.cropId] ? raw.cropId : ''
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

function formatFarmRemaining(ms) {
  const days = Math.max(1, Math.ceil(ms / 86400000))
  return `${days} 天`
}

function getFarmGrowMs(crop) {
  if (crop.growDays) return crop.growDays * 86400000
  return Math.max(1, Number(crop.growMinutes) || 1) * 60000
}

function getFarmGrowthStage(progress, ready) {
  if (ready) return 'ready'
  if (progress >= 62) return 'growing'
  if (progress >= 28) return 'seedling'
  return 'sprout'
}

function getFarmPlotView(plot, now) {
  const crop = FARM_CROP_MAP[plot.cropId]
  if (!crop) {
    return Object.assign({}, plot, {
      empty: true,
      ready: false,
      progress: 0,
      stageText: '空地',
      actionText: '播种',
      cropName: '',
      cropEmoji: '＋',
      tone: 'mint'
    })
  }
  const growMs = getFarmGrowMs(crop)
  const wateredBoost = plot.wateredAt ? 0.18 : 0
  const elapsed = Math.max(0, now - Number(plot.plantedAt || now))
  const boostedElapsed = elapsed * (1 + wateredBoost)
  const progress = Math.min(100, Math.floor(boostedElapsed / growMs * 100))
  const ready = progress >= 100
  const growthStage = getFarmGrowthStage(progress, ready)
  return Object.assign({}, plot, {
    empty: false,
    ready,
    progress,
    growthStage,
    cropName: crop.name,
    cropEmoji: crop.emoji,
    tone: crop.tone,
    stageText: ready ? '可以收获' : `${formatFarmRemaining(growMs - boostedElapsed)}后成熟`,
    actionText: ready ? '收获' : (plot.wateredAt ? '已浇水' : '浇水')
  })
}

function getFarmView(farmState, selectedCropId) {
  const state = normalizeFarmState(farmState)
  const now = Date.now()
  const plots = state.plots.map((plot) => getFarmPlotView(plot, now))
  const inventoryList = FARM_CROPS
    .map((crop) => Object.assign({}, crop, { count: Number(state.inventory[crop.id]) || 0 }))
    .filter((item) => item.count > 0)
  const selectedCrop = FARM_CROP_MAP[selectedCropId] || FARM_CROPS[0]
  return {
    farmState: state,
    farmPlots: plots,
    farmInventoryList: inventoryList,
    selectedFarmCrop: selectedCrop.id,
    farmStats: {
      coins: state.coins,
      planted: plots.filter((item) => !item.empty).length,
      ready: plots.filter((item) => item.ready).length,
      harvests: inventoryList.reduce((sum, item) => sum + item.count, 0),
      dailyAvailable: state.lastBonusDate !== todayDateString()
    }
  }
}

function normalizeFlowerState(value) {
  const fallback = createDefaultFlowerState()
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const inventory = {}
  if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
    Object.keys(source.inventory).forEach((id) => {
      if (FLOWER_TYPE_MAP[id]) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
    })
  }
  const rawPlots = Array.isArray(source.plots) ? source.plots : []
  const plots = fallback.plots.map((plot, index) => {
    const raw = rawPlots[index] || {}
    const flowerId = FLOWER_TYPE_MAP[raw.flowerId] ? raw.flowerId : ''
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

function getFlowerStage(progress, ready) {
  if (ready) return 'ready'
  if (progress >= 64) return 'blooming'
  if (progress >= 32) return 'bud'
  return 'sprout'
}

function getFlowerPlotView(plot, now) {
  const flower = FLOWER_TYPE_MAP[plot.flowerId]
  if (!flower) {
    return Object.assign({}, plot, {
      empty: true,
      ready: false,
      progress: 0,
      stage: 'empty',
      flowerName: '',
      flowerImage: '',
      actionText: '种花'
    })
  }
  const growMs = flower.growDays * 86400000
  const careBoost = plot.caredAt ? 0.16 : 0
  const elapsed = Math.max(0, now - Number(plot.plantedAt || now))
  const boostedElapsed = elapsed * (1 + careBoost)
  const progress = Math.min(100, Math.floor(boostedElapsed / growMs * 100))
  const ready = progress >= 100
  return Object.assign({}, plot, {
    empty: false,
    ready,
    progress,
    stage: getFlowerStage(progress, ready),
    flowerName: flower.name,
    flowerImage: flower.image,
    tone: flower.tone,
    actionText: ready ? '收花' : (plot.caredAt ? '已照料' : '照料')
  })
}

function getFlowerView(flowerState, selectedFlowerId) {
  const state = normalizeFlowerState(flowerState)
  const now = Date.now()
  const plots = state.plots.map((plot) => getFlowerPlotView(plot, now))
  const inventoryList = FLOWER_TYPES
    .map((flower) => Object.assign({}, flower, { count: Number(state.inventory[flower.id]) || 0 }))
    .filter((item) => item.count > 0)
  const selectedFlower = FLOWER_TYPE_MAP[selectedFlowerId] || FLOWER_TYPES[0]
  return {
    flowerState: state,
    flowerPlots: plots,
    flowerInventoryList: inventoryList,
    selectedFlowerType: selectedFlower.id,
    flowerStats: {
      nectar: state.nectar,
      planted: plots.filter((item) => !item.empty).length,
      ready: plots.filter((item) => item.ready).length,
      materials: inventoryList.reduce((sum, item) => sum + item.count, 0),
      dailyAvailable: state.lastBonusDate !== todayDateString()
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

// 为订单预计算首项，避免模板里 item.items[0] 在空订单时渲染 undefined
function getOrdersView(orders) {
  return (Array.isArray(orders) ? orders : []).map((order) => Object.assign({}, order, {
    firstItem: (order.items && order.items[0]) || {}
  }))
}

const RECENT_ORDERS_LIMIT = 3

// 同时产出全部订单视图与首页折叠展示的最近订单，避免各处重复 slice
function getOrdersViews(orders) {
  const ordersView = getOrdersView(orders)
  return { ordersView, recentOrders: ordersView.slice(0, RECENT_ORDERS_LIMIT) }
}

function getOrderSuccessCopy(order) {
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
    imagesBooting: true,
    tabImageReady: { home: false, menu: false, todo: false, wishlist: false, farm: false, flower: false, profile: true },
    tabPreloadUrls: [],
    // 非首屏页面首次进入时再创建，避免启动阶段同时解码整份菜单图片。
    visitedTabs: { home: true, menu: false, wishlist: false, farm: false, flower: false, todo: false, profile: false },
    menuMotion: 'a',
    scrollTop: 0,
    dateLabel: '',
    greeting: { text: '你好', icon: '☀️' },
    categories,
    menuCategories: MENU_CATEGORIES,
    customMenuItems: [],
    customMenuDisplayItems: [],
    recommendedItems: applyImageCache(getRecommendedMenuItems(menuItems), INITIAL_IMAGE_URL_CACHE),
    bannerItems: applyImageCache(getBannerItems(menuItems), INITIAL_IMAGE_URL_CACHE),
    filteredItems: applyImageCache(getRecommendedMenuItems(menuItems), INITIAL_IMAGE_URL_CACHE),
    menuDisplayItems: getMenuDisplayItems(applyImageCache(menuItems, INITIAL_IMAGE_URL_CACHE), 'recommend', ''),
    currentCategory: 'recommend',
    searchKeyword: '',
    cart: {},
    cartItems: [],
    cartCount: 0,
    flyingItem: { visible: false, emoji: '', image: '', name: '', highlight: '', tone: '', x: 0, y: 0, width: 0, height: 0, endX: 0, endY: 0, endRotate: 0 },
    showCart: false,
    orderRemark: '',
    orders: [],
    ordersView: [],
    recentOrders: [],
    showAllOrders: false,
    selectedOrder: null,
    showOrderDetail: false,
    showOrderSuccess: false,
    latestOrderId: '',
    orderSuccessCopy: '',
    showAiPanel: false,
    aiInput: '',
    aiSending: false,
    aiMessages: [],
    aiScrollTop: 0,
    familyStatus: 'loading',
    family: null,
    showFamilyPanel: false,
    familyMode: 'choose',
    familyInviteCode: '',
    familyNickname: '',
    familyBusy: false,
    familyError: '',
    orderPushEnabled: false,
    wishes: [],
    wishStats: { total: 0, completed: 0, pending: 0, percent: 0 },
    showWishComposer: false,
    wishDraft: createWishDraft(),
    homeImages: applyImageCacheToObject(getHomeImages(), INITIAL_IMAGE_URL_CACHE),
    letterImages: applyImageCacheToObject(LETTER_IMAGES, INITIAL_IMAGE_URL_CACHE),
    menuImages: applyImageCacheToObject(MENU_IMAGES, INITIAL_IMAGE_URL_CACHE),
    todoImages: TODO_IMAGES,
    wishlistImages: applyImageCacheToObject(WISHLIST_IMAGES, INITIAL_IMAGE_URL_CACHE),
    farmImages: applyImageCacheToObject(FARM_IMAGES, INITIAL_IMAGE_URL_CACHE),
    farmCrops: applyImageCache(FARM_CROPS, INITIAL_IMAGE_URL_CACHE),
    selectedFarmCrop: FARM_CROPS[0].id,
    farmState: createDefaultFarmState(),
    farmPlots: [],
    farmInventoryList: [],
    farmStats: { coins: 0, planted: 0, ready: 0, harvests: 0, dailyAvailable: false },
    flowerImages: applyImageCacheToObject(FLOWER_IMAGES, INITIAL_IMAGE_URL_CACHE),
    flowerTypes: applyImageCache(FLOWER_TYPES, INITIAL_IMAGE_URL_CACHE),
    selectedFlowerType: FLOWER_TYPES[0].id,
    flowerState: createDefaultFlowerState(),
    flowerPlots: [],
    flowerInventoryList: [],
    flowerStats: { nectar: 0, planted: 0, ready: 0, materials: 0, dailyAvailable: false },
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
    menuDraft: createMenuDraft(),
    editingMenuId: null,
    showRandomDish: false,
    randomDish: {},
    randomRolling: false,
    anniversary: null,
    anniversaryDays: 0,
    anniversaryDisplayDays: 0,
    anniversaryFlipActive: false,
    anniversaryFlipFrame: 0,
    showAnniversarySheet: false,
    anniversaryDraft: { title: '', date: '' },
    todayDate: '',
    messages: [],
    recentMessages: [],
    messagesDisplay: [],
    showMessages: false,
    messageDraft: '',
    letters: [],
    lettersDisplay: [],
    latestLetter: null,
    hasUnreadLetter: false,
    selectedLetter: null,
    showLetterComposer: false,
    showLetterViewer: false,
    letterDraft: '',
    letterSending: false,
    letterWithdrawing: false,
    myOpenid: '',
    myNickname: ''
  },

  onLoad() {
    this.imageUrlCache = Object.assign({}, INITIAL_IMAGE_URL_CACHE)
    const savedTodos = storage.read('todos', null)
    const cart = storage.read('cart', {})
    const orders = storage.read('orders', [])
    const savedWishes = storage.read('wishes', [])
    const orderPushEnabled = !!storage.read('orderPushEnabled', false)
    const farmView = getFarmView(storage.read('farm', null), this.data.selectedFarmCrop)
    const flowerView = getFlowerView(storage.read('flower', null), this.data.selectedFlowerType)
    const savedCustomMenuItems = storage.read('customMenuItems', [])
    const customMenuItems = (Array.isArray(savedCustomMenuItems) ? savedCustomMenuItems : [])
      .map(normalizeCustomMenuItem)
      .slice(0, CUSTOM_MENU_LIMIT)
    const allMenuItems = applyImageCache(getAllMenuItems(customMenuItems), this.imageUrlCache)
    const todoView = getTodoView(savedTodos || DEFAULT_TODOS, this.data.todoFilter)
    const wishView = getWishView(Array.isArray(savedWishes) ? savedWishes : [])
    const cartView = getCartView(cart, allMenuItems)
    const ordersViews = getOrdersViews(orders)
    const anniversary = normalizeAnniversary(storage.read('anniversary', null))
    const anniversaryDays = anniversary ? getAnniversaryDays(anniversary.date) : 0
    const anniversaryDisplayDays = getAnniversaryDisplayStart(anniversary, anniversaryDays)
    const messagesView = getMessagesView(storage.read('messages', []), this.data.myOpenid)
    const lettersView = getLettersView(storage.read('letters', []), this.data.myOpenid)
    this.allMenuItems = allMenuItems
    this.menuItemMap = getMenuItemMap(allMenuItems)
    this.setData({
      dateLabel: dateUtil.todayLabel(),
      greeting: dateUtil.greeting(),
      customMenuItems,
      customMenuDisplayItems: applyImageCache(customMenuItems, this.imageUrlCache),
      orderPushEnabled,
      recommendedItems: applyImageCache(getRecommendedMenuItems(allMenuItems), this.imageUrlCache),
      bannerItems: applyImageCache(getBannerItems(allMenuItems), this.imageUrlCache),
      filteredItems: applyImageCache(getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword), this.imageUrlCache),
      menuDisplayItems: getMenuDisplayItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
      todos: todoView.todos,
      visibleTodos: todoView.visibleTodos,
      homeTodos: todoView.homeTodos,
      todoStats: todoView.todoStats,
      wishes: wishView.wishes,
      wishStats: wishView.wishStats,
      farmState: farmView.farmState,
      farmPlots: farmView.farmPlots,
      farmInventoryList: farmView.farmInventoryList,
      selectedFarmCrop: farmView.selectedFarmCrop,
      farmStats: farmView.farmStats,
      flowerState: flowerView.flowerState,
      flowerPlots: flowerView.flowerPlots,
      flowerInventoryList: flowerView.flowerInventoryList,
      selectedFlowerType: flowerView.selectedFlowerType,
      flowerStats: flowerView.flowerStats,
      cart,
      cartItems: cartView.cartItems,
      cartCount: cartView.cartCount,
      orders,
      ordersView: ordersViews.ordersView,
      recentOrders: ordersViews.recentOrders,
      profileStats: getProfileStats(todoView.todos, orders),
      todayDate: todayDateString(),
      anniversary,
      anniversaryDays,
      anniversaryDisplayDays,
      messages: messagesView.messages,
      recentMessages: messagesView.recentMessages,
      messagesDisplay: messagesView.messagesDisplay,
      letters: lettersView.letters,
      lettersDisplay: lettersView.lettersDisplay,
      latestLetter: lettersView.latestLetter,
      hasUnreadLetter: lettersView.hasUnreadLetter
    })
    this.startAnniversaryFlip(anniversaryDisplayDays, anniversaryDays, anniversary)
    this.startFarmTimer()
    this.initializeCloud()
    this.resolveMenuImages()
  },

  // 将云图片的 cloud:// fileID 换成 https 临时链接，避免 <image> 直接加载 cloud:// 时报 500。
  // 借助 this.imageUrlCache 仅解析缺失/过期项，并用在途标志避免轮询与多入口并发重复请求。
  async resolveMenuImages() {
    if (!wx.cloud) return
    if (!this.imageUrlCache) this.imageUrlCache = {}
    const cache = this.imageUrlCache
    const now = Date.now()

    // 先用现有缓存即时回填，命中即可避免重复网络请求
    this.applyResolvedImages()

    const pending = new Set()
    const collect = (items) => {
      (items || []).forEach((item) => {
        if (item && typeof item.image === 'string' && item.image.indexOf('cloud://') === 0) {
          const entry = cache[item.image]
          if (!entry || entry.expireAt <= now) pending.add(item.image)
        }
      })
    }
    const collectValues = (source) => {
      if (!source || typeof source !== 'object') return
      Object.keys(source).forEach((key) => {
        const value = source[key]
        if (typeof value === 'string' && value.indexOf('cloud://') === 0) {
          const entry = cache[value]
          if (!entry || entry.expireAt <= now) pending.add(value)
        }
      })
    }
    const collectFlowerPlots = (items) => {
      (items || []).forEach((item) => {
        if (item && typeof item.flowerImage === 'string' && item.flowerImage.indexOf('cloud://') === 0) {
          const entry = cache[item.flowerImage]
          if (!entry || entry.expireAt <= now) pending.add(item.flowerImage)
        }
      })
    }
    collect(DECORATED_MENU_ITEMS)
    collect(this.data.customMenuItems)
    collect(FARM_CROPS)
    collect(FLOWER_TYPES)
    collect(this.data.flowerInventoryList)
    collectFlowerPlots(this.data.flowerPlots)
    collectValues(HOME_IMAGES)
    collectValues(LETTER_IMAGES)
    collectValues(MENU_IMAGES)
    collectValues(TODO_IMAGES)
    collectValues(WISHLIST_IMAGES)
    collectValues(FARM_IMAGES)
    collectValues(FLOWER_IMAGES)
    if (!pending.size || this.imageResolving) {
      if (!this.imageResolving) this.finishInitialImageBoot()
      return
    }

    this.imageResolving = true
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [...pending] })
      const expireAt = Date.now() + IMAGE_URL_TTL_MS
      ;(res.fileList || []).forEach((f) => {
        if (f.fileID && f.tempFileURL) cache[f.fileID] = { url: f.tempFileURL, expireAt }
      })
      storage.write('imageUrlCache', getValidImageUrlCache(cache))
      await this.decodeInitialImages(cache)
      this.applyResolvedImages()
      this.setData({ imagesBooting: false })
      this.prefetchAllTabEntrances(cache)
      setTimeout(() => this.persistCloudImages(cache), 1200)
    } catch (error) {
      console.warn('云图片地址解析失败', error)
    } finally {
      this.imageResolving = false
      if (this.data.imagesBooting) this.finishInitialImageBoot()
    }
  },

  getInitialImageSources(cache) {
    const fileIDs = [
      getHomeImages().pageBg,
      FARM_IMAGES.entry,
      FLOWER_IMAGES.entry
    ]
    getBannerItems(DECORATED_MENU_ITEMS).slice(0, 2).forEach((item) => fileIDs.push(item.image))
    return fileIDs.map((fileID) => cache[fileID] && cache[fileID].url).filter(Boolean)
  },

  decodeImageSources(sources) {
    if (!wx.getImageInfo) return Promise.resolve()
    return Promise.all((sources || []).map((src) => new Promise((resolve) => {
      wx.getImageInfo({ src, complete: resolve })
    })))
  },

  onPageBackgroundSettled(event) {
    const tab = event.currentTarget.dataset.tab
    const imageGroups = {
      home: this.data.homeImages,
      menu: this.data.menuImages,
      todo: this.data.todoImages,
      wishlist: this.data.wishlistImages,
      farm: this.data.farmImages,
      flower: this.data.flowerImages
    }
    const source = imageGroups[tab] && imageGroups[tab].pageBg
    // cloud:// 只是解析前的中间态，必须等稳定的 https/wxfile 地址加载完成。
    if (!source || source.indexOf('cloud://') === 0) return
    if (!this.data.tabImageReady[tab]) this.setData({ [`tabImageReady.${tab}`]: true })
  },

  decodeInitialImages(cache) {
    return this.decodeImageSources(this.getInitialImageSources(cache))
  },

  async finishInitialImageBoot() {
    if (!this.data.imagesBooting) return
    await this.decodeInitialImages(this.imageUrlCache || {})
    this.applyResolvedImages()
    this.setData({ imagesBooting: false })
    this.prefetchAllTabEntrances(this.imageUrlCache || {})
    setTimeout(() => this.persistCloudImages(this.imageUrlCache || {}), 1200)
  },

  // 空闲时预解码各 Tab 的背景和首屏菜品，切换时 image 通常已命中微信缓存。
  prefetchAllTabEntrances(cache) {
    const fileIDs = [
      MENU_IMAGES.pageBg,
      TODO_IMAGES.pageBg,
      WISHLIST_IMAGES.pageBg,
      WISHLIST_IMAGES.banner,
      FARM_IMAGES.pageBg,
      FARM_IMAGES.hero,
      FLOWER_IMAGES.pageBg,
      FLOWER_IMAGES.hero
    ]
    getRecommendedMenuItems(DECORATED_MENU_ITEMS).slice(0, 6).forEach((item) => fileIDs.push(item.image))
    const sources = [...new Set(fileIDs.map((fileID) => cache[fileID] && cache[fileID].url).filter(Boolean))]
    this.prefetchImageUrls(sources)
    if (sources.join('|') !== (this.data.tabPreloadUrls || []).join('|')) {
      this.setData({ tabPreloadUrls: sources })
    }
  },

  // 分两路低并发下载并保存到微信持久文件目录，避免抢占当前页面带宽。
  async persistCloudImages(cache) {
    if (!wx.downloadFile || !wx.saveFile || this.persistingImages) return
    const saved = getValidImageUrlCache(storage.read('persistentImageCache', {}))
    const queue = Object.keys(cache).filter((fileID) => {
      const entry = cache[fileID]
      return !saved[fileID] && entry && /^https?:\/\//.test(entry.url) && !/\.(ttf|otf|woff2?)$/i.test(fileID)
    })
    if (!queue.length) return
    this.persistingImages = true
    const saveOne = (fileID) => new Promise((resolve) => {
      wx.downloadFile({
        url: cache[fileID].url,
        success: (download) => {
          if (download.statusCode !== 200 || !download.tempFilePath) return resolve()
          wx.saveFile({
            tempFilePath: download.tempFilePath,
            success: (result) => {
              saved[fileID] = { url: result.savedFilePath, expireAt: PERSISTENT_IMAGE_EXPIRY }
              storage.write('persistentImageCache', saved)
            },
            complete: resolve
          })
        },
        fail: resolve
      })
    })
    const worker = async () => {
      while (queue.length) await saveOne(queue.shift())
    }
    await Promise.all([worker(), worker()])
    this.persistingImages = false
  },

  // 把缓存中的链接套用到内存数据与视图字段，仅在发生替换时才 setData
  applyResolvedImages() {
    const cache = this.imageUrlCache
    if (!cache) return
    this.allMenuItems = applyImageCache(this.allMenuItems, cache)
    this.menuItemMap = getMenuItemMap(this.allMenuItems)
    const update = {}
    const recommendedItems = applyImageCache(this.data.recommendedItems, cache)
    if (recommendedItems !== this.data.recommendedItems) update.recommendedItems = recommendedItems
    const bannerItems = applyImageCache(this.data.bannerItems, cache)
    if (bannerItems !== this.data.bannerItems) update.bannerItems = bannerItems
    const filteredItems = applyImageCache(this.data.filteredItems, cache)
    if (filteredItems !== this.data.filteredItems) update.filteredItems = filteredItems
    const menuDisplayItems = getMenuDisplayItems(this.allMenuItems, this.data.currentCategory, this.data.searchKeyword)
    if (!isSameList(menuDisplayItems, this.data.menuDisplayItems)) update.menuDisplayItems = menuDisplayItems
    const cartItems = applyImageCache(this.data.cartItems, cache)
    if (cartItems !== this.data.cartItems) update.cartItems = cartItems
    const customMenuDisplayItems = applyImageCache(this.data.customMenuItems, cache)
    if (customMenuDisplayItems !== this.data.customMenuDisplayItems) update.customMenuDisplayItems = customMenuDisplayItems
    const homeImages = applyImageCacheToObject(this.data.homeImages, cache)
    if (homeImages !== this.data.homeImages) update.homeImages = homeImages
    const letterImages = applyImageCacheToObject(this.data.letterImages, cache)
    if (letterImages !== this.data.letterImages) update.letterImages = letterImages
    const menuImages = applyImageCacheToObject(this.data.menuImages, cache)
    if (menuImages !== this.data.menuImages) update.menuImages = menuImages
    const todoImages = applyImageCacheToObject(this.data.todoImages, cache)
    if (todoImages !== this.data.todoImages) update.todoImages = todoImages
    const wishlistImages = applyImageCacheToObject(this.data.wishlistImages, cache)
    if (wishlistImages !== this.data.wishlistImages) update.wishlistImages = wishlistImages
    const farmImages = applyImageCacheToObject(this.data.farmImages, cache)
    if (farmImages !== this.data.farmImages) update.farmImages = farmImages
    const farmCrops = applyImageCache(this.data.farmCrops, cache)
    if (farmCrops !== this.data.farmCrops) update.farmCrops = farmCrops
    const flowerImages = applyImageCacheToObject(this.data.flowerImages, cache)
    if (flowerImages !== this.data.flowerImages) update.flowerImages = flowerImages
    const flowerTypes = applyImageCache(this.data.flowerTypes, cache)
    if (flowerTypes !== this.data.flowerTypes) update.flowerTypes = flowerTypes
    const flowerInventoryList = applyImageCache(this.data.flowerInventoryList, cache)
    if (flowerInventoryList !== this.data.flowerInventoryList) update.flowerInventoryList = flowerInventoryList
    const flowerPlots = applyFlowerPlotImageCache(this.data.flowerPlots, cache)
    if (flowerPlots !== this.data.flowerPlots) update.flowerPlots = flowerPlots
    const finish = () => {
      if (this.data.showLetterComposer || this.data.showLetterViewer) this.loadLetterHandwritingFont()
      this.prefetchActiveTabImages(this.data.activeTab)
    }
    if (Object.keys(update).length) this.setData(update, finish)
    else finish()
  },

  loadLetterHandwritingFont() {
    if (!wx.loadFontFace || this.letterFontLoaded || this.letterFontLoading) return
    const source = this.data.letterImages && this.data.letterImages.handwritingFont
    if (!source || source.indexOf('cloud://') === 0) return
    this.letterFontLoading = true
    wx.loadFontFace({
      family: 'FamilyHandwriting',
      source: `url("${source}")`,
      global: true,
      success: () => {
        this.letterFontLoaded = true
      },
      fail: (error) => {
        console.warn('手写字体加载失败，已使用系统字体', error)
      },
      complete: () => {
        this.letterFontLoading = false
      }
    })
  },

  prefetchImageUrls(sources) {
    if (!wx.getImageInfo) return
    if (!this.prefetchedImageUrls) this.prefetchedImageUrls = new Set()
    ;(sources || []).filter((url) => typeof url === 'string' && /^(https?:\/\/|wxfile:\/\/)/.test(url)).forEach((url) => {
      if (this.prefetchedImageUrls.has(url)) return
      this.prefetchedImageUrls.add(url)
      wx.getImageInfo({
        src: url,
        fail: () => this.prefetchedImageUrls.delete(url)
      })
    })
  },

  // 只预取当前页面的关键图，避免全量图片争抢首屏网络和解码资源。
  prefetchActiveTabImages(activeTab) {
    const sources = []
    if (activeTab === 'home') {
      sources.push(
        this.data.homeImages && this.data.homeImages.pageBg,
        this.data.farmImages && this.data.farmImages.entry,
        this.data.flowerImages && this.data.flowerImages.entry
      )
      if (this.data.latestLetter) sources.push(this.data.letterImages && this.data.letterImages.envelopeClosed)
      ;(this.data.bannerItems || []).slice(0, 2).forEach((item) => sources.push(item.image))
    } else if (activeTab === 'menu') {
      sources.push(this.data.menuImages && this.data.menuImages.pageBg)
      ;(this.data.filteredItems || []).slice(0, 6).forEach((item) => sources.push(item.image))
    } else if (activeTab === 'wishlist') {
      const images = this.data.wishlistImages || {}
      sources.push(images.pageBg, images.banner)
    } else if (activeTab === 'todo') {
      sources.push(this.data.todoImages && this.data.todoImages.pageBg)
    } else if (activeTab === 'farm') {
      const images = this.data.farmImages || {}
      sources.push(images.pageBg, images.hero, images.panelBg, images.field)
    } else if (activeTab === 'flower') {
      const images = this.data.flowerImages || {}
      sources.push(images.pageBg, images.hero, images.garden)
    }
    this.prefetchImageUrls(sources)
  },

  onShow() {
    const greeting = dateUtil.greeting()
    const dateLabel = dateUtil.todayLabel()
    const homeImages = applyImageCacheToObject(getHomeImages(), this.imageUrlCache || {})
    const update = {}
    if (this.data.dateLabel !== dateLabel) update.dateLabel = dateLabel
    if (this.data.greeting.text !== greeting.text || this.data.greeting.icon !== greeting.icon) update.greeting = greeting
    if (!this.data.homeImages || this.data.homeImages.timeSlot !== homeImages.timeSlot) {
      update.homeImages = homeImages
      update['tabImageReady.home'] = false
    }
    if (this.data.anniversary) {
      const anniversaryDays = getAnniversaryDays(this.data.anniversary.date)
      if (anniversaryDays !== this.data.anniversaryDays) {
        update.anniversaryDays = anniversaryDays
      }
    }
    if (Object.keys(update).length) this.setData(update)
    if (Object.prototype.hasOwnProperty.call(update, 'anniversaryDays')) {
      this.startAnniversaryFlip(this.data.anniversaryDisplayDays, update.anniversaryDays, this.data.anniversary)
    }
    this.refreshFarmView()
    this.refreshFlowerView()
    this.startFarmTimer()
    this.refreshFamilySession()
    this.startCloudPolling()
    this.resolveMenuImages()
  },

  refreshFamilySession() {
    if (this.data.familyStatus !== 'active') return
    cloudService.call('getSession')
      .then((session) => {
        if (session.active) {
          const update = { family: session.household }
          if (session.nickname && this.data.myNickname !== session.nickname) update.myNickname = session.nickname
          this.setData(update)
        } else {
          this.stopCloudPolling()
          this.setData({ familyStatus: 'none', family: null, familyMode: 'choose' })
        }
      })
      .catch((error) => console.warn('刷新家庭信息失败', error))
  },

  onHide() {
    this.cleanupPageTasks()
  },

  onUnload() {
    this.cleanupPageTasks()
  },

  cleanupPageTasks() {
    this.clearRollTimer()
    if (this.flyTimer) { clearTimeout(this.flyTimer); this.flyTimer = null }
    if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null }
    this.clearAnniversaryFlipTimer()
    this.stopFarmTimer()
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
      if (session.openid && this.data.myOpenid !== session.openid) {
        const lettersView = getLettersView(this.data.letters, session.openid)
        this.setData({
          myOpenid: session.openid,
          lettersDisplay: lettersView.lettersDisplay,
          latestLetter: lettersView.latestLetter,
          hasUnreadLetter: lettersView.hasUnreadLetter
        })
      }
      if (session.nickname && this.data.myNickname !== session.nickname) {
        this.setData({ myNickname: session.nickname })
      }
      if (!session.active) {
        this.setData({
          familyStatus: 'none',
          family: null,
          showFamilyPanel: false,
          familyError: ''
        })
        return
      }
      this.setData({
        familyStatus: 'active',
        family: session.household,
        familyError: ''
      })
      await this.pullCloudData()
      this.startCloudPolling()
    } catch (error) {
      console.warn('云端初始化失败', error)
      this.setData({
        familyStatus: 'offline',
        familyError: error.message || '暂时无法连接云端'
      })
    }
  },

  async pullCloudData() {
    if (this.data.familyStatus !== 'active' || this.cloudWritePending > 0 || this.hasQueuedCloudSync()) return
    try {
      const data = await cloudService.call('getData')
      // 拉取期间若又产生了本地写入/排队同步，丢弃这次结果，避免用旧云端数据覆盖更新的本地操作
      if (this.cloudWritePending > 0 || this.hasQueuedCloudSync()) return
      this.applyCloudData(data)
    } catch (error) {
      console.warn('拉取家庭数据失败', error)
      const message = (error && error.message) || ''
      if (message.includes('权限') || message.includes('请先创建或加入')) {
        this.handleFamilyRemoved()
      }
    }
  },

  // 被移除或云空间被解散后，自动回到未加入状态
  handleFamilyRemoved() {
    if (this.data.familyStatus !== 'active') return
    this.stopCloudPolling()
    this.setData({
      familyStatus: 'none',
      family: null,
      familyMode: 'choose'
    })
    wx.showToast({ title: '你已不在该云空间', icon: 'none' })
  },

  applyCloudData(data) {
    const cart = data.cart || {}
    const todos = Array.isArray(data.todos) ? data.todos : []
    const orders = Array.isArray(data.orders) ? data.orders : []
    const wishes = Array.isArray(data.wishes) ? data.wishes : []
    const farmView = getFarmView(data.farm, this.data.selectedFarmCrop)
    const flowerView = getFlowerView(data.flower, this.data.selectedFlowerType)
    const customMenuItems = Array.isArray(data.menus) ? data.menus.map(normalizeCustomMenuItem).slice(0, CUSTOM_MENU_LIMIT) : []
    const menuItemsForView = applyImageCache(getAllMenuItems(customMenuItems), this.imageUrlCache || {})
    const cartView = getCartView(cart, menuItemsForView)
    const todoView = getTodoView(todos, this.data.todoFilter)
    const wishView = getWishView(wishes)
    const cartChanged = !isSameCart(this.data.cart, cart)
    const todosChanged = !isSameTodos(this.data.todos, todoView.todos)
    const ordersChanged = !isSameList(this.data.orders, orders)
    const wishesChanged = !isSameList(this.data.wishes, wishView.wishes)
    const farmChanged = !isSameList(this.data.farmState, farmView.farmState)
    const flowerChanged = !isSameList(this.data.flowerState, flowerView.flowerState)
    const menusChanged = !isSameList(this.data.customMenuItems, customMenuItems)
    const update = {}

    if (menusChanged) {
      this.allMenuItems = menuItemsForView
      this.menuItemMap = getMenuItemMap(menuItemsForView)
      storage.write('customMenuItems', customMenuItems)
      Object.assign(update, {
        customMenuItems,
        customMenuDisplayItems: applyImageCache(customMenuItems, this.imageUrlCache || {}),
        recommendedItems: applyImageCache(getRecommendedMenuItems(menuItemsForView), this.imageUrlCache || {}),
        bannerItems: applyImageCache(getBannerItems(menuItemsForView), this.imageUrlCache || {}),
        filteredItems: applyImageCache(getFilteredMenuItems(menuItemsForView, this.data.currentCategory, this.data.searchKeyword), this.imageUrlCache || {}),
        menuDisplayItems: getMenuDisplayItems(menuItemsForView, this.data.currentCategory, this.data.searchKeyword)
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
      const ordersViews = getOrdersViews(orders)
      update.orders = orders
      update.ordersView = ordersViews.ordersView
      update.recentOrders = ordersViews.recentOrders
    }
    if (wishesChanged) {
      storage.write('wishes', wishView.wishes)
      Object.assign(update, {
        wishes: wishView.wishes,
        wishStats: wishView.wishStats
      })
    }
    if (farmChanged) {
      storage.write('farm', farmView.farmState)
      Object.assign(update, {
        farmState: farmView.farmState,
        farmPlots: farmView.farmPlots,
        farmInventoryList: farmView.farmInventoryList,
        selectedFarmCrop: farmView.selectedFarmCrop,
        farmStats: farmView.farmStats
      })
    }
    if (flowerChanged) {
      storage.write('flower', flowerView.flowerState)
      Object.assign(update, {
        flowerState: flowerView.flowerState,
        flowerPlots: flowerView.flowerPlots,
        flowerInventoryList: flowerView.flowerInventoryList,
        selectedFlowerType: flowerView.selectedFlowerType,
        flowerStats: flowerView.flowerStats
      })
    }
    if (todosChanged || ordersChanged) {
      update.profileStats = getProfileStats(todosChanged ? todoView.todos : this.data.todos, ordersChanged ? orders : this.data.orders)
    }

    const anniversary = normalizeAnniversary(data.anniversary)
    if (!isSameList(this.data.anniversary, anniversary)) {
      const anniversaryDays = anniversary ? getAnniversaryDays(anniversary.date) : 0
      const anniversaryDisplayDays = getAnniversaryDisplayStart(anniversary, anniversaryDays)
      storage.write('anniversary', anniversary)
      update.anniversary = anniversary
      update.anniversaryDays = anniversaryDays
      update.anniversaryDisplayDays = anniversaryDisplayDays
    }
    const messagesView = getMessagesView(data.messages, data.openid || this.data.myOpenid)
    if (!isSameList(this.data.messages, messagesView.messages)) {
      storage.write('messages', messagesView.messages)
      update.messages = messagesView.messages
      update.recentMessages = messagesView.recentMessages
      update.messagesDisplay = messagesView.messagesDisplay
    }
    const lettersView = getLettersView(data.letters, data.openid || this.data.myOpenid)
    if (!isSameList(this.data.letters, lettersView.letters)) {
      storage.write('letters', lettersView.letters)
      update.letters = lettersView.letters
      update.lettersDisplay = lettersView.lettersDisplay
      update.latestLetter = lettersView.latestLetter
      update.hasUnreadLetter = lettersView.hasUnreadLetter
      if (this.data.selectedLetter) {
        update.selectedLetter = lettersView.lettersDisplay.find((item) => item.id === this.data.selectedLetter.id) || this.data.selectedLetter
      }
    }

    if (Object.keys(update).length) this.setData(update)
    if (Object.prototype.hasOwnProperty.call(update, 'anniversaryDays')) {
      this.startAnniversaryFlip(update.anniversaryDisplayDays, update.anniversaryDays, update.anniversary)
    }
    if (menusChanged) this.resolveMenuImages()
    this.cloudDataReady = true
  },

  commitCustomMenuItems(customMenuItems, options = {}) {
    const normalizedMenuItems = customMenuItems.map(normalizeCustomMenuItem).slice(0, CUSTOM_MENU_LIMIT)
    const allMenuItems = applyImageCache(getAllMenuItems(normalizedMenuItems), this.imageUrlCache || {})
    const cart = options.cart || this.data.cart
    const cartView = getCartView(cart, allMenuItems)
    this.allMenuItems = allMenuItems
    this.menuItemMap = getMenuItemMap(allMenuItems)
    const update = Object.assign({
      customMenuItems: normalizedMenuItems,
      customMenuDisplayItems: applyImageCache(normalizedMenuItems, this.imageUrlCache || {}),
      recommendedItems: applyImageCache(getRecommendedMenuItems(allMenuItems), this.imageUrlCache || {}),
      bannerItems: applyImageCache(getBannerItems(allMenuItems), this.imageUrlCache || {}),
      filteredItems: applyImageCache(getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword), this.imageUrlCache || {}),
      menuDisplayItems: getMenuDisplayItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
      cartItems: cartView.cartItems,
      cartCount: cartView.cartCount
    }, options.extraData || {})
    if (options.cart) update.cart = cart
    this.setData(update)
    this.resolveMenuImages()
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
      .catch((error) => {
        console.warn(`同步 ${resource} 失败`, error)
        wx.showToast({ title: `云端同步失败：${error.message || resource}`, icon: 'none' })
      })
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
    this.setData({ showFamilyPanel: true, familyError: '', familyMode: 'choose' })
    this.refreshFamilySession()
  },

  closeFamilyPanel() {
    this.setData({ showFamilyPanel: false, familyError: '' })
  },

  setFamilyMode(event) {
    const mode = event.currentTarget.dataset.mode || 'choose'
    this.setData({ familyMode: mode, familyError: '' })
  },

  onFamilyInviteCodeInput(event) {
    const value = event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    this.setData({ familyInviteCode: value })
  },

  onFamilyNicknameInput(event) {
    this.setData({ familyNickname: textSlice(event.detail.value, 12) })
  },

  async createFamily() {
    if (this.data.familyBusy) return
    this.setData({ familyBusy: true, familyError: '' })
    try {
      const result = await cloudService.call('createHousehold', {
        nickname: this.data.familyNickname
      })
      this.setData({
        familyStatus: 'active',
        family: result.household,
        familyNickname: ''
      })
      const data = await cloudService.call('migrateLocal', {
        data: { cart: this.data.cart, todos: this.data.todos, orders: this.data.orders, wishes: this.data.wishes, menus: this.data.customMenuItems, farm: this.data.farmState, flower: this.data.flowerState, places: [] }
      })
      this.applyCloudData(data)
      this.startCloudPolling()
      wx.showToast({ title: '小家已创建', icon: 'success' })
    } catch (error) {
      this.setData({ familyError: error.message || '创建失败，请重试' })
    } finally {
      this.setData({ familyBusy: false })
    }
  },

  async joinFamily() {
    if (this.data.familyBusy) return
    if (this.data.familyInviteCode.length !== 6) {
      this.setData({ familyError: '请输入完整的邀请码' })
      return
    }
    this.setData({ familyBusy: true, familyError: '' })
    try {
      const result = await cloudService.call('joinHousehold', {
        inviteCode: this.data.familyInviteCode,
        nickname: this.data.familyNickname
      })
      this.setData({
        familyStatus: 'active',
        family: result.household,
        familyInviteCode: '',
        familyNickname: ''
      })
      await this.pullCloudData()
      this.startCloudPolling()
      this.setData({ showFamilyPanel: false })
      wx.showToast({ title: '已加入小家', icon: 'success' })
    } catch (error) {
      this.setData({ familyError: error.message || '加入失败，请重试' })
    } finally {
      this.setData({ familyBusy: false })
    }
  },

  copyInviteCode() {
    const code = this.data.family && this.data.family.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  openMemberManager() {
    this.setData({ showFamilyPanel: false })
    wx.navigateTo({ url: '/pages/members/members' })
  },

  leaveFamily() {
    const isAdmin = this.data.family && this.data.family.isAdmin
    wx.showModal({
      title: isAdmin ? '解散云空间' : '退出云空间',
      content: isAdmin
        ? '解散后，所有成员都会被移出，共享数据将被删除，且无法恢复。'
        : '退出后将无法查看共享数据，可重新用邀请码加入。',
      confirmText: isAdmin ? '解散' : '退出',
      confirmColor: '#e75c48',
      success: async (modal) => {
        if (!modal.confirm) return
        if (this.data.familyBusy) return
        this.setData({ familyBusy: true })
        try {
          const result = await cloudService.call('leaveHousehold')
          this.stopCloudPolling()
          this.setData({
            familyStatus: 'none',
            family: null,
            familyMode: 'choose',
            showFamilyPanel: false,
            familyError: ''
          })
          wx.showToast({ title: result.dissolved ? '已解散' : '已退出', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '操作失败', icon: 'none' })
        } finally {
          this.setData({ familyBusy: false })
        }
      }
    })
  },

  retryCloud() {
    this.setData({
      familyStatus: 'loading',
      familyError: ''
    })
    this.initializeCloud()
  },

  noop() {},

  // 切换 tab 后把内容滚回顶部（先置非 0 再置 0，强制 scroll-top 变化生效）
  resetScroll() {
    this.setData({ scrollTop: 1 })
    wx.nextTick(() => this.setData({ scrollTop: 0 }))
  },

  setTab(event) {
    const activeTab = event.detail.id
    const update = {}
    if (this.data.activeTab !== activeTab) {
      update.activeTab = activeTab
      update[`visitedTabs.${activeTab}`] = true
    }
    if (this.data.showCart) update.showCart = false
    if (Object.keys(update).length) {
      this.setData(update, () => this.prefetchActiveTabImages(activeTab))
      if (activeTab === 'farm') this.refreshFarmView()
      if (activeTab === 'flower') this.refreshFlowerView()
      if (update.activeTab) this.resetScroll()
    }
  },

  navigateFromCard(event) {
    const target = event.currentTarget.dataset.target
    if (target === 'cart') {
      this.openCart()
      return
    }
    if (target === this.data.activeTab) return
    this.setData({ activeTab: target, [`visitedTabs.${target}`]: true }, () => this.prefetchActiveTabImages(target))
    if (target === 'farm') this.refreshFarmView()
    if (target === 'flower') this.refreshFlowerView()
    this.resetScroll()
  },

  exploreMenu(event) {
    const category = event.currentTarget.dataset.category || 'recommend'
    this.applyMenuFilter(category, '', { activeTab: 'menu' })
    this.resetScroll()
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
      this.setData({
        filteredItems: getFilteredMenuItems(this.allMenuItems, this.data.currentCategory, this.data.searchKeyword),
        menuDisplayItems: getMenuDisplayItems(this.allMenuItems, this.data.currentCategory, this.data.searchKeyword),
        menuMotion: this.data.menuMotion === 'a' ? 'b' : 'a'
      })
      this.searchTimer = null
    }, SEARCH_DEBOUNCE_MS)
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.applyMenuFilter(this.data.currentCategory, '')
  },

  applyMenuFilter(currentCategory, searchKeyword, extraData = {}) {
    const update = Object.assign({
      currentCategory,
      searchKeyword,
      filteredItems: getFilteredMenuItems(this.allMenuItems, currentCategory, searchKeyword),
      menuDisplayItems: getMenuDisplayItems(this.allMenuItems, currentCategory, searchKeyword),
      menuMotion: this.data.menuMotion === 'a' ? 'b' : 'a'
    }, extraData)
    if (extraData.activeTab) update[`visitedTabs.${extraData.activeTab}`] = true
    this.setData(update, () => this.prefetchActiveTabImages(this.data.activeTab))
  },

  addToCart(event) {
    const id = event.currentTarget.dataset.id
    const menuItem = (this.menuItemMap && this.menuItemMap[id]) || this.allMenuItems.find((item) => item.id === id)
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
    const cartView = getCartView(cart, this.allMenuItems)
    this.setData(Object.assign({ cart }, cartView, extraData))
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
    const ordersViews = getOrdersViews(orders)
    const emptyCartView = getCartView({}, this.allMenuItems)
    storage.write('orders', orders)
    storage.write('cart', {})
    this.setData({
      orders,
      ordersView: ordersViews.ordersView,
      recentOrders: ordersViews.recentOrders,
      cart: {},
      cartItems: emptyCartView.cartItems,
      cartCount: emptyCartView.cartCount,
      showCart: false,
      orderRemark: '',
      showOrderSuccess: true,
      latestOrderId: order.id,
      orderSuccessCopy: getOrderSuccessCopy(order),
      profileStats: getProfileStats(this.data.todos, orders)
    })
    // 下单同时写 orders 与清空 cart：等两次写都完成后再拉取对齐，避免轮询拉到中间态导致购物车被旧数据复活
    if (this.data.familyStatus === 'active') {
      Promise.all([
        this.syncCloudResource('orders', orders),
        this.syncCloudResource('cart', {})
      ]).then(() => this.pullCloudData())
      this.notifyOrderToAdmin(order)
    }
  },

  notifyOrderToAdmin(order) {
    const family = this.data.family
    if (!family || !family.canNotifyAdmin) return
    cloudService.call('notifyOrderAdmin', { order })
      .catch((error) => console.warn('通知管理员失败', error))
  },

  enableOrderPush() {
    if (this.data.orderPushEnabled) {
      storage.write('orderPushEnabled', false)
      this.setData({ orderPushEnabled: false })
      wx.showToast({ title: '已关闭点餐提醒', icon: 'none' })
      return
    }
    const family = this.data.family
    const tmplId = family && family.orderNoticeTemplateId
    if (!tmplId) {
      wx.showToast({ title: '提醒功能未配置', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res[tmplId] === 'accept') {
          storage.write('orderPushEnabled', true)
          this.setData({ orderPushEnabled: true })
          wx.showToast({ title: '已开启点餐提醒', icon: 'success' })
        } else {
          wx.showToast({ title: '未开启提醒', icon: 'none' })
        }
      },
      fail: (error) => {
        console.warn('订阅点餐提醒失败', error)
        wx.showToast({ title: '开启失败，请重试', icon: 'none' })
      }
    })
  },

  finishOrder() {
    this.setData({ showOrderSuccess: false, activeTab: 'home' })
    this.resetScroll()
  },

  openAiPanel() {
    const update = { showAiPanel: true }
    if (!this.data.aiMessages.length) {
      update.aiMessages = [{ role: 'assistant', content: '嗨，我是饭团～今晚想吃点什么，或者需要什么生活小建议，都可以问我。' }]
    }
    this.setData(update)
  },

  closeAiPanel() {
    this.setData({ showAiPanel: false })
  },

  onAiInput(event) {
    this.setData({ aiInput: event.detail.value })
  },

  buildAiContext() {
    const pool = (this.allMenuItems && this.allMenuItems.length) ? this.allMenuItems : []
    return { menu: pool.map((item) => item.name).filter(Boolean).slice(0, 40) }
  },

  configureAiKey() {
    const family = this.data.family
    if (!family || !family.isAdmin) {
      wx.showToast({ title: '只有管理员可以配置饭团', icon: 'none' })
      return
    }
    wx.showModal({
      title: family.aiConfigured ? '更新饭团 API Key' : '配置饭团 API Key',
      editable: true,
      placeholderText: '粘贴 GLM 的 API Key',
      confirmText: '保存',
      success: async (modal) => {
        if (!modal.confirm) return
        const apiKey = String(modal.content || '').trim()
        if (!apiKey) {
          wx.showToast({ title: '请输入 API Key', icon: 'none' })
          return
        }
        try {
          const result = await cloudService.call('setAiApiKey', { apiKey })
          if (result && result.household) this.setData({ family: result.household })
          wx.showToast({ title: '饭团已就绪', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '保存失败', icon: 'none' })
        }
      }
    })
  },

  sendAiMessage() {
    if (this.data.aiSending) return
    const text = String(this.data.aiInput || '').trim().slice(0, 500)
    if (!text) {
      wx.showToast({ title: '说点什么吧', icon: 'none' })
      return
    }
    const messages = this.data.aiMessages.concat({ role: 'user', content: text })
    this.setData({ aiMessages: messages, aiInput: '', aiSending: true }, () => this.scrollAiToBottom())
    let settled = false
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('饭团想了好久，请再试一次')), AI_REQUEST_TIMEOUT_MS)
    })
    Promise.race([
      cloudService.call('aiChat', {
        messages: messages.filter((item) => item.role === 'user' || item.role === 'assistant'),
        context: this.buildAiContext()
      }),
      timeout
    ])
      .then((result) => {
        if (settled) return
        settled = true
        const reply = (result && result.reply) || '我没太理解，可以再说一次吗？'
        this.setData({ aiMessages: this.data.aiMessages.concat({ role: 'assistant', content: reply }), aiSending: false }, () => this.scrollAiToBottom())
      })
      .catch((error) => {
        if (settled) return
        settled = true
        this.setData({ aiSending: false })
        wx.showToast({ title: error.message || '饭团暂时不可用', icon: 'none' })
      })
  },

  scrollAiToBottom() {
    this.setData({ aiScrollTop: (this.data.aiScrollTop || 0) + 100000 })
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

  openAllOrders() {
    this.setData({ showAllOrders: true })
  },

  closeAllOrders() {
    this.setData({ showAllOrders: false })
  },

  commitOrders(orders, options = {}) {
    const ordersViews = getOrdersViews(orders)
    const update = Object.assign({
      orders,
      ordersView: ordersViews.ordersView,
      recentOrders: ordersViews.recentOrders,
      profileStats: getProfileStats(this.data.todos, orders)
    }, options.extraData || {})
    this.setData(update)
    if (options.persist !== false) storage.write('orders', orders)
    if (options.sync) this.syncCloudResource('orders', orders)
    return ordersViews
  },

  deleteOrder(event) {
    const id = String(event.currentTarget.dataset.id)
    const order = this.data.orders.find((item) => String(item.id) === id)
    if (!order) return
    wx.showModal({
      title: '删除这条订单？',
      content: '删除后就找不回来啦',
      confirmText: '删除',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        const orders = this.data.orders.filter((item) => String(item.id) !== id)
        const extraData = orders.length ? {} : { showAllOrders: false }
        this.commitOrders(orders, { sync: true, extraData })
      }
    })
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

  refreshFarmView() {
    const farmView = getFarmView(this.data.farmState, this.data.selectedFarmCrop)
    this.setData({
      farmState: farmView.farmState,
      farmPlots: farmView.farmPlots,
      farmInventoryList: farmView.farmInventoryList,
      selectedFarmCrop: farmView.selectedFarmCrop,
      farmStats: farmView.farmStats
    })
    return farmView
  },

  startFarmTimer() {
    if (this.farmTimer) return
    this.farmTimer = setInterval(() => {
      if (this.data.activeTab === 'farm') this.refreshFarmView()
    }, 60000)
  },

  stopFarmTimer() {
    if (!this.farmTimer) return
    clearInterval(this.farmTimer)
    this.farmTimer = null
  },

  commitFarmState(farmState, options = {}) {
    const farmView = getFarmView(farmState, options.selectedCropId || this.data.selectedFarmCrop)
    this.setData(Object.assign({
      farmState: farmView.farmState,
      farmPlots: farmView.farmPlots,
      farmInventoryList: farmView.farmInventoryList,
      selectedFarmCrop: farmView.selectedFarmCrop,
      farmStats: farmView.farmStats
    }, options.extraData || {}))
    if (options.persist !== false) storage.write('farm', farmView.farmState)
    if (options.sync) this.syncCloudResource('farm', farmView.farmState, { debounce: true })
    return farmView
  },

  selectFarmCrop(event) {
    const id = event.currentTarget.dataset.id
    if (!FARM_CROP_MAP[id]) return
    this.commitFarmState(this.data.farmState, { selectedCropId: id, persist: false })
  },

  tapFarmPlot(event) {
    const id = Number(event.currentTarget.dataset.id)
    const plot = this.data.farmPlots.find((item) => Number(item.id) === id)
    if (!plot) return
    if (plot.empty) {
      this.plantFarmCrop(id)
      return
    }
    if (plot.ready) {
      this.harvestFarmPlot(id)
      return
    }
    this.waterFarmPlot(id)
  },

  plantFarmCrop(plotId) {
    const crop = FARM_CROP_MAP[this.data.selectedFarmCrop] || FARM_CROPS[0]
    const farmState = normalizeFarmState(this.data.farmState)
    if (farmState.coins < crop.seedCost) {
      wx.showToast({ title: '金币不够，先领每日阳光吧', icon: 'none' })
      return
    }
    const plots = farmState.plots.map((plot) => {
      if (Number(plot.id) !== Number(plotId) || plot.cropId) return plot
      return { id: plot.id, cropId: crop.id, plantedAt: Date.now(), wateredAt: 0 }
    })
    farmState.coins -= crop.seedCost
    farmState.plots = plots
    this.commitFarmState(farmState, { sync: true })
    wx.showToast({ title: `种下${crop.name}`, icon: 'success' })
  },

  waterFarmPlot(plotId) {
    const farmState = normalizeFarmState(this.data.farmState)
    let watered = false
    farmState.plots = farmState.plots.map((plot) => {
      if (Number(plot.id) !== Number(plotId) || !plot.cropId || plot.wateredAt) return plot
      watered = true
      return Object.assign({}, plot, { wateredAt: Date.now() })
    })
    if (!watered) {
      wx.showToast({ title: '这块地已经浇过水啦', icon: 'none' })
      return
    }
    this.commitFarmState(farmState, { sync: true })
    wx.showToast({ title: '浇水完成', icon: 'success' })
  },

  harvestFarmPlot(plotId) {
    const farmState = normalizeFarmState(this.data.farmState)
    const plotView = this.data.farmPlots.find((item) => Number(item.id) === Number(plotId))
    if (!plotView || !plotView.ready) {
      wx.showToast({ title: '还没成熟，再等等', icon: 'none' })
      return
    }
    const crop = FARM_CROP_MAP[plotView.cropId]
    if (!crop) return
    farmState.inventory[crop.id] = (Number(farmState.inventory[crop.id]) || 0) + crop.harvest
    farmState.coins += crop.reward
    farmState.plots = farmState.plots.map((plot) => (
      Number(plot.id) === Number(plotId)
        ? { id: plot.id, cropId: '', plantedAt: 0, wateredAt: 0 }
        : plot
    ))
    this.commitFarmState(farmState, { sync: true })
    wx.showToast({ title: `收获 ${crop.name} ×${crop.harvest}`, icon: 'success' })
  },

  claimFarmDailyBonus() {
    const today = todayDateString()
    const farmState = normalizeFarmState(this.data.farmState)
    if (farmState.lastBonusDate === today) {
      wx.showToast({ title: '今天已经领过啦', icon: 'none' })
      return
    }
    farmState.coins += FARM_DAILY_BONUS
    farmState.lastBonusDate = today
    this.commitFarmState(farmState, { sync: true })
    wx.showToast({ title: `阳光金币 +${FARM_DAILY_BONUS}`, icon: 'success' })
  },

  refreshFlowerView() {
    const flowerView = getFlowerView(this.data.flowerState, this.data.selectedFlowerType)
    const cache = this.imageUrlCache || {}
    this.setData({
      flowerState: flowerView.flowerState,
      flowerPlots: applyFlowerPlotImageCache(flowerView.flowerPlots, cache),
      flowerInventoryList: applyImageCache(flowerView.flowerInventoryList, cache),
      selectedFlowerType: flowerView.selectedFlowerType,
      flowerStats: flowerView.flowerStats
    })
    return flowerView
  },

  commitFlowerState(flowerState, options = {}) {
    const flowerView = getFlowerView(flowerState, options.selectedFlowerId || this.data.selectedFlowerType)
    const cache = this.imageUrlCache || {}
    this.setData(Object.assign({
      flowerState: flowerView.flowerState,
      flowerPlots: applyFlowerPlotImageCache(flowerView.flowerPlots, cache),
      flowerInventoryList: applyImageCache(flowerView.flowerInventoryList, cache),
      selectedFlowerType: flowerView.selectedFlowerType,
      flowerStats: flowerView.flowerStats
    }, options.extraData || {}))
    if (options.persist !== false) storage.write('flower', flowerView.flowerState)
    if (options.sync) this.syncCloudResource('flower', flowerView.flowerState, { debounce: true })
    return flowerView
  },

  selectFlowerType(event) {
    const id = event.currentTarget.dataset.id
    if (!FLOWER_TYPE_MAP[id]) return
    this.commitFlowerState(this.data.flowerState, { selectedFlowerId: id, persist: false })
  },

  tapFlowerPlot(event) {
    const id = Number(event.currentTarget.dataset.id)
    const plot = this.data.flowerPlots.find((item) => Number(item.id) === id)
    if (!plot) return
    if (plot.empty) {
      this.plantFlower(id)
      return
    }
    if (plot.ready) {
      this.harvestFlower(id)
      return
    }
    this.careFlower(id)
  },

  plantFlower(plotId) {
    const flower = FLOWER_TYPE_MAP[this.data.selectedFlowerType] || FLOWER_TYPES[0]
    const flowerState = normalizeFlowerState(this.data.flowerState)
    if (flowerState.nectar < flower.seedCost) {
      wx.showToast({ title: '花露不够，先领今日花露吧', icon: 'none' })
      return
    }
    flowerState.nectar -= flower.seedCost
    flowerState.plots = flowerState.plots.map((plot) => {
      if (Number(plot.id) !== Number(plotId) || plot.flowerId) return plot
      return { id: plot.id, flowerId: flower.id, plantedAt: Date.now(), caredAt: 0 }
    })
    this.commitFlowerState(flowerState, { sync: true })
    wx.showToast({ title: `种下${flower.name}`, icon: 'success' })
  },

  careFlower(plotId) {
    const flowerState = normalizeFlowerState(this.data.flowerState)
    let cared = false
    flowerState.plots = flowerState.plots.map((plot) => {
      if (Number(plot.id) !== Number(plotId) || !plot.flowerId || plot.caredAt) return plot
      cared = true
      return Object.assign({}, plot, { caredAt: Date.now() })
    })
    if (!cared) {
      wx.showToast({ title: '这朵花已经照料过啦', icon: 'none' })
      return
    }
    this.commitFlowerState(flowerState, { sync: true })
    wx.showToast({ title: '照料完成', icon: 'success' })
  },

  harvestFlower(plotId) {
    const flowerState = normalizeFlowerState(this.data.flowerState)
    const plotView = this.data.flowerPlots.find((item) => Number(item.id) === Number(plotId))
    if (!plotView || !plotView.ready) {
      wx.showToast({ title: '花还没开，再等等', icon: 'none' })
      return
    }
    const flower = FLOWER_TYPE_MAP[plotView.flowerId]
    if (!flower) return
    flowerState.inventory[flower.id] = (Number(flowerState.inventory[flower.id]) || 0) + flower.harvest
    flowerState.nectar += flower.reward
    flowerState.plots = flowerState.plots.map((plot) => (
      Number(plot.id) === Number(plotId)
        ? { id: plot.id, flowerId: '', plantedAt: 0, caredAt: 0 }
        : plot
    ))
    this.commitFlowerState(flowerState, { sync: true })
    wx.showToast({ title: `收获 ${flower.name} ×${flower.harvest}`, icon: 'success' })
  },

  claimFlowerDailyBonus() {
    const today = todayDateString()
    const flowerState = normalizeFlowerState(this.data.flowerState)
    if (flowerState.lastBonusDate === today) {
      wx.showToast({ title: '今天已经领过啦', icon: 'none' })
      return
    }
    flowerState.nectar += FLOWER_DAILY_BONUS
    flowerState.lastBonusDate = today
    this.commitFlowerState(flowerState, { sync: true })
    wx.showToast({ title: `花露 +${FLOWER_DAILY_BONUS}`, icon: 'success' })
  },

  openMenuManager() {
    this.setData({
      showMenuManager: true,
      menuDraft: createMenuDraft(),
      editingMenuId: null,
      customMenuDisplayItems: applyImageCache(this.data.customMenuItems, this.imageUrlCache || {})
    })
    this.resolveMenuImages()
  },

  closeMenuManager() {
    this.setData({ showMenuManager: false, editingMenuId: null, menuDraft: createMenuDraft() })
  },

  editMenuItem(event) {
    const id = String(event.currentTarget.dataset.id || '')
    const menuItem = this.data.customMenuItems.find((item) => item.id === id)
    if (!menuItem) return
    const cachedImage = this.imageUrlCache && this.imageUrlCache[menuItem.image]
    const imagePreview = cachedImage
      ? cachedImage.url
      : (menuItem.image && menuItem.image.indexOf('cloud://') !== 0 ? menuItem.image : '')
    this.setData({
      editingMenuId: id,
      menuDraft: {
        name: menuItem.name,
        description: menuItem.description,
        emoji: menuItem.emoji,
        image: menuItem.image || '',
        imagePreview,
        imageUploading: false,
        tags: (menuItem.tags || []).join('、'),
        category: menuItem.category,
        recommended: !!menuItem.recommended
      }
    })
    if (menuItem.image && menuItem.image.indexOf('cloud://') === 0 && !cachedImage) this.resolveMenuImages()
  },

  pickRandomDish() {
    const pool = (this.allMenuItems && this.allMenuItems.length) ? this.allMenuItems : []
    if (!pool.length) return null
    const current = this.data.randomDish && this.data.randomDish.id
    let next = pool[Math.floor(Math.random() * pool.length)]
    // 尽量不连续抽到同一道
    if (pool.length > 1 && next.id === current) {
      next = pool[(pool.indexOf(next) + 1) % pool.length]
    }
    return next
  },

  openRandomDish() {
    const dish = this.pickRandomDish()
    if (!dish) {
      wx.showToast({ title: '还没有可选的菜', icon: 'none' })
      return
    }
    this.setData({ showRandomDish: true, randomDish: dish })
    this.rollRandomDish()
  },

  rollRandomDish() {
    if (this.data.randomRolling) return
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.setData({ randomRolling: true })
    let count = 0
    this.clearRollTimer()
    this.rollTimer = setInterval(() => {
      const dish = this.pickRandomDish()
      if (dish) this.setData({ randomDish: dish })
      count += 1
      if (count >= 7) {
        this.clearRollTimer()
        this.setData({ randomRolling: false })
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      }
    }, 160)
  },

  clearRollTimer() {
    if (this.rollTimer) {
      clearInterval(this.rollTimer)
      this.rollTimer = null
    }
  },

  closeRandomDish() {
    this.clearRollTimer()
    this.setData({ showRandomDish: false, randomRolling: false })
  },

  addRandomToCart(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    this.clearRollTimer()
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + 1
    storage.write('cart', cart)
    this.updateCart(cart)
    this.syncCloudResource('cart', cart, { debounce: true })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.setData({ showRandomDish: false })
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },

  startAnniversaryFlip(fromDays, toDays, anniversary = this.data.anniversary) {
    const start = Number(fromDays) || 0
    const end = Number(toDays) || 0
    this.clearAnniversaryFlipTimer()
    if (!anniversary || !end) {
      this.setData({ anniversaryDisplayDays: end, anniversaryFlipActive: false })
      return
    }
    if (start === end) {
      this.setData({ anniversaryDisplayDays: end, anniversaryFlipActive: false })
      this.recordAnniversaryOpen(anniversary, end)
      return
    }

    let current = start
    const direction = end > start ? 1 : -1
    const step = Math.max(1, Math.ceil(Math.abs(end - start) / ANNIVERSARY_FLIP_MAX_STEPS))
    let frame = this.data.anniversaryFlipFrame || 0
    this.setData({ anniversaryDisplayDays: current, anniversaryFlipActive: true, anniversaryFlipFrame: frame })
    this.anniversaryFlipTimer = setInterval(() => {
      current += direction * step
      frame = frame ? 0 : 1
      if ((direction > 0 && current >= end) || (direction < 0 && current <= end)) {
        current = end
      }
      this.setData({
        anniversaryDisplayDays: current,
        anniversaryFlipActive: current !== end,
        anniversaryFlipFrame: frame
      })
      if (current === end) {
        this.clearAnniversaryFlipTimer()
        this.recordAnniversaryOpen(anniversary, end)
      }
    }, ANNIVERSARY_FLIP_INTERVAL_MS)
  },

  clearAnniversaryFlipTimer() {
    if (!this.anniversaryFlipTimer) return
    clearInterval(this.anniversaryFlipTimer)
    this.anniversaryFlipTimer = null
  },

  recordAnniversaryOpen(anniversary, days) {
    if (!anniversary || !anniversary.date || !days) return
    storage.write('anniversaryLastOpen', {
      date: anniversary.date,
      days,
      openedAt: Date.now()
    })
  },

  openAnniversarySheet() {
    const anniversary = this.data.anniversary
    this.setData({
      showAnniversarySheet: true,
      anniversaryDraft: {
        title: anniversary ? anniversary.title : '在一起',
        date: anniversary ? anniversary.date : this.data.todayDate
      }
    })
  },

  closeAnniversarySheet() {
    this.setData({ showAnniversarySheet: false })
  },

  onAnniversaryTitleInput(event) {
    this.setData({ 'anniversaryDraft.title': event.detail.value })
  },

  onAnniversaryDateChange(event) {
    this.setData({ 'anniversaryDraft.date': event.detail.value })
  },

  async saveAnniversary() {
    const draft = this.data.anniversaryDraft
    const title = textSlice(draft.title, 12) || '在一起'
    const date = textSlice(draft.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      wx.showToast({ title: '选一个开始的日子吧', icon: 'none' })
      return
    }
    if (date > this.data.todayDate) {
      wx.showToast({ title: '日期不能晚于今天', icon: 'none' })
      return
    }
    const anniversary = { title, date }
    const anniversaryDays = getAnniversaryDays(date)
    storage.write('anniversary', anniversary)
    this.setData({
      anniversary,
      anniversaryDays,
      anniversaryDisplayDays: this.data.anniversaryDisplayDays || anniversaryDays,
      showAnniversarySheet: false
    })
    this.startAnniversaryFlip(this.data.anniversaryDisplayDays || anniversaryDays, anniversaryDays, anniversary)
    await this.writeCloudResource('anniversary', anniversary)
    await this.pullCloudData()
    wx.showToast({ title: '已记下这个日子', icon: 'success' })
  },

  async clearAnniversary() {
    storage.write('anniversary', null)
    storage.write('anniversaryLastOpen', null)
    this.clearAnniversaryFlipTimer()
    this.setData({
      anniversary: null,
      anniversaryDays: 0,
      anniversaryDisplayDays: 0,
      anniversaryFlipActive: false,
      anniversaryFlipFrame: 0,
      showAnniversarySheet: false
    })
    await this.writeCloudResource('anniversary', null)
    wx.showToast({ title: '已清除纪念日', icon: 'success' })
  },

  commitMessages(messages, options = {}) {
    const messagesView = getMessagesView(messages, this.data.myOpenid)
    this.setData(Object.assign({
      messages: messagesView.messages,
      recentMessages: messagesView.recentMessages,
      messagesDisplay: messagesView.messagesDisplay
    }, options.extraData || {}))
    if (options.persist !== false) storage.write('messages', messagesView.messages)
    if (options.sync) this.syncCloudResource('messages', messagesView.messages)
    return messagesView
  },

  openMessages() {
    this.setData({ showMessages: true })
  },

  closeMessages() {
    this.setData({ showMessages: false })
  },

  onMessageDraftInput(event) {
    this.setData({ messageDraft: event.detail.value })
  },

  sendMessage() {
    const text = textSlice(this.data.messageDraft, 80)
    if (!text) {
      wx.showToast({ title: '写一句悄悄话吧', icon: 'none' })
      return
    }
    const message = {
      id: Date.now(),
      text,
      authorOpenid: this.data.myOpenid || '',
      authorName: this.data.myNickname || '我',
      createdAt: Date.now()
    }
    this.commitMessages([message].concat(this.data.messages), {
      sync: true,
      extraData: { messageDraft: '' }
    })
    wx.showToast({ title: '已留下悄悄话', icon: 'success' })
  },

  deleteMessage(event) {
    const id = String(event.currentTarget.dataset.id)
    const message = this.data.messages.find((item) => String(item.id) === id)
    if (!message) return
    wx.showModal({
      title: '删除这句悄悄话？',
      content: '删除后就找不回来啦',
      confirmText: '删除',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        this.commitMessages(this.data.messages.filter((item) => String(item.id) !== id), { sync: true })
      }
    })
  },

  async toggleReaction(event) {
    const { id, emoji } = event.currentTarget.dataset
    if (!id || MESSAGE_REACTION_EMOJIS.indexOf(emoji) === -1) return
    const messageId = String(id)

    // 云空间模式：交给云函数用服务端 openid 增删，避免多成员并发覆盖
    if (this.data.familyStatus === 'active') {
      try {
        const result = await cloudService.call('toggleMessageReaction', { messageId, emoji })
        this.commitMessages(result.messages || this.data.messages)
      } catch (error) {
        wx.showToast({ title: error.message || '操作失败', icon: 'none' })
      }
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
      return
    }

    // 本地模式：用固定本地标识切换自己的回应
    const me = this.data.myOpenid || 'local-self'
    const messages = this.data.messages.map((item) => {
      if (String(item.id) !== messageId) return item
      const reactions = Object.assign({}, item.reactions)
      const users = Array.isArray(reactions[emoji]) ? reactions[emoji].slice() : []
      const index = users.indexOf(me)
      if (index !== -1) {
        users.splice(index, 1)
        if (users.length) reactions[emoji] = users
        else delete reactions[emoji]
      } else {
        reactions[emoji] = users.concat(me)
      }
      return Object.assign({}, item, { reactions })
    })
    this.commitMessages(messages)
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  commitLetters(letters, options = {}) {
    const lettersView = getLettersView(letters, this.data.myOpenid)
    const selectedLetter = this.data.selectedLetter
      ? lettersView.lettersDisplay.find((item) => item.id === this.data.selectedLetter.id) || this.data.selectedLetter
      : null
    this.setData(Object.assign({
      letters: lettersView.letters,
      lettersDisplay: lettersView.lettersDisplay,
      latestLetter: lettersView.latestLetter,
      hasUnreadLetter: lettersView.hasUnreadLetter,
      selectedLetter
    }, options.extraData || {}))
    storage.write('letters', lettersView.letters)
    return lettersView
  },

  openLetterComposer() {
    if (this.data.familyStatus !== 'active') {
      wx.showToast({ title: '先加入家庭云空间吧', icon: 'none' })
      return
    }
    this.setData({ showFamilyPanel: false, showLetterComposer: true, familyError: '' }, () => {
      this.loadLetterHandwritingFont()
      this.resolveMenuImages()
    })
  },

  closeLetterComposer() {
    if (this.data.letterSending) return
    this.setData({ showLetterComposer: false })
  },

  onLetterDraftInput(event) {
    this.setData({ letterDraft: event.detail.value })
  },

  sendLetter() {
    const text = String(this.data.letterDraft || '')
    if (!text.trim()) {
      wx.showToast({ title: '先写下想说的话吧', icon: 'none' })
      return
    }
    if (this.data.letterSending || this.data.familyStatus !== 'active') return
    wx.showModal({
      title: '确认把信寄到首页吗？',
      content: '发出后，家里的每个人都能拆开阅读。',
      confirmText: '确认发出',
      confirmColor: '#b6634b',
      success: (result) => {
        if (result.confirm) this.submitLetter(text)
      }
    })
  },

  async submitLetter(text) {
    this.setData({ letterSending: true })
    try {
      const result = await cloudService.call('sendLetter', { text })
      this.commitLetters(result.letters || [], {
        extraData: {
          activeTab: 'home',
          scrollTop: 0,
          letterDraft: '',
          showLetterComposer: false
        }
      })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '信已经寄到首页', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '这封信没寄出去', icon: 'none' })
    } finally {
      this.setData({ letterSending: false })
    }
  },

  openLetter(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const letter = id
      ? this.data.lettersDisplay.find((item) => item.id === id)
      : this.data.latestLetter
    if (!letter || this.data.showLetterViewer) return
    this.setData({
      selectedLetter: letter,
      showLetterViewer: true
    }, () => {
      this.loadLetterHandwritingFont()
      this.resolveMenuImages()
    })
    if (this.data.familyStatus === 'active' && letter.isUnread) {
      cloudService.call('openLetter', { letterId: letter.id })
        .then((result) => this.commitLetters(result.letters || this.data.letters))
        .catch((error) => console.warn('记录拆信状态失败', error))
    }
  },

  closeLetterViewer() {
    if (this.data.letterWithdrawing) return
    this.setData({ showLetterViewer: false })
  },

  withdrawLetter() {
    const letter = this.data.selectedLetter
    if (!letter || !letter.isMine || this.data.letterWithdrawing) return
    wx.showModal({
      title: '撤回这封信？',
      content: '撤回后，家里的其他成员也将无法再看到这封信。',
      confirmText: '确认撤回',
      confirmColor: '#b65346',
      success: (result) => {
        if (result.confirm) this.submitWithdrawLetter(letter.id)
      }
    })
  },

  async submitWithdrawLetter(letterId) {
    this.setData({ letterWithdrawing: true })
    try {
      const result = await cloudService.call('withdrawLetter', { letterId })
      this.commitLetters(result.letters || [], {
        extraData: {
          showLetterViewer: false,
          selectedLetter: null
        }
      })
      wx.showToast({ title: '这封信已撤回', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '撤回失败', icon: 'none' })
    } finally {
      this.setData({ letterWithdrawing: false })
    }
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

  chooseMenuImage() {
    if (this.data.menuDraft.imageUploading) return
    let selectedImagePath = ''
    const choose = wx.chooseMedia
      ? new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (res) => resolve(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath),
          fail: reject
        })
      })
      : new Promise((resolve, reject) => {
        wx.chooseImage({
          count: 1,
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (res) => resolve(res.tempFilePaths && res.tempFilePaths[0]),
          fail: reject
        })
      })
    choose
      .then((tempFilePath) => {
        if (!tempFilePath) return null
        selectedImagePath = tempFilePath
        this.setData({
          'menuDraft.imagePreview': tempFilePath,
          'menuDraft.imageUploading': true
        })
        return this.uploadMenuImage(tempFilePath)
      })
      .then((fileID) => {
        if (!fileID) return
        if (!this.imageUrlCache) this.imageUrlCache = {}
        this.imageUrlCache[fileID] = { url: selectedImagePath, expireAt: Date.now() + IMAGE_URL_TTL_MS }
        this.setData({
          'menuDraft.image': fileID,
          'menuDraft.imageUploading': false
        })
        wx.showToast({ title: '图片已上传', icon: 'success' })
      })
      .catch((error) => {
        if (error && /cancel/i.test(error.errMsg || error.message || '')) {
          this.setData({ 'menuDraft.imageUploading': false })
          return
        }
        console.warn('上传菜品图片失败', error)
        this.setData({
          'menuDraft.image': '',
          'menuDraft.imagePreview': '',
          'menuDraft.imageUploading': false
        })
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      })
  },

  uploadMenuImage(tempFilePath) {
    if (!wx.cloud || !wx.cloud.uploadFile) return Promise.reject(new Error('当前微信版本不支持云上传'))
    cloudService.init()
    const extMatch = String(tempFilePath).match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg'
    const cloudPath = `${CUSTOM_MENU_IMAGE_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    return wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath }).then((res) => res.fileID)
  },

  saveMenuItem() {
    const draft = this.data.menuDraft
    if (draft.imageUploading) {
      wx.showToast({ title: '图片还在上传', icon: 'none' })
      return
    }
    const name = textSlice(draft.name, 18)
    if (!name) {
      wx.showToast({ title: '写下菜名吧', icon: 'none' })
      return
    }
    const editingId = this.data.editingMenuId
    // 重名校验：排除正在编辑的这道菜本身
    if (this.allMenuItems.some((item) => item.name === name && item.id !== editingId)) {
      wx.showToast({ title: '菜单里已经有这道啦', icon: 'none' })
      return
    }
    const category = MENU_CATEGORY_MAP[draft.category] ? draft.category : 'dish'
    const tags = parseMenuTags(draft.tags, category)

    if (editingId) {
      const menuItem = normalizeCustomMenuItem({
        id: editingId,
        name,
        description: textSlice(draft.description, 28) || `${tags[0]} · 小家新增`,
        highlight: tags[0],
        category,
        emoji: textSlice(draft.emoji, 2) || CATEGORY_EMOJI[category],
        image: draft.image,
        tags,
        recommended: draft.recommended
      })
      const customMenuItems = this.data.customMenuItems.map((item) => (item.id === editingId ? menuItem : item))
      this.commitCustomMenuItems(customMenuItems, {
        sync: true,
        extraData: { menuDraft: createMenuDraft(), editingMenuId: null }
      })
      wx.showToast({ title: '已更新', icon: 'success' })
      return
    }

    const menuItem = normalizeCustomMenuItem({
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      description: textSlice(draft.description, 28) || `${tags[0]} · 小家新增`,
      highlight: tags[0],
      category,
      emoji: textSlice(draft.emoji, 2) || CATEGORY_EMOJI[category],
      image: draft.image,
      tags,
      recommended: draft.recommended
    })
    this.commitCustomMenuItems([menuItem].concat(this.data.customMenuItems), {
      sync: true,
      extraData: { menuDraft: createMenuDraft() }
    })
    wx.showToast({ title: '已加入菜单', icon: 'success' })
  },

  cancelEditMenuItem() {
    this.setData({ editingMenuId: null, menuDraft: createMenuDraft() })
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
      content: cloudActive ? '两个人的购物车、订单、待办、农场和花店都会被清空。' : '购物车、订单、待办、农场和花店都会恢复到初始状态。',
      confirmText: '清空',
      confirmColor: '#e75c48',
      success: (result) => {
        if (!result.confirm) return
        const cart = {}
        const orders = []
        const customMenuItems = []
        const allMenuItems = applyImageCache(getAllMenuItems(customMenuItems), this.imageUrlCache || {})
        const cartView = getCartView(cart, allMenuItems)
        const todoView = getTodoView(DEFAULT_TODOS, this.data.todoFilter)
        const wishView = getWishView([])
        const farmView = getFarmView(createDefaultFarmState(), FARM_CROPS[0].id)
        const flowerView = getFlowerView(createDefaultFlowerState(), FLOWER_TYPES[0].id)
        this.allMenuItems = allMenuItems
        this.menuItemMap = getMenuItemMap(allMenuItems)
        storage.clear()
        this.setData({
          activeTab: 'home',
          customMenuItems,
          customMenuDisplayItems: customMenuItems,
          recommendedItems: applyImageCache(getRecommendedMenuItems(allMenuItems), this.imageUrlCache || {}),
          bannerItems: applyImageCache(getBannerItems(allMenuItems), this.imageUrlCache || {}),
          filteredItems: applyImageCache(getFilteredMenuItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword), this.imageUrlCache || {}),
          menuDisplayItems: getMenuDisplayItems(allMenuItems, this.data.currentCategory, this.data.searchKeyword),
          cart,
          cartItems: cartView.cartItems,
          cartCount: cartView.cartCount,
          orders,
          ordersView: getOrdersView(orders),
          recentOrders: [],
          todos: todoView.todos,
          visibleTodos: todoView.visibleTodos,
          homeTodos: todoView.homeTodos,
          todoStats: todoView.todoStats,
          wishes: wishView.wishes,
          wishStats: wishView.wishStats,
          farmState: farmView.farmState,
          farmPlots: farmView.farmPlots,
          farmInventoryList: farmView.farmInventoryList,
          selectedFarmCrop: farmView.selectedFarmCrop,
          farmStats: farmView.farmStats,
          flowerState: flowerView.flowerState,
          flowerPlots: flowerView.flowerPlots,
          flowerInventoryList: flowerView.flowerInventoryList,
          selectedFlowerType: flowerView.selectedFlowerType,
          flowerStats: flowerView.flowerStats,
          profileStats: getProfileStats(todoView.todos, orders)
        })
        this.resolveMenuImages()
        this.resetScroll()
        this.syncCloudResource('cart', cart)
        this.syncCloudResource('orders', orders)
        this.syncCloudResource('todos', todoView.todos)
        this.syncCloudResource('wishes', wishView.wishes)
        this.syncCloudResource('menus', customMenuItems)
        this.syncCloudResource('farm', farmView.farmState)
        this.syncCloudResource('flower', flowerView.flowerState)
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
