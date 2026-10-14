import { useTorrentStore } from '@/store'
import { useVirtualList } from './useVirtualList'

/**
 * 通用视口管理 Hook
 * 处理可视区域的行和列计算，渲染范围确定等通用逻辑
 */
export function useCommonViewport() {
  const torrentStore = useTorrentStore()
  const virtualList = useVirtualList()

  // 可视区域状态
  // 可见行
  const visibleStart = ref(0)
  const visibleEnd = ref(0)
  const visibleRowCount = ref(0)
  // 开始渲染的行（包括 buffer）
  const renderStartIdx = ref(0)
  const renderEndIdx = ref(0)
  const startY = ref(0)

  // 可见列相关（主要用于桌面端）
  const visibleStartCol = ref(0)
  const visibleEndCol = ref(0)

  // 计算开始渲染的x偏移（桌面端表格用）
  const startX = computed(() => {
    let x = 0
    for (let i = 0; i < visibleStartCol.value; i++) {
      x += torrentStore.visibleColumns[i].width
    }
    return x
  })

  // 更新行的可视区域
  function updateRowViewport(newTop: number, newHeight: number, heights: number[]) {
    const newVisibleStart = virtualList.findVisibleStart(newTop, heights)
    const newVisibleEnd = virtualList.findVisibleEnd(newTop, newHeight, heights)

    visibleStart.value = newVisibleStart
    visibleEnd.value = newVisibleEnd
    visibleRowCount.value = newVisibleEnd - newVisibleStart + 1

    renderStartIdx.value = Math.max(0, newVisibleStart - virtualList.bufferSize)
    renderEndIdx.value = Math.min(torrentStore.filterTorrents.length - 1, newVisibleEnd + virtualList.bufferSize)

    // 计算 startY 偏移
    const firstVisibleRowY = virtualList.getRowY(newVisibleStart, heights)
    startY.value = firstVisibleRowY - newTop
  }

  // 更新列的可视区域（主要用于桌面端）
  function updateColumnViewport(newLeft: number, newWidth: number) {
    const totalWidth = torrentStore.tableMinWidth
    if (newWidth >= totalWidth) {
      visibleStartCol.value = 0
      visibleEndCol.value = torrentStore.visibleColumns.length - 1
    } else {
      // 根据左侧滚动的 left 先计算出应该绘制哪一列
      let hiddenWidth = 0
      let start = 0
      for (let i = 0; i < torrentStore.visibleColumns.length; i++) {
        start = i
        hiddenWidth += torrentStore.visibleColumns[i].width || 0
        if (newLeft <= hiddenWidth) {
          break
        }
      }
      visibleStartCol.value = Math.max(0, start - virtualList.bufferColumnSize)
      // 第一个绘制的单元格绘制的部分
      const xx = hiddenWidth - newLeft
      let w = xx
      let end = torrentStore.visibleColumns.length - 1
      for (let i = start + 1; i < torrentStore.visibleColumns.length; i++) {
        w += torrentStore.visibleColumns[i].width || 0
        if (w >= newWidth) {
          end = Math.min(torrentStore.visibleColumns.length - 1, i + virtualList.bufferColumnSize)
          break
        }
      }
      visibleEndCol.value = end
    }
  }

  return {
    // 状态
    visibleStart: readonly(visibleStart),
    visibleEnd: readonly(visibleEnd),
    visibleRowCount: readonly(visibleRowCount),
    renderStartIdx: readonly(renderStartIdx),
    renderEndIdx: readonly(renderEndIdx),
    startY: readonly(startY),
    visibleStartCol: readonly(visibleStartCol),
    visibleEndCol: readonly(visibleEndCol),
    startX,

    // 方法
    updateRowViewport,
    updateColumnViewport
  }
}
