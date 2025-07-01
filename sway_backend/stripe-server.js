const express = require('express');
const cors = require('cors');
const stripe = require('stripe')('sk_test_51RfsH6PHljgFLzSLTOS5OvmezgD3apLn186eVa5z7kTbB8S5EVU8FC2W0Xx2p7QH5psNz07WRR3f69ZJqOdEguDB00nDufMGH4'); // Your secret key

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