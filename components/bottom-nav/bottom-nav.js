// 线性矢量图标（内联 SVG），支持选中(橙)/未选中(灰)两种描边颜色
const ICON_PATHS = {
  home: '<path d="M6 23V13c0-.5.2-1 .6-1.3L14 6l7.4 5.7c.4.3.6.8.6 1.3v10" /><path d="M11 23v-6h6v6" />',
  menu: '<path d="M9.5 4v6.5a2.2 2.2 0 0 1-4.4 0V4" /><path d="M7.3 4v19" /><path d="M20 4c-1.7 0-2.8 1.8-2.8 4.5S18.3 12 20 12s2.8-.8 2.8-3.5S21.7 4 20 4Z" /><path d="M20 12v11" />',
  wishlist: '<path d="M14 22C7.5 17.5 5 14.3 5 10.8 5 7.6 7.4 6 9.8 6c1.7 0 3.3.9 4.2 2.3C14.9 6.9 16.5 6 18.2 6 20.6 6 23 7.6 23 10.8c0 3.5-2.5 6.7-9 11.2Z" />',
  todo: '<rect x="4" y="4" width="20" height="20" rx="3.6" /><path d="M9 14l3.2 3.2L19 10" />',
  profile: '<circle cx="14" cy="10" r="4.2" /><path d="M5.5 23a8.5 8.5 0 0 1 17 0" />'
}

function buildIcon(id, color) {
  const inner = ICON_PATHS[id] || ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  // 用 encodeURIComponent 避免 base64 在部分基础库下的兼容问题
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const NAV_DEFS = [
  { id: 'home', label: '首页' },
  { id: 'menu', label: '点餐' },
  { id: 'wishlist', label: '心愿' },
  { id: 'todo', label: '待办' },
  { id: 'profile', label: '我的' }
]

const INACTIVE_COLOR = '#b2a49d'
const ACTIVE_COLOR = '#f06449'

Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    },
    badge: {
      type: Number,
      value: 0
    },
    wishBadge: {
      type: Number,
      value: 0
    }
  },
  data: {
    items: NAV_DEFS.map((item) => Object.assign({}, item, {
      icon: buildIcon(item.id, INACTIVE_COLOR),
      iconActive: buildIcon(item.id, ACTIVE_COLOR)
    }))
  },
  methods: {
    select(event) {
      this.triggerEvent('change', { id: event.currentTarget.dataset.id })
    }
  }
})
