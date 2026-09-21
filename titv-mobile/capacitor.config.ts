import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tw.org.titv.engineering.scheduler',
  appName: 'TITV 工程部製播排班系統',
  webDir: 'www',
  bundledWebRuntime: false,
  backgroundColor: '#F4F1EA',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'titv-engineering-scheduler.netlify.app',
      '*.supabase.co'
    ]
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1100,
      launchAutoHide: true,
      backgroundColor: '#F4F1EA',
      showSpinner: false
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#F4F1EA',
      style: 'DARK'
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};

export default config;
