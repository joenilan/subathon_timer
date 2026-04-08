import { create } from 'zustand'
import { fetchLatestRelease, isNewerVersion, type UpdateInfo } from '../lib/update/checkForUpdate'
import appVersionText from '../../VERSION?raw'

const currentVersion = appVersionText.trim()

interface UpdateState {
  updateInfo: UpdateInfo | null
  checking: boolean
  fetchFailed: boolean
  checkForUpdate: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateInfo: null,
  checking: false,
  fetchFailed: false,

  checkForUpdate: async () => {
    set({ checking: true, fetchFailed: false })
    try {
      const info = await fetchLatestRelease()
      set({ updateInfo: isNewerVersion(currentVersion, info.version) ? info : null })
    } catch {
      set({ fetchFailed: true })
    } finally {
      set({ checking: false })
    }
  },
}))
