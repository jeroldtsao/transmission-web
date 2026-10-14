import { ref } from 'vue'

export interface PendingTorrentFile {
  id: string
  name: string
  metainfo: string
}

const pendingFiles = ref<File[]>([])
const showAddDialog = ref(false)
const isDragging = ref(false)

export function useFileDrop() {
  function openWithFiles(files: File[]) {
    const torrentFiles = files.filter((f) => f.name.toLowerCase().endsWith('.torrent'))
    if (torrentFiles.length === 0) {
      return 0
    }
    pendingFiles.value = torrentFiles
    showAddDialog.value = true
    return torrentFiles.length
  }

  function consumePendingFiles(): File[] {
    const files = pendingFiles.value
    pendingFiles.value = []
    return files
  }

  return {
    pendingFiles,
    showAddDialog,
    isDragging,
    openWithFiles,
    consumePendingFiles
  }
}
