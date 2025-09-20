import Stripe from 'stripe'
import { readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { amount_cents, intentId } = await readBody(event)
  const cfg = useRuntimeConfig(event)
  const stripe = new Stripe(cfg.stripeSecretKey)

  if (!Number.isInteger(amount_cents) || amount_cents < 100) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount (min $1.00)' })
  }

  if (intentId) {
    const pi = await stripe.paymentIntents.update(intentId, {
      amount: amount_cents,
      currency: 'usd'
    })
    return { clientSecret: pi.client_secret, intentId: pi.id }
  } else {
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      // lets Stripe pick supported methods (cards, wallets, etc.)
      automatic_payment_methods: { enabled: true }
    })
    return { clientSecret: pi.client_secret, intentId: pi.id }
  }
})
