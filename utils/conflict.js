function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function mergeObject(base, local, remote) {
  const result = Object.assign({}, remote || {})
  const before = base || {}
  const desired = local || {}
  const keys = new Set(Object.keys(before).concat(Object.keys(desired)))
  keys.forEach((key) => {
    if (same(before[key], desired[key])) return
    if (Object.prototype.hasOwnProperty.call(desired, key)) result[key] = clone(desired[key])
    else delete result[key]
  })
  return result
}

function mergeArray(base, local, remote) {
  const before = new Map((Array.isArray(base) ? base : []).map((item) => [String(item && item.id), item]))
  const desired = new Map((Array.isArray(local) ? local : []).map((item) => [String(item && item.id), item]))
  const result = new Map((Array.isArray(remote) ? remote : []).map((item) => [String(item && item.id), clone(item)]))
  before.forEach((item, id) => {
    if (!desired.has(id)) result.delete(id)
  })
  desired.forEach((item, id) => {
    if (!before.has(id) || !same(before.get(id), item)) result.set(id, clone(item))
  })
  const localOrder = (Array.isArray(local) ? local : []).map((item) => String(item && item.id))
  return [...result.values()].sort((a, b) => {
    const ai = localOrder.indexOf(String(a && a.id))
    const bi = localOrder.indexOf(String(b && b.id))
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function merge(resource, base, local, remote) {
  if (Array.isArray(local)) return mergeArray(base, local, remote)
  if (resource === 'cart') return mergeObject(base, local, remote)
  return clone(local)
}

module.exports = { merge, mergeArray, mergeObject, clone }
