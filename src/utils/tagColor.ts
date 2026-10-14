/**
 * 标签颜色生成器
 * 针对亮色（light）和暗色（dark）两套主题分别调优 HSL 饱和度与亮度，
 * 确保两套主题下背景都有柔和通透感，文字与边框对比度清晰可辨，绝不发黑发灰。
 */

// 预设 12 个色调（Hue），跨越红橙黄绿青蓝紫粉，间距均衡
const HUES = [210, 142, 280, 25, 175, 330, 48, 255, 195, 10, 160, 295]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export interface TagThemeColor {
  /** 文字及边框主要颜色 */
  textColor: string
  /** 胶囊浅色填充背景 */
  bgColor: string
  /** 边框描边颜色 */
  borderColor: string
}

const colorCache = new Map<string, TagThemeColor>()

/**
 * 根据标签文本和当前主题生成适配的胶囊颜色组合
 * @param label 标签字符串
 * @param isDark 是否为暗色主题
 */
export function getTagThemeColor(label: string, isDark: boolean): TagThemeColor {
  const cacheKey = `${label}:${isDark ? 'dark' : 'light'}`
  const cached = colorCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const hue = HUES[hashString(label) % HUES.length]
  let result: TagThemeColor

  if (isDark) {
    // 暗色主题：文字更亮更鲜活，背景为深色半透明
    result = {
      textColor: `hsl(${hue}, 85%, 68%)`,
      borderColor: `hsl(${hue}, 70%, 55%)`,
      bgColor: `hsla(${hue}, 75%, 20%, 0.45)`
    }
  } else {
    // 亮色主题：文字沉稳清晰，背景为柔和浅色
    result = {
      textColor: `hsl(${hue}, 80%, 32%)`,
      borderColor: `hsl(${hue}, 65%, 48%)`,
      bgColor: `hsla(${hue}, 85%, 94%, 0.9)`
    }
  }

  colorCache.set(cacheKey, result)
  return result
}
