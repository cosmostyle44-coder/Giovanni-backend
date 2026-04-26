const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { Resend } = require('resend');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const PRICE_CENTS = 2700;
const EBOOK_URL = process.env.EBOOK_URL;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FRONTEND = process.env.FRONTEND_URL || '*';

app.use(cors({ origin: FRONTEND }));
app.use(express.json());
app.use('/webhook', express.raw({ type: 'application/json' }));

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Email et nom requis.' });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICE_CENTS,
      currency: 'eur',
      metadata: { customer_email: email, customer_name: name },
      description: 'Ebook — Perdre du Poids Comme un Pro',
      receipt_email: email,
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'Erreur paiement.' });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const email = pi.metadata.customer_email || pi.receipt_email;
    const name = pi.metadata.customer_name || 'toi';
    if (email) await sendEbook(email, name);
  }
  res.json({ received: true });
});

async function sendEbook(email, name) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '🥊 Ton ebook "Perdre du poids comme un pro" est là !',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#111;color:#f5f5f5;padding:40px 32px;border-radius:8px">
          <h1 style="color:#00d4ff;letter-spacing:2px">PAIEMENT CONFIRMÉ ✅</h1>
          <p style="color:#888">Merci pour ton achat, ${name} !</p>
          <p style="line-height:1.8;color:rgba(245,245,245,0.85)">
            Ton ebook <strong>"Perdre du Poids Comme un Pro"</strong> est prêt.
          </p>
          <div style="text-align:center;margin:36px 0">
            <a href="${EBOOK_URL}" style="background:#00d4ff;color:#0a0a0a;font-weight:700;padding:18px 44px;border-radius:4px;text-decoration:none;text-transform:uppercase">
              📥 Télécharger mon ebook
            </a>
          </div>
          <p style="font-size:.85rem;color:#888">
            Des questions ? DM sur Instagram : <a href="https://instagram.com/cosmostyle44" style="color:#00d4ff">@cosmostyle44</a>
          </p>
        </div>
      `,
    });
    console.log('Ebook envoyé à ' + email);
  } catch (err) {
    console.error('Erreur email:', err.message);
  }
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Serveur lancé sur le port ' + PORT));
