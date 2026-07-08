const CLOUD_ENV_ID = 'cloudbase-4gz52ssycf6b2383'

App({
  onLaunch() {
    if (!wx.cloud) return
    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    })
  },
  globalData: {
    cloudEnvId: CLOUD_ENV_ID
  }
})
