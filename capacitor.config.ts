import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'uz.posvk.posterminal',
  appName: 'POS Terminal v2',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config
