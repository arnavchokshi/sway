const express = require('express');
const cors = require('cors');
const stripe = require('stripe')('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'); // Your secret key

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Pro Membership' },
            unit_amount: 499, // $4.99 in cents
          },
          quantity: 1,
        },
      ],
      success_url: 'http://localhost:4200/membership-plan?success=true',
      cancel_url: 'http://localhost:4200/membership-plan?canceled=true',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(4242, () => console.log('Stripe server running on port 4242')); 