// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/scripts'
  ],
  vite: {
    plugins: [tailwindcss()]
  },
  css: ['@/assets/css/tailwind.css', '@/assets/css/theme.css'],
  runtimeConfig: {
    stripeSecretKey: import.meta.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: import.meta.env.STRIPE_WEBHOOK_SECRET,
    public: {
      stripePublishableKey: import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY,
      baseURL: import.meta.env.BASE_URL || 'http://localhost:3000'
    }
  }
})