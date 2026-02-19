# 🎭 ScènePro — Dossier projet complet

**Marketplace de mise en relation artistes × entreprises pour salons professionnels**

> Stack : Next.js 14 · TypeScript · Supabase · Stripe Connect · Tailwind CSS

---

## 📦 Contenu de ce dossier

```
scenepro-final/
│
├── frontend/                    ← 7 pages HTML standalone (ouvrez dans un navigateur)
│   ├── 01-homepage.html         Homepage publique + hero animé
│   ├── 02-auth.html             Inscription / Connexion (split-screen, 6 vues)
│   ├── 03-search.html           Recherche d'artistes (filtres live, grille/liste)
│   ├── 04-artist-profile.html   Fiche artiste publique + booking modal
│   ├── 05-artist-dashboard.html Dashboard artiste (bookings, parrainage, calendrier)
│   ├── 06-company-dashboard.html Dashboard entreprise (stats, recherche rapide)
│   └── 07-admin.html            Back-office admin (10 sections navigables)
│
├── backend/                     ← Code de production prêt à brancher
│   ├── supabase/
│   │   └── schema.sql           Schéma complet (tables, triggers, RLS, indexes)
│   ├── lib/
│   │   ├── supabase.ts          Clients + requêtes typées
│   │   └── commission.ts        Calcul des commissions (15% split + 2% parrainage)
│   ├── app/api/
│   │   └── routes.ts            Toutes les routes API Next.js 14
│   ├── hooks/
│   │   └── index.ts             Hooks React (auth, dashboard, messages temps réel…)
│   ├── types/
│   │   └── index.ts             Types TypeScript alignés sur la DB
│   └── README.md                Guide d'intégration Supabase pas-à-pas
│
└── README.md                    ← Ce fichier
```

---

## 💼 Modèle économique

| Flux | Détail |
|------|--------|
| **Commission** | 15% par transaction — 7,5% payé par l'entreprise, 7,5% déduit de l'artiste |
| **Parrainage** | 2% de chaque booking du filleul reversé au parrain pendant 12 mois |
| **Exemple 1 000 €** | Entreprise paie 1 075 € · Artiste reçoit 925 € · Plateforme : 150 € brut / 130 € net |
| **Paiement** | Stripe Connect — transfert automatique vers l'artiste à la confirmation |

---

## 🖥 Pages frontend

Chaque fichier HTML est **entièrement autonome** — ouvrez-le directement dans un navigateur, aucun serveur requis. Toutes les interactions sont fonctionnelles en JavaScript pur.

### 01 · Homepage
- Hero animé avec spots lumineux dynamiques
- Carrousel de catégories artistes
- Section "Comment ça marche" (3 étapes)
- Double CTA artiste / entreprise
- Bandeau commission transparent (7,5% + 7,5%)

### 02 · Authentification
- Layout split-screen asymétrique
- Carrousel de témoignages côté gauche (auto-défilement)
- **6 vues navigables** : Connexion → Inscription étape 1 (rôle) → étape 2 (compte) → étape 3 (profil) → Mot de passe oublié → Succès
- Jauge de force du mot de passe temps réel
- Champ code parrainage avec validation (artiste uniquement)
- Formulaires adaptés selon rôle choisi (artiste vs entreprise)

### 03 · Recherche d'artistes
- Filtres sidebar : catégorie, budget (slider), ville, disponibilité, langue
- Recherche full-text en temps réel
- Chips de filtres actifs avec bouton suppression
- Vue grille / liste switchable
- Tri (recommandés, prix, bookings)
- 12 artistes de démo avec données réalistes
- Système de favoris (♥) persistant en session

### 04 · Fiche profil artiste (publique)
- Hero pleine hauteur avec avatar flottant animé
- Colonne gauche : bio + citation, galerie 5 cases asymétrique, vidéo showreel, 4 spécialités, infos pratiques, 6 références clients
- Colonne droite sticky : tarif, disponibilité (point vert clignotant), sélecteurs date/durée/budget, commission transparente, badges sécurité
- Modal de booking avec formulaire complet + toast de confirmation

### 05 · Dashboard artiste
- Sidebar : profil avec badge "validé", navigation complète
- 4 stats animées : revenus mois, bookings, en attente, gains parrainage
- Panel bookings avec onglets (En attente / Acceptés / Terminés)
- Panel parrainage : code unique copiable, liste filleuls avec gains individuels
- Calendrier interactif : navigation mois, jours cliquables pour indisponibilités
- Messages récents avec indicateur non-lu

### 06 · Dashboard entreprise
- Identité distincte (accent bleu ardoise vs or artiste)
- Bannière accueil + CTA "500+ artistes disponibles"
- 4 stats : dépenses, artistes bookés, événements, en attente
- Panel bookings avec badges statut colorés
- Recherche rapide intégrée avec suggestions et filtres
- Prochain événement avec **compte à rebours en temps réel** (secondes)
- Messages récents avec distinction support / artistes

### 07 · Back-office admin
- **10 sections navigables** sans rechargement :
  - Tableau de bord : alertes, 5 KPIs, graphique revenus, répartition catégories, validations rapides, flux d'activité live (mise à jour automatique)
  - Artistes : tableau filtrable, onglets statut, valider/refuser/suspendre avec toast
  - Entreprises : liste complète avec total dépensé
  - Bookings : suivi complet, surbrillance litiges
  - Transactions : commissions par mois, récap parrainage (marge nette ~13%)
  - Litiges : contexte des deux parties, 4 boutons d'action
  - Parrainage : leaderboard top parrains
  - Blog : gestion articles publié/brouillon
  - Catégories : toggles on/off
  - Paramètres : taux commission, parrainage, durée, options plateforme

---

## 🔌 Backend — Démarrage rapide

### 1. Créer le projet Supabase

```bash
# 1. supabase.com → New Project
# 2. SQL Editor → coller backend/supabase/schema.sql → Run
```

### 2. Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Installer et lancer

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs stripe
npm run dev

# Stripe webhooks en local
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Voir **`backend/README.md`** pour le guide complet avec exemples de code.

---

## 🗄 Schéma base de données

**12 tables** avec triggers et RLS complets :

| Table | Rôle |
|-------|------|
| `profiles` | Étend `auth.users` de Supabase, stocke le rôle |
| `artists` | Profil artiste complet, Stripe Connect, statut |
| `companies` | Profil entreprise, statistiques |
| `bookings` | Transactions avec toutes les commissions calculées |
| `messages` | Messagerie intégrée par booking |
| `referrals` | Programme de parrainage (parrain → filleul) |
| `disputes` | Litiges avec historique de résolution |
| `artist_media` | Galerie photos/vidéos |
| `artist_availabilities` | Calendrier de disponibilités |
| `reviews` | Avis (V2 — schema prêt) |
| `favorites` | Favoris entreprises |
| `blog_posts` | Articles conseils |

**Triggers automatiques :**
- Profil créé à chaque inscription
- Code parrainage unique généré à la validation artiste
- Référence booking auto (`BK-2026-XXXX`)
- Stats artiste mises à jour après booking terminé
- Note moyenne recalculée après chaque avis
- `updated_at` automatique sur toutes les tables

---

## 🔒 Sécurité (Row Level Security)

Chaque table a des politiques strictes :
- Un artiste ne voit que ses propres bookings et messages
- Une entreprise ne voit que ses propres données
- Les profils artistes approuvés sont publics
- L'admin a accès total via `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)

---

## 🚀 Feuille de route V2

- [ ] Système d'avis et notation (schema DB déjà prêt)
- [ ] Emails transactionnels (Resend)
- [ ] Contrats PDF automatiques
- [ ] App mobile (React Native + Expo)
- [ ] Multi-langue (i18n)
- [ ] Notifications push

---

*ScènePro MVP — Généré le 19 février 2026*
*Toutes les pages sont fonctionnelles et prêtes à brancher sur le back-end.*
