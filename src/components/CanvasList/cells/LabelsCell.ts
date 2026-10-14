import type { Torrent } from '@/api/rpc'
import type { ColumnConfig } from '@/composables/useColumns'
import { PADDING_X, TAG_HEIGHT, TAG_PADDING, TAG_MARGIN, TAG_LINE_HEIGHT } from '../store/utils'
import { drawText, roundRect } from './utils'
import { useSettingStore } from '@/store'
import { useTableStore } from '../store/tableStore'
import { getTagThemeColor } from '@/utils/tagColor'

// 全局标签测量宽度缓存：只在第一次遇到标签时 measureText，后续 O(1) 命中
const tagWidthCache = new Map<string, number>()

function getTagTextWidth(ctx: CanvasRenderingContext2D, label: string): number {
  let w = tagWidthCache.get(label)
  if (w === undefined) {
    w = ctx.measureText(label).width
    tagWidthCache.set(label, w)
  }
  return w
}

export default function renderLabelsCell(
  ctx: CanvasRenderingContext2D,
  row: Torrent,
  col: ColumnConfig,
  state: { x: number; y: number; rowHeight: number }
) {
  ctx.save()

  if (!row.labels || row.labels.length === 0) {
    ctx.restore()
    return
  }
  const settingStore = useSettingStore()
  const tableStore = useTableStore()
  const singleLine = settingStore.setting.singleLine
  const isDark = settingStore.setting.theme === 'dark'
  const cellX = state.x + PADDING_X
  const cellWidth = col.width - PADDING_X * 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  if (singleLine) {
    const tagY = state.y + (state.rowHeight - TAG_HEIGHT) / 2
    let currentX = 0
    for (const label of row.labels) {
      const textWidth = getTagTextWidth(ctx, label)
      const tagWidth = textWidth + TAG_PADDING * 2
      if (currentX + tagWidth > cellWidth && currentX > 0) {
        break
      }
      const tagX = cellX + currentX
      const color = getTagThemeColor(label, isDark)
      // 单次填充路径：省去二次 stroke 描边，减半矢量指令
      ctx.fillStyle = color.bgColor
      roundRect(ctx, tagX, tagY, tagWidth, TAG_HEIGHT, TAG_HEIGHT / 2)
      ctx.fill()
      ctx.fillStyle = color.textColor
      ctx.fillText(label, tagX + TAG_PADDING, tagY + TAG_HEIGHT / 2)
      currentX += tagWidth + TAG_MARGIN
    }
    ctx.restore()
    return
  }
  const cellY = state.y + PADDING_X / 2
  let currentX = 0
  let currentY = 0
  for (const label of row.labels) {
    const textWidth = getTagTextWidth(ctx, label)
    const tagWidth = textWidth + TAG_PADDING * 2

    if (currentX + tagWidth > cellWidth && currentX > 0) {
      currentX = 0
      currentY += TAG_LINE_HEIGHT
    }

    if (currentY + TAG_HEIGHT > state.rowHeight - PADDING_X) {
      break
    }

    const tagX = cellX + currentX
    const tagY = cellY + currentY
    const color = getTagThemeColor(label, isDark)

    ctx.fillStyle = color.bgColor
    roundRect(ctx, tagX, tagY, tagWidth, TAG_HEIGHT, TAG_HEIGHT / 2)
    ctx.fill()

    ctx.fillStyle = color.textColor
    ctx.fillText(label, tagX + TAG_PADDING, tagY + TAG_HEIGHT / 2)

    currentX += tagWidth + TAG_MARGIN
  }

  ctx.restore()
}
