-- ============================================================
-- ScènePro — Schéma Supabase complet
-- À exécuter dans l'éditeur SQL de ton dashboard Supabase
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";   -- pour les jobs planifiés (expiration parrainage)

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role        AS ENUM ('artist', 'company', 'admin');
CREATE TYPE artist_status    AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE booking_status   AS ENUM ('pending', 'accepted', 'refused', 'paid', 'completed', 'disputed', 'cancelled');
CREATE TYPE dispute_status   AS ENUM ('open', 'resolved_artist', 'resolved_company', 'resolved_partial');
CREATE TYPE payment_status   AS ENUM ('pending', 'captured', 'refunded', 'partially_refunded');

-- ============================================================
-- TABLE : profiles (étend auth.users de Supabase)
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role        NOT NULL DEFAULT 'artist',
  email           TEXT             NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : artists
-- ============================================================
CREATE TABLE artists (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  stage_name          TEXT NOT NULL,
  category            TEXT NOT NULL,    -- comedian | magician | musician | dancer | speaker | visual | circus | humorist
  bio                 TEXT,
  city                TEXT NOT NULL,
  zone                TEXT DEFAULT 'France entière',
  languages           TEXT[]           DEFAULT '{"fr"}',
  tags                TEXT[]           DEFAULT '{}',
  price_min           INTEGER          NOT NULL DEFAULT 0,    -- en euros
  price_max           INTEGER          NOT NULL DEFAULT 0,
  stripe_account_id   TEXT,                                   -- Stripe Connect account
  stripe_onboarded    BOOLEAN          NOT NULL DEFAULT FALSE,
  status              artist_status    NOT NULL DEFAULT 'pending',
  total_bookings      INTEGER          NOT NULL DEFAULT 0,
  rating_average      NUMERIC(3,2),
  rating_count        INTEGER          NOT NULL DEFAULT 0,
  referral_code       TEXT             UNIQUE,
  is_available        BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : companies
-- ============================================================
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL,
  sector          TEXT,
  siret           TEXT,
  city            TEXT,
  contact_name    TEXT,
  website         TEXT,
  total_bookings  INTEGER     NOT NULL DEFAULT 0,
  total_spent     INTEGER     NOT NULL DEFAULT 0,   -- en centimes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : bookings
-- ============================================================
CREATE TABLE bookings (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference               TEXT UNIQUE NOT NULL,          -- ex: BK-2026-1042
  artist_id               UUID NOT NULL REFERENCES artists(id),
  company_id              UUID NOT NULL REFERENCES companies(id),

  -- Détails événement
  event_date              DATE NOT NULL,
  event_duration_hours    NUMERIC(4,1) NOT NULL,
  event_location          TEXT NOT NULL,
  event_description       TEXT,

  -- Prix & commission
  artist_price            INTEGER NOT NULL,              -- en centimes (prix de l'artiste)
  company_fee_cents       INTEGER NOT NULL,              -- 7,5% ajouté à l'entreprise
  artist_fee_cents        INTEGER NOT NULL,              -- 7,5% déduit de l'artiste
  total_company_pays      INTEGER NOT NULL,              -- ce que paie l'entreprise
  artist_receives         INTEGER NOT NULL,              -- ce que reçoit l'artiste
  platform_gross          INTEGER NOT NULL,              -- revenu brut plateforme
  referral_commission     INTEGER NOT NULL DEFAULT 0,    -- part parrain (centimes)
  platform_net            INTEGER NOT NULL,              -- revenu net plateforme

  -- Parrainage
  referral_id             UUID REFERENCES referrals(id),

  -- Paiement Stripe
  stripe_payment_intent   TEXT,
  payment_status          payment_status NOT NULL DEFAULT 'pending',

  -- Statut booking
  status                  booking_status NOT NULL DEFAULT 'pending',
  refused_reason          TEXT,
  cancelled_reason        TEXT,

  -- Dates
  accepted_at             TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : messages
-- ============================================================
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id),
  content     TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : referrals (programme de parrainage)
-- ============================================================
CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     UUID NOT NULL REFERENCES artists(id),    -- le parrain
  referred_id     UUID NOT NULL REFERENCES artists(id),    -- le filleul
  referral_code   TEXT NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ NOT NULL,                    -- date inscription + 12 mois
  total_earned    INTEGER     NOT NULL DEFAULT 0,          -- en centimes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(referrer_id, referred_id)
);

-- ============================================================
-- TABLE : disputes (litiges)
-- ============================================================
CREATE TABLE disputes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL UNIQUE REFERENCES bookings(id),
  opened_by       UUID NOT NULL REFERENCES profiles(id),
  reason          TEXT NOT NULL,
  artist_response TEXT,
  admin_notes     TEXT,
  status          dispute_status NOT NULL DEFAULT 'open',
  resolved_at     TIMESTAMPTZ,
  refund_percent  INTEGER,                                 -- 0-100 si remboursement partiel
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : artist_media (galerie photos/vidéos)
-- ============================================================
CREATE TABLE artist_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id   UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  url         TEXT NOT NULL,
  thumbnail   TEXT,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : artist_availabilities (disponibilités)
-- ============================================================
CREATE TABLE artist_availabilities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id   UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  is_blocked  BOOLEAN NOT NULL DEFAULT TRUE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(artist_id, date)
);

-- ============================================================
-- TABLE : reviews (avis — V2 mais schema prêt)
-- ============================================================
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL UNIQUE REFERENCES bookings(id),
  artist_id   UUID NOT NULL REFERENCES artists(id),
  company_id  UUID NOT NULL REFERENCES companies(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : blog_posts
-- ============================================================
CREATE TABLE blog_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  excerpt       TEXT,
  content       TEXT NOT NULL,
  cover_url     TEXT,
  published     BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  author_id     UUID REFERENCES profiles(id),
  views         INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : favorites
-- ============================================================
CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, artist_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_artists_status    ON artists(status);
CREATE INDEX idx_artists_category  ON artists(category);
CREATE INDEX idx_artists_city      ON artists(city);
CREATE INDEX idx_artists_available ON artists(is_available);
CREATE INDEX idx_bookings_artist   ON bookings(artist_id);
CREATE INDEX idx_bookings_company  ON bookings(company_id);
CREATE INDEX idx_bookings_status   ON bookings(status);
CREATE INDEX idx_messages_booking  ON messages(booking_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_active   ON referrals(is_active);

-- ============================================================
-- TRIGGERS : updated_at automatique
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated    BEFORE UPDATE ON profiles    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_artists_updated     BEFORE UPDATE ON artists     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated   BEFORE UPDATE ON companies   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated    BEFORE UPDATE ON bookings    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_disputes_updated    BEFORE UPDATE ON disputes    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_blog_updated        BEFORE UPDATE ON blog_posts  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER : profil automatique après inscription
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'artist')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER : code parrainage unique à la validation artiste
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.referral_code IS NULL THEN
    LOOP
      code := UPPER(SUBSTRING(MD5(NEW.id::TEXT || EXTRACT(EPOCH FROM NOW())::TEXT) FROM 1 FOR 4)) || '-' ||
              UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
      SELECT EXISTS(SELECT 1 FROM artists WHERE referral_code = code) INTO exists;
      EXIT WHEN NOT exists;
    END LOOP;
    NEW.referral_code := code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_referral_code
  BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

-- ============================================================
-- TRIGGER : référence booking auto
-- ============================================================
CREATE SEQUENCE booking_seq START 1000;

CREATE OR REPLACE FUNCTION set_booking_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'BK-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('booking_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_reference
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_booking_reference();

-- ============================================================
-- TRIGGER : mise à jour stats artiste après booking
-- ============================================================
CREATE OR REPLACE FUNCTION update_artist_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE artists SET
      total_bookings = total_bookings + 1,
      updated_at = NOW()
    WHERE id = NEW.artist_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artist_stats
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_artist_stats();

-- ============================================================
-- TRIGGER : mise à jour note moyenne après avis
-- ============================================================
CREATE OR REPLACE FUNCTION update_artist_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE artists SET
    rating_average = (SELECT AVG(rating) FROM reviews WHERE artist_id = NEW.artist_id),
    rating_count   = (SELECT COUNT(*)    FROM reviews WHERE artist_id = NEW.artist_id)
  WHERE id = NEW.artist_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artist_rating
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_artist_rating();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists               ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts            ENABLE ROW LEVEL SECURITY;

-- Helper : role de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── PROFILES ──
CREATE POLICY "Chaque utilisateur voit son profil"
  ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Chaque utilisateur modifie son profil"
  ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admin voit tous les profils"
  ON profiles FOR ALL USING (current_user_role() = 'admin');

-- ── ARTISTS ──
CREATE POLICY "Artistes approuvés visibles par tous"
  ON artists FOR SELECT USING (status = 'approved' OR profile_id = auth.uid() OR current_user_role() = 'admin');
CREATE POLICY "Artiste modifie son propre profil"
  ON artists FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Artiste crée son profil"
  ON artists FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admin gère tous les artistes"
  ON artists FOR ALL USING (current_user_role() = 'admin');

-- ── COMPANIES ──
CREATE POLICY "Company voit son propre profil"
  ON companies FOR SELECT USING (profile_id = auth.uid() OR current_user_role() = 'admin');
CREATE POLICY "Company modifie son profil"
  ON companies FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Company crée son profil"
  ON companies FOR INSERT WITH CHECK (profile_id = auth.uid());

-- ── BOOKINGS ──
CREATE POLICY "Artiste voit ses bookings"
  ON bookings FOR SELECT USING (
    artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
    OR company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid())
    OR current_user_role() = 'admin'
  );
CREATE POLICY "Company crée un booking"
  ON bookings FOR INSERT WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid())
  );
CREATE POLICY "Artiste accepte/refuse ses bookings"
  ON bookings FOR UPDATE USING (
    artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
    OR company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid())
    OR current_user_role() = 'admin'
  );

-- ── MESSAGES ──
CREATE POLICY "Parties du booking voient les messages"
  ON messages FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN artists a ON a.id = b.artist_id
      JOIN companies c ON c.id = b.company_id
      WHERE a.profile_id = auth.uid() OR c.profile_id = auth.uid()
    ) OR current_user_role() = 'admin'
  );
CREATE POLICY "Parties du booking envoient des messages"
  ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ── REFERRALS ──
CREATE POLICY "Artiste voit ses parrainages"
  ON referrals FOR SELECT USING (
    referrer_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
    OR referred_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
    OR current_user_role() = 'admin'
  );

-- ── FAVORITES ──
CREATE POLICY "Company gère ses favoris"
  ON favorites FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid())
  );

-- ── ARTIST MEDIA ──
CREATE POLICY "Media visible par tous (artistes approuvés)"
  ON artist_media FOR SELECT USING (
    artist_id IN (SELECT id FROM artists WHERE status = 'approved')
    OR artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
  );
CREATE POLICY "Artiste gère son media"
  ON artist_media FOR ALL USING (
    artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
  );

-- ── BLOG ──
CREATE POLICY "Articles publiés visibles par tous"
  ON blog_posts FOR SELECT USING (published = TRUE OR current_user_role() = 'admin');
CREATE POLICY "Admin gère le blog"
  ON blog_posts FOR ALL USING (current_user_role() = 'admin');

-- ── AVAILABILITIES ──
CREATE POLICY "Disponibilités visibles par tous"
  ON artist_availabilities FOR SELECT USING (TRUE);
CREATE POLICY "Artiste gère ses disponibilités"
  ON artist_availabilities FOR ALL USING (
    artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
  );

-- ── REVIEWS ──
CREATE POLICY "Avis publics visibles par tous"
  ON reviews FOR SELECT USING (is_public = TRUE);
CREATE POLICY "Company crée un avis après booking terminé"
  ON reviews FOR INSERT WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid())
    AND booking_id IN (SELECT id FROM bookings WHERE status = 'completed')
  );

-- ── DISPUTES ──
CREATE POLICY "Parties accèdent à leur litige"
  ON disputes FOR SELECT USING (
    opened_by = auth.uid() OR current_user_role() = 'admin'
    OR booking_id IN (
      SELECT b.id FROM bookings b
      JOIN artists a ON a.id = b.artist_id
      JOIN companies c ON c.id = b.company_id
      WHERE a.profile_id = auth.uid() OR c.profile_id = auth.uid()
    )
  );
CREATE POLICY "Admin gère tous les litiges"
  ON disputes FOR ALL USING (current_user_role() = 'admin');

-- ============================================================
-- STORAGE BUCKETS (à créer dans le dashboard Supabase)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('avatars', 'avatars', true),
--   ('artist-media', 'artist-media', true),
--   ('blog-covers', 'blog-covers', true);

-- ============================================================
-- JOB PLANIFIÉ : désactiver les parrainages expirés
-- (nécessite l'extension pg_cron activée dans Supabase)
-- ============================================================
-- SELECT cron.schedule(
--   'expire-referrals',
--   '0 2 * * *',   -- tous les jours à 2h
--   $$UPDATE referrals SET is_active = FALSE WHERE expires_at < NOW() AND is_active = TRUE$$
-- );
