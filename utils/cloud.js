const ENV_ID = 'cloudbase-4gz52ssycf6b2383'

let initialized = false

function init() {
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发')
  if (!initialized) {
    wx.cloud.init({ env: ENV_ID, traceUser: true })
    initialized = true
  }
}

async function call(action, payload = {}) {
  init()
  const response = await wx.cloud.callFunction({
    name: 'familyApi',
    data: Object.assign({ action }, payload)
  })
  const result = response.result || {}
  if (!result.ok) throw new Error(result.message || '云端请求失败')
  return result.data
}

module.exports = { ENV_ID, init, call }
