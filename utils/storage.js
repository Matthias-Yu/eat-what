const KEYS = {
  cart: 'home_menu_cart_v1',
  todos: 'home_menu_todos_v1',
  orders: 'home_menu_orders_v1',
  customMenuItems: 'home_menu_custom_items_v1',
  wishes: 'home_menu_wishes_v1',
  orderPushEnabled: 'home_menu_order_push_enabled_v1',
  orderNotices: 'home_menu_order_notices_v1',
  anniversary: 'home_menu_anniversary_v1',
  anniversaryLastOpen: 'home_menu_anniversary_last_open_v1',
  messages: 'home_menu_messages_v1',
  letters: 'home_menu_letters_v1',
  farm: 'home_menu_farm_v1',
  flower: 'home_menu_flower_v1',
  imageUrlCache: 'home_menu_image_url_cache_v1',
  persistentImageCache: 'home_menu_persistent_image_cache_v1',
  imageCacheVersion: 'home_menu_image_cache_version_v1',
  pendingCloudSyncs: 'home_menu_pending_cloud_syncs_v1',
  pendingCloudHouseholdId: 'home_menu_pending_cloud_household_id_v1'
}

function read(key, fallback) {
  if (!Object.prototype.hasOwnProperty.call(KEYS, key)) {
    console.warn(`未知存储键 ${key}`)
    return fallback
  }
  try {
    const value = wx.getStorageSync(KEYS[key])
    return value === '' || value === undefined ? fallback : value
  } catch (error) {
    console.warn(`读取 ${key} 失败`, error)
    return fallback
  }
}

function write(key, value) {
  if (!Object.prototype.hasOwnProperty.call(KEYS, key)) {
    console.warn(`未知存储键 ${key}`)
    return false
  }
  try {
    wx.setStorageSync(KEYS[key], value)
    return true
  } catch (error) {
    console.warn(`保存 ${key} 失败`, error)
    return false
  }
}

function clear() {
  Object.keys(KEYS).forEach((key) => wx.removeStorageSync(KEYS[key]))
}

module.exports = { KEYS, read, write, clear }
