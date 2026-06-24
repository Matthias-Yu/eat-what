Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    },
    badge: {
      type: Number,
      value: 0
    }
  },
  data: {
    items: [
      { id: 'home', label: '首页', icon: '⌂' },
      { id: 'menu', label: '点餐', icon: '♨' },
      { id: 'todo', label: '待办', icon: '✓' },
      { id: 'profile', label: '我的', icon: '♡' }
    ]
  },
  methods: {
    select(event) {
      this.triggerEvent('change', { id: event.currentTarget.dataset.id })
    }
  }
})
