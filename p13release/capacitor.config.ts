import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.anairapos.app',
  appName: 'Anaira POS',
  webDir: 'public',


  server: {
    url: 'https://www.anairapos.in',
    cleartext: false,
    androidScheme: 'https'
  }
};

export default config;