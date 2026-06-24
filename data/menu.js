const categories = [
  { id: 'recommend', name: '今日推荐', icon: '✦' },
  { id: 'main', name: '主食', icon: '🍚' },
  { id: 'dish', name: '家常菜', icon: '🥢' },
  { id: 'light', name: '轻食', icon: '🥗' },
  { id: 'drink', name: '饮品', icon: '🥛' }
]

const menuItems = [
  {
    id: 'tomato-beef',
    name: '番茄浓汤肥牛',
    description: '酸甜浓郁，暖胃又下饭',
    highlight: '酸甜暖胃',
    category: 'dish',
    emoji: '🍲',
    tone: 'sunset',
    tags: ['招牌', '微辣'],
    recommended: true
  },
  {
    id: 'teriyaki-rice',
    name: '照烧鸡腿饭',
    description: '焦香鸡腿配溏心蛋',
    highlight: '焦香超下饭',
    category: 'main',
    emoji: '🍛',
    tone: 'honey',
    tags: ['人气', '饱腹'],
    recommended: true
  },
  {
    id: 'shrimp-egg',
    name: '虾仁滑蛋',
    description: '鲜嫩弹牙，口感软滑',
    highlight: '鲜嫩又轻盈',
    category: 'dish',
    emoji: '🍤',
    tone: 'lemon',
    tags: ['清淡', '高蛋白'],
    recommended: true
  },
  {
    id: 'salmon-salad',
    name: '牛油果三文鱼沙拉',
    description: '清爽低卡，能量刚刚好',
    highlight: '清爽低负担',
    category: 'light',
    emoji: '🥗',
    tone: 'mint',
    tags: ['低卡', '轻食'],
    recommended: true
  },
  {
    id: 'mushroom-pasta',
    name: '奶油蘑菇意面',
    description: '奶香柔和，蘑菇鲜美',
    highlight: '奶香很治愈',
    category: 'main',
    emoji: '🍝',
    tone: 'cream',
    tags: ['奶香', '不辣'],
    recommended: false
  },
  {
    id: 'broccoli-chicken',
    name: '西兰花嫩鸡胸',
    description: '简单调味，鲜嫩不柴',
    highlight: '清淡高蛋白',
    category: 'light',
    emoji: '🥦',
    tone: 'mint',
    tags: ['低脂', '高蛋白'],
    recommended: false
  },
  {
    id: 'mapo-tofu',
    name: '家常麻婆豆腐',
    description: '麻香入味，拌饭一绝',
    highlight: '麻香拌饭绝配',
    category: 'dish',
    emoji: '🌶️',
    tone: 'sunset',
    tags: ['下饭', '中辣'],
    recommended: false
  },
  {
    id: 'sweet-milk',
    name: '桂花酒酿奶',
    description: '桂花清香，甜度可选',
    highlight: '桂花香甜暖',
    category: 'drink',
    emoji: '🥛',
    tone: 'blush',
    tags: ['热饮', '少糖'],
    recommended: true
  },
  {
    id: 'lemon-tea',
    name: '手打柠檬茶',
    description: '清新酸甜，解腻好搭档',
    highlight: '清爽又解腻',
    category: 'drink',
    emoji: '🍋',
    tone: 'lemon',
    tags: ['冰饮', '清爽'],
    recommended: false
  }
]

module.exports = { categories, menuItems }
