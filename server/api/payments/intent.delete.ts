import Stripe from 'stripe'
import { readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { intentId } = await readBody<{ intentId: string }>(event)
  if (!intentId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing intentId' })
  }

  const cfg = useRuntimeConfig(event)
  const stripe = new Stripe(cfg.stripeSecretKey)

  try {
    const canceled = await stripe.paymentIntents.cancel(intentId)
    return { success: true, status: canceled.status }
  } catch (err) {
    const e = err as Stripe.StripeRawError;
    throw createError({
      statusCode: 400,
      statusMessage: e?.message || 'Failed to cancel intent'
    })
  }
})