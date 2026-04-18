import { create } from 'zustand'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

interface UpdateState {
  update: Update | null
  checking: boolean
  downloading: boolean
  downloadProgress: number
  error: string | null
  checkForUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  update: null,
  checking: false,
  downloading: false,
  downloadProgress: 0,
  error: null,

  checkForUpdate: async () => {
    set({ checking: true, error: null })
    try {
      const update = await check()
      set({ update: update ?? null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Update check failed' })
    } finally {
      set({ checking: false })
    }
  },

  installUpdate: async () => {
    const { update } = get()
    if (!update) return

    set({ downloading: true, downloadProgress: 0, error: null })
    try {
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          set({ downloadProgress: total > 0 ? Math.round((downloaded / total) * 100) : 0 })
        }
      })
      await relaunch()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Update install failed', downloading: false })
    }
  },
}))
