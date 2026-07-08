const CLOUD_ENV_ID = 'cloudbase-4gz52ssycf6b2383'
const cloudService = require('./utils/cloud')

App({
  onLaunch() {
    if (!wx.cloud) return
    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    })
  },
  onShow(options) {
    this.recordVisit(options)
  },
  recordVisit(options = {}) {
    if (!wx.cloud || this.globalData.visitRecording) return
    this.globalData.visitRecording = true
    cloudService.call('recordVisit', {
      scene: options.scene || '',
      path: options.path || ''
    })
      .catch((error) => console.warn('记录进入小程序失败', error))
      .finally(() => {
        this.globalData.visitRecording = false
      })
  },
  globalData: {
    cloudEnvId: CLOUD_ENV_ID,
    visitRecording: false
  }
})
