function pad(value) {
  return String(value).padStart(2, '0')
}

function todayLabel() {
  const now = new Date()
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 6) return { text: '夜深了', icon: '🌙' }
  if (hour < 11) return { text: '早上好', icon: '☀️' }
  if (hour < 14) return { text: '中午好', icon: '🌤️' }
  if (hour < 18) return { text: '下午好', icon: '☕' }
  return { text: '晚上好', icon: '🌙' }
}

function orderTime(date = new Date()) {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = { todayLabel, greeting, orderTime }
