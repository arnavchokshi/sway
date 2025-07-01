const express = require('express');
const Stripe = require('stripe');
const router = express.Router();

// Use your Stripe secret key here (never expose this to frontend)
const stripe = Stripe('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');

router.post('/create-payment-intent', async (req, res) => {
  const { amount, currency = 'usd' } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency,
      automatic_payment_methods: { enabled: true }
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 