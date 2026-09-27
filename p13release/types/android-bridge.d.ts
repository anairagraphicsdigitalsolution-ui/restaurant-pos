export {};
declare global {
  interface Window {
    Android?: {
      speak?: (text: string, language: string, rate: number, volume: number, repeat: number) => void
      notify?: (title: string, message: string, actionUrl?: string) => void
      notifyTone?: () => void
    }
    Capacitor?: {
      Plugins?: {
        AnairaLocalDb?: {
          open?: (options?: any) => Promise<any>
          put?: (options: any) => Promise<any>
          get?: (options: any) => Promise<any>
          list?: (options: any) => Promise<any>
          remove?: (options: any) => Promise<any>
          setSyncSession?: (options: { restaurantId: string; token: string; apiBase?: string }) => Promise<any>
          clearSyncSession?: () => Promise<any>
          syncNow?: () => Promise<any>
        }
      }
    }
  }
}
