function createGardenModels(config) {
  const {
    farmPlotCount: FARM_PLOT_COUNT, farmCrops: FARM_CROPS, farmCropMap: FARM_CROP_MAP, farmImages: FARM_IMAGES,
    flowerPlotCount: FLOWER_PLOT_COUNT, flowerTypes: FLOWER_TYPES, flowerTypeMap: FLOWER_TYPE_MAP, flowerImages: FLOWER_IMAGES,
    textSlice, todayDateString
  } = config
  function createFarmPlots() {
    return Array.from({ length: FARM_PLOT_COUNT }).map((_, index) => ({
      id: index + 1,
      cropId: '',
      plantedAt: 0,
      wateredAt: 0
    }))
  }
  
  function createDefaultFarmState() {
    return {
      coins: 30,
      lastBonusDate: '',
      inventory: {},
      plots: createFarmPlots()
    }
  }
  
  function createFlowerPlots() {
    return Array.from({ length: FLOWER_PLOT_COUNT }).map((_, index) => ({
      id: index + 1,
      flowerId: '',
      plantedAt: 0,
      caredAt: 0
    }))
  }
  
  function createDefaultFlowerState() {
    return {
      nectar: 36,
      lastBonusDate: '',
      inventory: {},
      plots: createFlowerPlots()
    }
  }
  
  function normalizeFarmState(value) {
    const fallback = createDefaultFarmState()
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const inventory = {}
    if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
      Object.keys(source.inventory).forEach((id) => {
        if (FARM_CROP_MAP[id]) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
      })
    }
    const rawPlots = Array.isArray(source.plots) ? source.plots : []
    const plots = fallback.plots.map((plot, index) => {
      const raw = rawPlots[index] || {}
      const cropId = FARM_CROP_MAP[raw.cropId] ? raw.cropId : ''
      return {
        id: plot.id,
        cropId,
        plantedAt: cropId ? Number(raw.plantedAt) || Date.now() : 0,
        wateredAt: cropId ? Number(raw.wateredAt) || 0 : 0
      }
    })
    return {
      coins: Object.prototype.hasOwnProperty.call(source, 'coins') ? Math.max(0, Number(source.coins) || 0) : fallback.coins,
      lastBonusDate: textSlice(source.lastBonusDate, 10),
      inventory,
      plots
    }
  }
  
  function formatFarmRemaining(ms) {
    const days = Math.max(1, Math.ceil(ms / 86400000))
    return `${days} 天`
  }
  
  function getFarmGrowMs(crop) {
    if (crop.growDays) return crop.growDays * 86400000
    return Math.max(1, Number(crop.growMinutes) || 1) * 60000
  }
  
  function getFarmGrowthStage(progress, ready) {
    if (ready) return 'ready'
    if (progress >= 62) return 'growing'
    if (progress >= 28) return 'seedling'
    return 'sprout'
  }
  
  function getFarmPlotView(plot, now) {
    const crop = FARM_CROP_MAP[plot.cropId]
    if (!crop) {
      return Object.assign({}, plot, {
        empty: true,
        ready: false,
        progress: 0,
        stageText: '空地',
        actionText: '播种',
        cropName: '',
        cropEmoji: '＋',
        tone: 'mint'
      })
    }
    const growMs = getFarmGrowMs(crop)
    const wateredBoost = plot.wateredAt ? 0.18 : 0
    const elapsed = Math.max(0, now - Number(plot.plantedAt || now))
    const boostedElapsed = elapsed * (1 + wateredBoost)
    const progress = Math.min(100, Math.floor(boostedElapsed / growMs * 100))
    const ready = progress >= 100
    const growthStage = getFarmGrowthStage(progress, ready)
    return Object.assign({}, plot, {
      empty: false,
      ready,
      progress,
      growthStage,
      cropName: crop.name,
      cropEmoji: crop.emoji,
      tone: crop.tone,
      stageText: ready ? '可以收获' : `${formatFarmRemaining(growMs - boostedElapsed)}后成熟`,
      actionText: ready ? '收获' : (plot.wateredAt ? '已浇水' : '浇水')
    })
  }
  
  function getFarmView(farmState, selectedCropId) {
    const state = normalizeFarmState(farmState)
    const now = Date.now()
    const plots = state.plots.map((plot) => getFarmPlotView(plot, now))
    const inventoryList = FARM_CROPS
      .map((crop) => Object.assign({}, crop, { count: Number(state.inventory[crop.id]) || 0 }))
      .filter((item) => item.count > 0)
    const selectedCrop = FARM_CROP_MAP[selectedCropId] || FARM_CROPS[0]
    return {
      farmState: state,
      farmPlots: plots,
      farmInventoryList: inventoryList,
      selectedFarmCrop: selectedCrop.id,
      farmStats: {
        coins: state.coins,
        planted: plots.filter((item) => !item.empty).length,
        ready: plots.filter((item) => item.ready).length,
        harvests: inventoryList.reduce((sum, item) => sum + item.count, 0),
        dailyAvailable: state.lastBonusDate !== todayDateString()
      }
    }
  }
  
  function normalizeFlowerState(value) {
    const fallback = createDefaultFlowerState()
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const inventory = {}
    if (source.inventory && typeof source.inventory === 'object' && !Array.isArray(source.inventory)) {
      Object.keys(source.inventory).forEach((id) => {
        if (FLOWER_TYPE_MAP[id]) inventory[id] = Math.max(0, Number(source.inventory[id]) || 0)
      })
    }
    const rawPlots = Array.isArray(source.plots) ? source.plots : []
    const plots = fallback.plots.map((plot, index) => {
      const raw = rawPlots[index] || {}
      const flowerId = FLOWER_TYPE_MAP[raw.flowerId] ? raw.flowerId : ''
      return {
        id: plot.id,
        flowerId,
        plantedAt: flowerId ? Number(raw.plantedAt) || Date.now() : 0,
        caredAt: flowerId ? Number(raw.caredAt) || 0 : 0
      }
    })
    return {
      nectar: Object.prototype.hasOwnProperty.call(source, 'nectar') ? Math.max(0, Number(source.nectar) || 0) : fallback.nectar,
      lastBonusDate: textSlice(source.lastBonusDate, 10),
      inventory,
      plots
    }
  }
  
  function getFlowerStage(progress, ready) {
    if (ready) return 'ready'
    if (progress >= 64) return 'blooming'
    if (progress >= 32) return 'bud'
    return 'sprout'
  }
  
  function getFlowerPlotView(plot, now) {
    const flower = FLOWER_TYPE_MAP[plot.flowerId]
    if (!flower) {
      return Object.assign({}, plot, {
        empty: true,
        ready: false,
        progress: 0,
        stage: 'empty',
        flowerName: '',
        flowerImage: '',
        actionText: '种花'
      })
    }
    const growMs = flower.growDays * 86400000
    const careBoost = plot.caredAt ? 0.16 : 0
    const elapsed = Math.max(0, now - Number(plot.plantedAt || now))
    const boostedElapsed = elapsed * (1 + careBoost)
    const progress = Math.min(100, Math.floor(boostedElapsed / growMs * 100))
    const ready = progress >= 100
    return Object.assign({}, plot, {
      empty: false,
      ready,
      progress,
      stage: getFlowerStage(progress, ready),
      flowerName: flower.name,
      flowerImage: flower.image,
      tone: flower.tone,
      actionText: ready ? '收花' : (plot.caredAt ? '已照料' : '照料')
    })
  }
  
  function getFlowerView(flowerState, selectedFlowerId) {
    const state = normalizeFlowerState(flowerState)
    const now = Date.now()
    const plots = state.plots.map((plot) => getFlowerPlotView(plot, now))
    const inventoryList = FLOWER_TYPES
      .map((flower) => Object.assign({}, flower, { count: Number(state.inventory[flower.id]) || 0 }))
      .filter((item) => item.count > 0)
    const selectedFlower = FLOWER_TYPE_MAP[selectedFlowerId] || FLOWER_TYPES[0]
    return {
      flowerState: state,
      flowerPlots: plots,
      flowerInventoryList: inventoryList,
      selectedFlowerType: selectedFlower.id,
      flowerStats: {
        nectar: state.nectar,
        planted: plots.filter((item) => !item.empty).length,
        ready: plots.filter((item) => item.ready).length,
        materials: inventoryList.reduce((sum, item) => sum + item.count, 0),
        dailyAvailable: state.lastBonusDate !== todayDateString()
      }
    }
  }

  return { createFarmPlots, createDefaultFarmState, createFlowerPlots, createDefaultFlowerState, normalizeFarmState, formatFarmRemaining, getFarmGrowMs, getFarmGrowthStage, getFarmPlotView, getFarmView, normalizeFlowerState, getFlowerStage, getFlowerPlotView, getFlowerView }
}

module.exports = { createGardenModels }
