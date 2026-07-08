const cloudService = require('../../utils/cloud')

function textSlice(value, length) {
  return Array.from(String(value || '').trim()).slice(0, length).join('')
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatVisitTime(value) {
  const timestamp = Number(value)
  if (!timestamp) return '时间未知'
  const date = new Date(timestamp)
  const today = new Date()
  const isToday = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (isToday) return `今天 ${time}`
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

function formatVisitFullTime(value) {
  const timestamp = Number(value)
  if (!timestamp) return '时间未知'
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function normalizeVisitRecords(records) {
  return (Array.isArray(records) ? records : []).map((item) => ({
    id: item.id,
    openid: item.openid,
    nickname: item.nickname || '小家成员',
    roleLabel: item.roleLabel || '成员',
    isAdmin: !!item.isAdmin,
    isSelf: !!item.isSelf,
    scene: item.scene || '',
    path: item.path || '',
    timeText: formatVisitTime(item.enteredAtMs),
    fullTimeText: formatVisitFullTime(item.enteredAtMs)
  }))
}

function getVisitPager(page, pageSize, total) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1)
  const currentPage = Math.min(page, totalPages)
  return {
    visitPage: currentPage,
    visitTotal: total,
    visitTotalPages: totalPages,
    visitHasPrev: currentPage > 1,
    visitHasNext: currentPage < totalPages
  }
}

Page({
  data: {
    members: [],
    visitRecords: [],
    isAdmin: false,
    inviteCode: '',
    familyName: '',
    loading: true,
    visitsLoading: false,
    visitPage: 1,
    visitPageSize: 5,
    visitTotal: 0,
    visitTotalPages: 1,
    visitHasPrev: false,
    visitHasNext: false,
    busy: false,
    editingOpenid: '',
    nicknameDraft: ''
  },

  onLoad() {
    this.loadMembers()
  },

  async loadMembers() {
    this.setData({ loading: true })
    try {
      cloudService.init()
      const [members, session] = await Promise.all([
        cloudService.call('listMembers'),
        cloudService.call('getSession')
      ])
      const household = session.active ? session.household : null
      this.setData({
        members: members.members || [],
        isAdmin: !!members.isAdmin,
        inviteCode: household && household.isAdmin ? household.inviteCode || '' : '',
        familyName: household ? household.name : '',
        visitRecords: members.isAdmin ? this.data.visitRecords : []
      })
      if (members.isAdmin) this.loadVisitRecords()
    } catch (error) {
      wx.showToast({ title: error.message || '加载成员失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadVisitRecords(options = {}) {
    const page = Math.max(Number(options.page) || 1, 1)
    const pageSize = this.data.visitPageSize
    this.setData({ visitsLoading: true })
    try {
      const result = await cloudService.call('listVisitRecords', { page, pageSize })
      const total = Number(result.total) || 0
      const resultPage = Math.max(Number(result.page) || page, 1)
      this.setData(Object.assign({
        visitRecords: normalizeVisitRecords(result.records)
      }, getVisitPager(resultPage, pageSize, total)))
    } catch (error) {
      wx.showToast({ title: error.message || '加载进入记录失败', icon: 'none' })
    } finally {
      this.setData({ visitsLoading: false })
    }
  },

  refreshVisitRecords() {
    this.loadVisitRecords({ page: 1 })
  },

  clearVisitRecords() {
    if (!this.data.isAdmin || this.data.busy || this.data.visitsLoading) return
    if (!this.data.visitTotal) {
      wx.showToast({ title: '暂无记录可清空', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清空进入记录',
      content: '确定清空全部进入记录吗？此操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#e75c48',
      success: async (modal) => {
        if (!modal.confirm) return
        this.setData({ busy: true })
        try {
          await cloudService.call('clearVisitRecords')
          this.setData(Object.assign({
            visitRecords: []
          }, getVisitPager(1, this.data.visitPageSize, 0)))
          wx.showToast({ title: '已清空', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '清空失败', icon: 'none' })
        } finally {
          this.setData({ busy: false })
        }
      }
    })
  },

  prevVisitPage() {
    if (!this.data.visitHasPrev || this.data.visitsLoading) return
    this.loadVisitRecords({ page: this.data.visitPage - 1 })
  },

  nextVisitPage() {
    if (!this.data.visitHasNext || this.data.visitsLoading) return
    this.loadVisitRecords({ page: this.data.visitPage + 1 })
  },

  showVisitDetail(event) {
    const record = this.data.visitRecords.find((item) => item.id === event.currentTarget.dataset.id)
    if (!record) return
    const detail = [
      `成员：${record.nickname}${record.isSelf ? '（我）' : ''}`,
      `身份：${record.roleLabel}`,
      `时间：${record.fullTimeText}`,
      `入口场景：${record.scene || '未记录'}`,
      `页面路径：${record.path || '未记录'}`,
      `OpenID：${record.openid || '未记录'}`
    ].join('\n')
    wx.showModal({
      title: '详细操作记录',
      content: detail,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  copyInviteCode() {
    if (!this.data.inviteCode) return
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  startEditNickname(event) {
    const { openid, nickname } = event.currentTarget.dataset
    this.setData({ editingOpenid: openid, nicknameDraft: nickname || '' })
  },

  onNicknameInput(event) {
    this.setData({ nicknameDraft: textSlice(event.detail.value, 12) })
  },

  cancelEditNickname() {
    this.setData({ editingOpenid: '', nicknameDraft: '' })
  },

  async saveNickname(event) {
    const targetOpenid = event.currentTarget.dataset.openid || this.data.editingOpenid
    const nickname = textSlice(this.data.nicknameDraft, 12)
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    try {
      const result = await cloudService.call('setMemberNickname', { targetOpenid, nickname })
      this.setData({ members: result.members || [], editingOpenid: '', nicknameDraft: '' })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },

  removeMember(event) {
    const { openid, nickname } = event.currentTarget.dataset
    wx.showModal({
      title: '移除成员',
      content: `确定把“${nickname || '该成员'}”移出云空间吗？`,
      confirmText: '移除',
      confirmColor: '#e75c48',
      success: async (modal) => {
        if (!modal.confirm) return
        this.setData({ busy: true })
        try {
          const result = await cloudService.call('removeMember', { targetOpenid: openid })
          this.setData({ members: result.members || [] })
          wx.showToast({ title: '已移除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '移除失败', icon: 'none' })
        } finally {
          this.setData({ busy: false })
        }
      }
    })
  }
})
