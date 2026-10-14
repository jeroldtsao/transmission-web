<template>
  <div v-if="isDragging" class="file-drop-overlay">
    <div class="file-drop-card">
      <div class="file-drop-icon">
        <n-icon size="48" :component="ArrowDownCircleOutline" />
      </div>
      <div class="file-drop-title">{{ $t('addDialog.dropTorrentHint') }}</div>
      <div class="file-drop-subtitle">{{ $t('addDialog.dropTorrentSubHint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileDrop } from '@/composables/useFileDrop'
import { ArrowDownCircleOutline } from '@vicons/ionicons5'

const { t: $t } = useI18n()
const { isDragging, openWithFiles } = useFileDrop()

let dragCounter = 0

function isFileDrag(e: DragEvent): boolean {
  const dt = e.dataTransfer
  if (!dt) {
    return false
  }
  if (dt.files && dt.files.length > 0) {
    return true
  }
  const types = dt.types
  if (!types || types.length === 0) {
    return false
  }
  const typeList = Array.from(types)
  return typeList.includes('Files') || typeList.includes('application/x-moz-file') || typeList.includes('text/uri-list')
}

function handleDragEnter(e: DragEvent) {
  if (!isFileDrag(e)) {
    return
  }
  e.preventDefault()
  dragCounter += 1
  isDragging.value = true
}

function handleDragOver(e: DragEvent) {
  if (!isFileDrag(e)) {
    return
  }
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(e: DragEvent) {
  if (!isFileDrag(e)) {
    return
  }
  e.preventDefault()
  dragCounter = Math.max(0, dragCounter - 1)
  if (dragCounter === 0) {
    isDragging.value = false
  }
}

function handleDrop(e: DragEvent) {
  if (!isFileDrag(e)) {
    return
  }
  e.preventDefault()
  dragCounter = 0
  isDragging.value = false

  const fileList = e.dataTransfer?.files
  if (!fileList || fileList.length === 0) {
    return
  }

  const files = Array.from(fileList)
  openWithFiles(files)
}

onMounted(() => {
  window.addEventListener('dragenter', handleDragEnter)
  window.addEventListener('dragover', handleDragOver)
  window.addEventListener('dragleave', handleDragLeave)
  window.addEventListener('drop', handleDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', handleDragEnter)
  window.removeEventListener('dragover', handleDragOver)
  window.removeEventListener('dragleave', handleDragLeave)
  window.removeEventListener('drop', handleDrop)
})
</script>

<style scoped lang="less">
.file-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in srgb, var(--base-color, #000) 40%, transparent);
  backdrop-filter: blur(4px);
  pointer-events: none;
  animation: fadeIn 0.15s ease-out;
}

.file-drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 36px 48px;
  border-radius: 16px;
  border: 2px dashed var(--primary-color, #18a058);
  background-color: var(--card-color, rgba(255, 255, 255, 0.95));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  color: var(--text-color, #333);
  pointer-events: none;
  transform: scale(1.02);
  transition: transform 0.15s ease-out;
}

.file-drop-icon {
  color: var(--primary-color, #18a058);
  animation: bounce 1s infinite alternate;
}

.file-drop-title {
  font-size: 18px;
  font-weight: 600;
}

.file-drop-subtitle {
  font-size: 13px;
  opacity: 0.7;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes bounce {
  from {
    transform: translateY(-4px);
  }
  to {
    transform: translateY(4px);
  }
}
</style>
