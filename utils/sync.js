function timestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object' && Number.isFinite(Number(value.$date))) return Number(value.$date)
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function revisionKey(meta) {
  const versions = meta && meta.resourceVersions && typeof meta.resourceVersions === 'object'
    ? meta.resourceVersions
    : {}
  return `${timestamp(meta && meta.updatedAt)}:${Object.keys(versions).sort().map((key) => `${key}=${versions[key]}`).join(',')}`
}

function shouldPull(currentRevision, meta) {
  return !currentRevision || currentRevision !== revisionKey(meta)
}

module.exports = { timestamp, revisionKey, shouldPull }
