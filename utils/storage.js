const KEYS = {
  cart: 'home_menu_cart_v1',
  todos: 'home_menu_todos_v1',
  orders: 'home_menu_orders_v1',
  customMenuItems: 'home_menu_custom_items_v1'
}

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(KEYS[key])
    return value === '' || value === undefined ? fallback : value
  } catch (error) {
    console.warn(`读取 ${key} 失败`, error)
    return fallback
  }
}

function write(key, value) {
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

module.exports = { read, write, clear }
