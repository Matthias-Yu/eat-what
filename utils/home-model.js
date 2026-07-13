function createHomeModels({
  storage,
  homeImages: HOME_IMAGES,
  reactionEmojis: MESSAGE_REACTION_EMOJIS,
  messagesLimit: MESSAGES_LIMIT,
  lettersLimit: LETTERS_LIMIT,
  letterTextLimit: LETTER_TEXT_LIMIT = 4000
}) {
  function textSlice(value, length) {
    return Array.from(String(value || '').trim()).slice(0, length).join('')
  }
  
  function todayDateString() {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
  }
  
  function getHomeTimeSlot(date = new Date()) {
    const hour = date.getHours()
    if (hour >= 5 && hour < 11) return 'morning'
    if (hour >= 11 && hour < 14) return 'noon'
    if (hour >= 14 && hour < 18) return 'afternoon'
    return 'night'
  }
  
  function getHomeImages(date = new Date()) {
    const timeSlot = getHomeTimeSlot(date)
    return Object.assign({}, HOME_IMAGES, {
      pageBg: HOME_IMAGES[timeSlot] || HOME_IMAGES.morning,
      timeSlot
    })
  }
  
  function getAnniversaryDays(date) {
    if (!date) return 0
    const parts = String(date).split('-').map(Number)
    if (parts.length !== 3 || parts.some((part) => !part && part !== 0)) return 0
    const start = new Date(parts[0], parts[1] - 1, parts[2])
    if (isNaN(start.getTime())) return 0
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
    return diff >= 0 ? diff + 1 : 0
  }
  
  function getAnniversaryDisplayStart(anniversary, currentDays) {
    if (!anniversary || !currentDays) return currentDays
    const lastOpen = storage.read('anniversaryLastOpen', null)
    if (!lastOpen || lastOpen.date !== anniversary.date) return currentDays
    const lastDays = Number(lastOpen.days) || 0
    if (lastDays <= 0 || lastDays === currentDays) return currentDays
    return lastDays
  }
  
  function normalizeAnniversary(value) {
    if (!value || typeof value !== 'object') return null
    const date = textSlice(value.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return {
      title: textSlice(value.title, 12) || '在一起',
      date
    }
  }
  
  function formatRelativeTime(ts) {
    const time = Number(ts)
    if (!time) return ''
    const diff = Date.now() - time
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`
    const date = new Date(time)
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  
  function normalizeMessageReactions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const result = {}
    MESSAGE_REACTION_EMOJIS.forEach((emoji) => {
      const users = value[emoji]
      if (Array.isArray(users) && users.length) {
        result[emoji] = users.filter(Boolean)
      }
    })
    return result
  }
  
  function normalizeMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .map((item) => ({
        id: item && item.id ? item.id : Date.now(),
        text: textSlice(item && item.text, 80),
        authorOpenid: (item && item.authorOpenid) || '',
        authorName: textSlice(item && item.authorName, 12) || '小家成员',
        createdAt: Number(item && item.createdAt) || Date.now(),
        reactions: normalizeMessageReactions(item && item.reactions)
      }))
      .filter((item) => item.text)
      .slice(0, MESSAGES_LIMIT)
  }
  
  function buildReactionList(reactions, myOpenid) {
    const source = reactions || {}
    return MESSAGE_REACTION_EMOJIS.map((emoji) => {
      const users = Array.isArray(source[emoji]) ? source[emoji] : []
      return {
        emoji,
        count: users.length,
        mine: !!myOpenid && users.indexOf(myOpenid) !== -1
      }
    })
  }
  
  function getMessagesView(messages, myOpenid) {
    const normalized = normalizeMessages(messages)
    const messagesDisplay = normalized.map((item) => Object.assign({}, item, {
      timeText: formatRelativeTime(item.createdAt),
      reactionList: buildReactionList(item.reactions, myOpenid),
      isMine: !!myOpenid && item.authorOpenid === myOpenid
    }))
    return {
      messages: normalized,
      messagesDisplay,
      recentMessages: messagesDisplay.slice(0, 2)
    }
  }
  
  function normalizeLetters(letters) {
    return (Array.isArray(letters) ? letters : [])
      .map((item, index) => ({
        id: textSlice(item && item.id, 48) || `letter-${Date.now()}-${index}`,
        text: textSlice(item && item.text, LETTER_TEXT_LIMIT),
        authorOpenid: textSlice(item && item.authorOpenid, 60),
        authorName: textSlice(item && item.authorName, 12) || '小家成员',
        createdAt: Number(item && item.createdAt) || Date.now(),
        openedBy: Array.isArray(item && item.openedBy) ? item.openedBy.filter(Boolean) : []
      }))
      .filter((item) => item.text)
      .slice(0, LETTERS_LIMIT)
  }
  
  function getLettersView(letters, myOpenid) {
    const normalized = normalizeLetters(letters)
    const lettersDisplay = normalized.map((item) => {
      const date = new Date(item.createdAt)
      return Object.assign({}, item, {
        isMine: !!myOpenid && item.authorOpenid === myOpenid,
        isUnread: !!myOpenid && item.openedBy.indexOf(myOpenid) === -1,
        dateText: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
      })
    })
    return {
      letters: normalized,
      lettersDisplay,
      latestLetter: lettersDisplay[0] || null,
      hasUnreadLetter: lettersDisplay.some((item) => item.isUnread)
    }
  }

  return { textSlice, todayDateString, getHomeTimeSlot, getHomeImages, getAnniversaryDays, getAnniversaryDisplayStart, normalizeAnniversary, formatRelativeTime, normalizeMessageReactions, normalizeMessages, buildReactionList, getMessagesView, normalizeLetters, getLettersView }
}

module.exports = { createHomeModels }
