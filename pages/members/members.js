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
    timeText: formatVisitTime(item.enteredAtMs)
  }))
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

  async loadVisitRecords() {
    this.setData({ visitsLoading: true })
    try {
      const result = await cloudService.call('listVisitRecords')
      this.setData({ visitRecords: normalizeVisitRecords(result.records) })
    } catch (error) {
      wx.showToast({ title: error.message || '加载进入记录失败', icon: 'none' })
    } finally {
      this.setData({ visitsLoading: false })
    }
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
