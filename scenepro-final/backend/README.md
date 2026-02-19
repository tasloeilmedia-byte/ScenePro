# ScènePro — Guide d'intégration Supabase

## 🗂 Fichiers livrés dans ce dossier

```
scenepro-backend/
├── supabase/
│   └── schema.sql          ← Schéma complet : tables, triggers, RLS, indexes
├── types/
│   └── index.ts            ← Types TypeScript alignés sur la DB
├── lib/
│   ├── supabase.ts         ← Clients + requêtes typées (artists, bookings, messages…)
│   └── commission.ts       ← Calcul des commissions (15% split, parrainage 2%)
├── app/api/
│   └── routes.ts           ← Toutes les routes API Next.js 14 (App Router)
├── hooks/
│   └── index.ts            ← Hooks React (useArtists, useMessages, useAuth…)
└── README.md               ← Ce fichier
```

---

## ⚡ Démarrage en 5 étapes

### 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → New Project
2. Note ton **Project URL** et tes **API Keys**
3. Dans l'éditeur SQL → colle et exécute `supabase/schema.sql`

### 2. Configurer `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   # JAMAIS exposé côté client !

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Installer les dépendances

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs stripe
```

### 4. Organiser les fichiers dans ton projet Next.js

Copie les fichiers dans la structure suivante :

```
src/
├── lib/
│   ├── supabase.ts       ← depuis scenepro-backend/lib/supabase.ts
│   └── commission.ts     ← depuis scenepro-backend/lib/commission.ts
├── types/
│   └── index.ts          ← depuis scenepro-backend/types/index.ts
├── hooks/
│   └── index.ts          ← depuis scenepro-backend/hooks/index.ts
└── app/
    └── api/
        ├── artists/
        │   └── route.ts              ← GET_ARTISTS
        ├── artists/[id]/
        │   └── route.ts              ← GET_ARTIST
        ├── artists/stripe-onboarding/
        │   └── route.ts              ← POST_STRIPE_ONBOARDING
        ├── bookings/
        │   └── route.ts              ← POST_BOOKING
        ├── bookings/[id]/accept/
        │   └── route.ts              ← POST_ACCEPT
        ├── bookings/[id]/refuse/
        │   └── route.ts              ← POST_REFUSE
        ├── payments/intent/
        │   └── route.ts              ← POST_PAYMENT_INTENT
        ├── payments/webhook/
        │   └── route.ts              ← POST_WEBHOOK
        ├── referrals/validate/
        │   └── route.ts              ← POST_VALIDATE_REFERRAL
        ├── messages/
        │   └── route.ts              ← GET_MESSAGES + POST_MESSAGE
        └── admin/artists/[id]/approve/
            └── route.ts              ← POST_APPROVE_ARTIST
```

### 5. Configurer Stripe Connect

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Écouter les webhooks en local
stripe listen --forward-to localhost:3000/api/payments/webhook

# Copier le webhook secret dans .env.local
```

---

## 🔌 Utilisation des hooks dans tes pages

### Page de recherche (`/search`)

```tsx
import { useArtists } from '@/hooks'

export default function SearchPage() {
  const [filters, setFilters] = useState({ category: 'all', maxPrice: 2000 })
  const { artists, total, loading } = useArtists(filters)

  return (
    <div>
      {loading ? <Skeleton /> : artists.map(a => <ArtistCard key={a.id} artist={a} />)}
    </div>
  )
}
```

### Dashboard artiste (`/artist/dashboard`)

```tsx
import { useArtistDashboard, useBookingActions } from '@/hooks'

export default function ArtistDashboard() {
  const { data, loading }          = useArtistDashboard()
  const { accept, refuse, loading: actionLoading } = useBookingActions()

  if (loading) return <Spinner />

  return (
    <div>
      <StatsGrid stats={data.stats} />
      {data.bookings.map(b => (
        <BookingRow
          key={b.id}
          booking={b}
          onAccept={() => accept(b.id)}
          onRefuse={(reason) => refuse(b.id, reason)}
        />
      ))}
    </div>
  )
}
```

### Messagerie temps réel (`/booking/[id]/messages`)

```tsx
import { useMessages } from '@/hooks'

export default function MessagesPage({ bookingId }: { bookingId: string }) {
  const { messages, sendMessage } = useMessages(bookingId)
  const [input, setInput] = useState('')

  return (
    <div>
      {messages.map(m => <MessageBubble key={m.id} message={m} />)}
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={() => { sendMessage(input); setInput('') }}>Envoyer</button>
    </div>
  )
}
```

### Paiement Stripe (`/booking/[id]/pay`)

```tsx
import { useBookingActions } from '@/hooks'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!)

export default function PaymentPage({ bookingId }: { bookingId: string }) {
  const { createPaymentIntent } = useBookingActions()
  const [clientSecret, setClientSecret] = useState('')

  useEffect(() => {
    createPaymentIntent(bookingId).then(({ clientSecret }) => setClientSecret(clientSecret))
  }, [bookingId])

  return clientSecret ? (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm />
    </Elements>
  ) : <Spinner />
}
```

---

## 🔒 Sécurité — Points importants

| Point | Détail |
|-------|--------|
| **RLS activé** | Chaque table a des politiques strictes — un artiste ne peut voir que ses bookings |
| **Service Role** | `supabaseAdmin` (service role) uniquement côté serveur dans les API routes |
| **Webhook Stripe** | La signature est vérifiée — jamais traiter sans validation |
| **SUPABASE_SERVICE_ROLE_KEY** | Variable côté serveur uniquement, jamais dans `NEXT_PUBLIC_` |
| **Admin role** | Vérifié via `current_user_role()` côté DB, pas seulement côté client |

---

## 📊 Flux de données complet — Booking

```
Entreprise remplit le formulaire
         ↓
POST /api/bookings
  → calculateCommission(prix, parrainage?)
  → INSERT bookings (status: pending)
         ↓
Artiste reçoit notification (Supabase Realtime)
         ↓
POST /api/bookings/:id/accept
  → UPDATE bookings (status: accepted)
         ↓
Entreprise paie
  → POST /api/payments/intent
  → stripe.paymentIntents.create (avec transfer vers artiste)
  → Stripe Elements côté client
         ↓
Stripe webhook payment_intent.succeeded
  → UPDATE bookings (status: paid)
  → Notification artiste + entreprise
         ↓
Événement terminé → mark completed
  → UPDATE bookings (status: completed)
  → Créditer le parrain (si parrainage actif)
  → UPDATE artists.total_bookings +1
```

---

## 🧪 Tester en local

```bash
# Lancer le projet
npm run dev

# Dans un autre terminal — écouter Stripe
stripe listen --forward-to localhost:3000/api/payments/webhook

# Tester un paiement avec la carte test Stripe
# Numéro : 4242 4242 4242 4242
# Date : n'importe quelle date future
# CVC : n'importe quoi
```

---

## 📬 Emails transactionnels (à brancher)

Recommandé : **[Resend](https://resend.com)** (gratuit jusqu'à 3 000 emails/mois)

```bash
npm install resend
```

Points d'envoi dans le code (marqués `TODO`) :
- Inscription artiste → email de bienvenue
- Validation artiste → email de confirmation
- Nouveau booking → email à l'artiste
- Booking accepté → email à l'entreprise
- Paiement confirmé → email aux deux parties
- Litige ouvert → email admin

---

*Généré pour ScènePro — MVP complet, prêt à brancher.*
