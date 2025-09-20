<script setup lang="ts">
import type { FetchError } from 'ofetch'
import {
    loadStripe,
    type Stripe,
    type StripeElements,
    type StripeCardNumberElement,
    type StripeCardExpiryElement,
    type StripeCardCvcElement,
    type PaymentRequest,
    type StripePaymentRequestButtonElement,
    type PaymentRequestPaymentMethodEvent
} from '@stripe/stripe-js'

interface Creator {
    id: number
    name: string
    description: string
}

const creators = ref<Creator[]>([])
const selectedCreator = ref<string | null>(null)

const tipAmount = ref<number>(0)
const tipAmountCents = computed(() => Math.round((tipAmount.value || 0) * 100))

// Stripe state
let stripe: Stripe | null = null
let elements: StripeElements | null = null
let cardNumber: StripeCardNumberElement | null = null
let cardExpiry: StripeCardExpiryElement | null = null
let cardCvc: StripeCardCvcElement | null = null

// Payment Request Button (Apple Pay / Google Pay)
let paymentRequest: PaymentRequest | null = null
let prbElement: StripePaymentRequestButtonElement | null = null

const cardNumberElementRef = ref<HTMLDivElement | null>(null)
const cardExpiryElementRef = ref<HTMLDivElement | null>(null)
const cardCvcElementRef = ref<HTMLDivElement | null>(null)
const prbRef = ref<HTMLDivElement | null>(null)

const clientSecret = ref<string | null>(null)
const intentId = ref<string | null>(null)

const errors = ref<string | null>(null)
const isModalOpen = ref(false)

onMounted(async () => {
    try {
        const data = await $fetch<Creator[]>('/api/creators')
        creators.value = data
    } catch {
        // ignore for demo
    }
})

function openModal(creator: Creator) {
    selectedCreator.value = creator.name
    isModalOpen.value = true
    nextTick().then(async () => {
        await ensureStripeMounted()
        await ensurePI()
        await setupPRB()
    })
}

function closeModal() {
    isModalOpen.value = false
    try { cardNumber?.unmount(); cardExpiry?.unmount(); cardCvc?.unmount() } catch { /* intentionally ignored */ }
    try { prbElement?.unmount() } catch { /* intentionally ignored */ }
    stripe = null
    elements = null
    cardNumber = cardExpiry = cardCvc = null
    paymentRequest = null
    prbElement = null
    clientSecret.value = null
    intentId.value = null
    errors.value = null
    tipAmount.value = 0
}

async function ensureStripeMounted() {
    if (!isModalOpen.value) return
    await nextTick()
    if (!cardNumberElementRef.value || !cardExpiryElementRef.value || !cardCvcElementRef.value) return

    const { public: pub } = useRuntimeConfig()
    if (!pub.stripePublishableKey) {
        errors.value = 'Missing publishable key'
        return
    }

    if (!stripe) stripe = await loadStripe(pub.stripePublishableKey)
    if (!stripe) { errors.value = 'Stripe failed to load'; return }

    if (!elements) elements = stripe.elements()

    const style = {
        base: {
            fontSize: '16px',
            color: '#0f172a',
            '::placeholder': { color: '#94a3b8' },
            iconColor: '#34d399'
        },
        invalid: { color: '#ef4444', iconColor: '#ef4444' },
        complete: { color: '#059669' }
    }

    if (!cardNumber) {
        cardNumber = elements.create('cardNumber', { style }) as StripeCardNumberElement
        cardNumberElementRef.value.innerHTML = ''
        cardNumber.mount(cardNumberElementRef.value)
    }
    if (!cardExpiry) {
        cardExpiry = elements.create('cardExpiry', { style }) as StripeCardExpiryElement
        cardExpiryElementRef.value.innerHTML = ''
        cardExpiry.mount(cardExpiryElementRef.value)
    }
    if (!cardCvc) {
        cardCvc = elements.create('cardCvc', { style }) as StripeCardCvcElement
        cardCvcElementRef.value.innerHTML = ''
        cardCvc.mount(cardCvcElementRef.value)
    }
}

async function ensurePI() {
    const cents = tipAmountCents.value
    if (!cents || cents < 100) { clientSecret.value = null; return }
    try {
        const res = await $fetch<{ clientSecret: string; intentId: string }>('/api/payments/intent', {
            method: 'POST',
            body: { amount_cents: cents, intentId: intentId.value ?? null }
        })
        clientSecret.value = res.clientSecret
        intentId.value = res.intentId
    } catch (err) {
        const e = err as FetchError
        errors.value = e?.data?.statusMessage || 'Failed to prepare payment'
    }
}

let t: number | null = null
watch(tipAmount, () => {
    if (t) clearTimeout(t)
    t = setTimeout(ensurePI, 350)
})

async function setupPRB() {
    if (!stripe || !elements || !prbRef.value) return

    paymentRequest = stripe.paymentRequest({
        country: 'US',
        currency: 'usd',
        total: { label: 'Tip', amount: tipAmountCents.value || 0 },
        requestPayerName: false,
        requestPayerEmail: false
    })

    const result = await paymentRequest.canMakePayment()
    if (!result) return

    prbElement = elements.create('paymentRequestButton', {
        paymentRequest,
        style: { paymentRequestButton: { theme: 'dark', height: '44px' } }
    }) as StripePaymentRequestButtonElement
    prbRef.value.innerHTML = ''
    prbElement.mount(prbRef.value)

    watch(tipAmountCents, (cents) => {
        paymentRequest?.update({ total: { label: 'Tip', amount: cents || 0 } })
    })

    paymentRequest.on('paymentmethod', async (ev: PaymentRequestPaymentMethodEvent) => {
        try {
            await ensurePI()
            if (!clientSecret.value) throw new Error('No client secret')
            const { error } = await stripe!.confirmCardPayment(clientSecret.value, {
                payment_method: ev.paymentMethod.id
            }, { handleActions: true })
            if (error) {
                ev.complete('fail')
                errors.value = error.message || 'Wallet payment failed'
            } else {
                ev.complete('success')
                closeModal()
            }
        } catch (e) {
            const err = e as FetchError
            ev.complete('fail')
            errors.value = err?.message || 'Wallet payment failed'
        }
    })
}

async function sendTip() {
    errors.value = null
    if (!stripe || !elements || !cardNumber) {
        errors.value = 'Payment form is not ready.'
        return
    }
    await ensurePI()
    if (!clientSecret.value) {
        errors.value = 'Enter a valid amount (min $1).'
        return
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret.value, {
        payment_method: { card: cardNumber }
    })

    if (error) {
        errors.value = error.message || 'Payment failed'
        return
    }
    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        closeModal()
    }
}
</script>

<template>
    <div class="p-8 bg-accent min-h-screen">
        <h1 class="mb-4 text-2xl font-semibold">Creators</h1>

        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="c in creators" :key="c.id" class="rounded-xl border border-white/10 bg-surface/50 p-4">
                <div class="text-xl font-medium">{{ c.name }}</div>
                <p class="text-sm text-slate-400">{{ c.description }}</p>
                <button 
                    class="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
                    @click="openModal(c)">Tip</button>
            </li>
        </ul>

        <!-- Teleport target (or use to='body') -->
        <Teleport to="body">
            <div v-show="isModalOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/60">
                <div class="w-[92vw] max-w-md rounded-2xl bg-white p-5 shadow-xl">
                    <h2 class="mb-1 text-2xl font-semibold">Tip {{ selectedCreator || '' }}</h2>

                    <!-- Amount -->
                    <label class="mt-2 block text-sm font-medium text-slate-700">Amount</label>
                    <div
                        class="mb-3 flex items-center gap-2 rounded-xl border border-sky-300 px-3 py-2 focus-within:ring focus-within:ring-emerald-200">
                        <span class="text-slate-400">$</span>
                        <input 
                            v-model.number="tipAmount" inputmode="decimal" placeholder="0.00"
                            class="w-full bg-transparent outline-none">
                    </div>

                    <!-- NEW: Payment Request Button mount (shows automatically if supported) -->
                    <div ref="prbRef" class="mb-3" />

                    <!-- Stacked Elements fallback -->
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm mb-1 text-slate-700">Card number</label>
                            <div 
                                ref="cardNumberElementRef" class="w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm
                   focus-within:border-emerald-400 focus-within:ring focus-within:ring-emerald-200" />
                        </div>
                        <div>
                            <label class="block text-sm mb-1 text-slate-700">Expiry</label>
                            <div 
                                ref="cardExpiryElementRef" class="w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm
                   focus-within:border-emerald-400 focus-within:ring focus-within:ring-emerald-200" />
                        </div>
                        <div>
                            <label class="block text-sm mb-1 text-slate-700">CVC</label>
                            <div 
                                ref="cardCvcElementRef" class="w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm
                   focus-within:border-emerald-400 focus-within:ring focus-within:ring-emerald-200" />
                        </div>
                    </div>

                    <p v-if="errors" class="mt-2 text-sm text-red-600">{{ errors }}</p>

                    <div class="mt-4 flex justify-end gap-2">
                        <button 
                            class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                            :disabled="!clientSecret" @click="sendTip">
                            Send Tip
                        </button>
                        <button class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700" @click="closeModal">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
