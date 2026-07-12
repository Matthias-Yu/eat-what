function getValid(value, expiryMarginMs, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  Object.keys(value).forEach((fileID) => {
    const entry = value[fileID]
    if (!entry || typeof entry.url !== 'string' || !/^(https?:\/\/|wxfile:\/\/)/.test(entry.url)) return
    if (Number(entry.expireAt) <= now + expiryMarginMs) return
    if (entry.url.indexOf('wxfile://') === 0) {
      try {
        wx.getFileSystemManager().accessSync(entry.url)
      } catch (error) {
        return
      }
    }
    result[fileID] = { url: entry.url, expireAt: Number(entry.expireAt) }
  })
  return result
}

function clearPersistentFiles(cache) {
  if (!cache || typeof cache !== 'object') return
  const fileSystem = wx.getFileSystemManager && wx.getFileSystemManager()
  if (!fileSystem || !fileSystem.unlinkSync) return
  Object.keys(cache).forEach((fileID) => {
    const entry = cache[fileID]
    if (!entry || typeof entry.url !== 'string' || entry.url.indexOf('wxfile://') !== 0) return
    try {
      fileSystem.unlinkSync(entry.url)
    } catch (error) {
      // 文件可能已由微信清理。
    }
  })
}

function initialize(storage, version, expiryMarginMs) {
  const storedVersion = storage.read('imageCacheVersion', '')
  const persistentCache = storage.read('persistentImageCache', {})
  if (storedVersion !== version) {
    clearPersistentFiles(persistentCache)
    storage.write('imageUrlCache', {})
    storage.write('persistentImageCache', {})
    storage.write('imageCacheVersion', version)
    return {}
  }
  return Object.assign(
    {},
    getValid(storage.read('imageUrlCache', {}), expiryMarginMs),
    getValid(persistentCache, expiryMarginMs)
  )
}

module.exports = { getValid, initialize, clearPersistentFiles }
