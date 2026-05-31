-- ============================================================
-- SpendLab — Schema completo
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
--
-- Hace todo de una vez:
--   1.  Limpia tablas y funciones existentes (orden FK inverso)
--   2.  Crea tablas con constraints
--   3.  Triggers de auth.users (perfil + invitaciones pendientes)
--   4.  Funciones RPC (crear grupo, invitaciones, passkeys helper)
--   5.  Habilita RLS en todas las tablas
--   6.  Helper is_group_member (evita recursión en policies)
--   7.  Políticas RLS completas
--   8.  Habilita Realtime en group_invitations
--   9.  Backfill: perfiles para usuarios pre-existentes
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. LIMPIAR TODO
--    Orden inverso a las foreign keys para evitar errores.
--    Los patches de desarrollo quedan obsoletos tras este script.
-- ════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS push_subscriptions    CASCADE;
DROP TABLE IF EXISTS passkey_credentials   CASCADE;
DROP TABLE IF EXISTS settlements           CASCADE;
DROP TABLE IF EXISTS expense_splits        CASCADE;
DROP TABLE IF EXISTS expenses              CASCADE;
DROP TABLE IF EXISTS group_invitations     CASCADE;
DROP TABLE IF EXISTS group_members         CASCADE;
DROP TABLE IF EXISTS groups                CASCADE;
DROP TABLE IF EXISTS profiles              CASCADE;

DROP FUNCTION IF EXISTS public.is_group_member(uuid)            CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()                CASCADE;
DROP FUNCTION IF EXISTS public.accept_pending_invitations()     CASCADE;
DROP FUNCTION IF EXISTS public.create_group_with_member(text)   CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_invitations()        CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created                     ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_accept_invitations  ON auth.users;


-- ════════════════════════════════════════════════════════════
-- 2. TABLAS
-- ════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Espejo público de auth.users.
-- Se crea automáticamente vía trigger on_auth_user_created.
-- FK en groups.created_by, expenses.paid_by, etc. apuntan aquí.
CREATE TABLE profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text        NOT NULL DEFAULT '',
  email        text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── groups ────────────────────────────────────────────────────────────────────
-- Cada grupo de gastos compartidos.
-- created_by es el dueño; solo él puede editar/borrar el grupo.
CREATE TABLE groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_by uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── group_members ─────────────────────────────────────────────────────────────
-- Relación N:M entre grupos y usuarios.
-- PK compuesta (group_id, user_id) evita duplicados.
CREATE TABLE group_members (
  group_id  uuid        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- ── group_invitations ─────────────────────────────────────────────────────────
-- Invitaciones por email. El invitado puede no tener cuenta aún.
-- expires_at: la app pone 7 días por defecto.
-- accepted_at: se rellena al unirse; NULL = pendiente.
-- token: UUID único para el magic link de aceptación (reservado para futuro).
CREATE TABLE group_invitations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  invited_email  text        NOT NULL,
  token          uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted_at    timestamptz,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── expenses ──────────────────────────────────────────────────────────────────
-- Gastos del grupo. amount en pesos enteros (CLP no tiene centavos).
-- paid_by: quién adelantó el dinero.
CREATE TABLE expenses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  paid_by      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       integer     NOT NULL CHECK (amount > 0),
  description  text        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  expense_date date        NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── expense_splits ────────────────────────────────────────────────────────────
-- Cómo se divide cada gasto entre los miembros.
-- La suma de splits debería igualar expense.amount (validado en la app).
CREATE TABLE expense_splits (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid    NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL CHECK (amount >= 0),
  UNIQUE (expense_id, user_id)
);

-- ── settlements ───────────────────────────────────────────────────────────────
-- Pagos de saldo entre miembros (liquidaciones).
-- paid_by → paid_to registra quién pagó a quién.
CREATE TABLE settlements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  paid_by    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  paid_to    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     integer     NOT NULL CHECK (amount > 0),
  settled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_by <> paid_to)
);

-- ── passkey_credentials ───────────────────────────────────────────────────────
-- Credenciales WebAuthn (passkeys) registradas por el usuario.
-- credential_id: identificador base64url único de la clave pública.
-- public_key:    clave pública COSE en base64url (nunca sale del servidor).
-- counter:       contador anti-replay; se incrementa en cada autenticación.
-- device_type:   'singleDevice' | 'multiDevice' (según la especificación).
-- backed_up:     si la passkey está sincronizada en la nube del dispositivo.
-- transports:    canales disponibles ('internal', 'usb', 'nfc', etc.).
CREATE TABLE passkey_credentials (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credential_id text        NOT NULL UNIQUE,
  public_key    text        NOT NULL,
  counter       bigint      NOT NULL DEFAULT 0,
  device_type   text        NOT NULL DEFAULT 'singleDevice',
  backed_up     boolean     NOT NULL DEFAULT false,
  transports    text[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- Suscripciones Web Push del navegador para notificaciones en segundo plano.
-- endpoint: URL del servicio push del navegador (única por dispositivo).
-- p256dh:   clave pública de cifrado del cliente.
-- auth:     secreto de autenticación del cliente.
-- El webhook de Supabase llama a /api/push/send al insertar una invitación.
CREATE TABLE push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════
-- 3. TRIGGER: crear perfil automáticamente al registrarse
-- ════════════════════════════════════════════════════════════
-- Sin este trigger, crear un grupo falla porque created_by
-- necesita existir en profiles primero.
--
-- Maneja:
--   - Email OAuth (viene en raw_user_meta_data en vez de NEW.email)
--   - display_name desde Google/GitHub/Apple o parte local del email
--   - EXCEPTION WHEN OTHERS: el trigger nunca bloquea el registro del usuario

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   text;
  v_display text;
BEGIN
  v_email := COALESCE(
    NEW.email,
    NEW.raw_user_meta_data->>'email',
    ''
  );

  v_display := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'),    ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'),         ''),
    NULLIF(split_part(v_email, '@', 1),                  ''),
    'Usuario'
  );

  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, v_display, v_email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ════════════════════════════════════════════════════════════
-- 4. TRIGGER: aceptar invitaciones pendientes al registrarse
-- ════════════════════════════════════════════════════════════
-- Si alguien fue invitado por email antes de tener cuenta,
-- al registrarse queda unido automáticamente a esos grupos.
--
-- Flujo: INSERT en auth.users → trigger busca invitaciones por email
--   → inserta en group_members → marca accepted_at.
-- EXCEPTION WHEN OTHERS: el trigger nunca bloquea el registro.

CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id)
  SELECT gi.group_id, NEW.id
  FROM   public.group_invitations gi
  WHERE  gi.invited_email = NEW.email
    AND  gi.accepted_at  IS NULL
    AND  gi.expires_at   > now()
  ON CONFLICT (group_id, user_id) DO NOTHING;

  UPDATE public.group_invitations
  SET    accepted_at = now()
  WHERE  invited_email = NEW.email
    AND  accepted_at   IS NULL
    AND  expires_at    > now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'accept_pending_invitations error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_accept_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.accept_pending_invitations();


-- ════════════════════════════════════════════════════════════
-- 5. RPC: crear grupo de forma atómica
-- ════════════════════════════════════════════════════════════
-- El patrón INSERT + .select() de Supabase activa RETURNING,
-- que aplica las políticas SELECT antes de que el creador
-- figure en group_members → error 42501 de RLS.
-- Esta función SECURITY DEFINER inserta grupo + miembro
-- en una sola transacción y devuelve el resultado.

CREATE OR REPLACE FUNCTION public.create_group_with_member(group_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_group   groups;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO groups (name, created_by)
  VALUES (group_name, v_user_id)
  RETURNING * INTO v_group;

  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group.id, v_user_id);

  RETURN row_to_json(v_group);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_with_member(text) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 6. RPC: invitaciones pendientes del usuario actual
-- ════════════════════════════════════════════════════════════
-- Devuelve las invitaciones pendientes enriquecidas con nombre
-- del grupo, número de miembros e invitador.
--
-- SECURITY DEFINER: el usuario invitado aún no es miembro,
-- por lo que RLS bloquearía la lectura de groups/group_members.
-- La función corre con permisos del dueño y evita ese problema.

CREATE OR REPLACE FUNCTION public.get_pending_invitations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
  result    json;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_user_id;

  SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC) INTO result
  FROM (
    SELECT DISTINCT ON (gi.group_id)
      gi.id,
      gi.group_id,
      g.name         AS group_name,
      (SELECT COUNT(*)::int
         FROM group_members gm
        WHERE gm.group_id = gi.group_id) AS member_count,
      p.display_name AS inviter_name,
      gi.expires_at,
      gi.created_at
    FROM  group_invitations gi
    JOIN  groups   g ON g.id = gi.group_id
    JOIN  profiles p ON p.id = gi.invited_by
    WHERE gi.invited_email = v_email
      AND gi.accepted_at  IS NULL
      AND gi.expires_at   > now()
    ORDER BY gi.group_id, gi.created_at DESC
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_invitations() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 7. HABILITAR RLS EN TODAS LAS TABLAS
-- ════════════════════════════════════════════════════════════
-- Row Level Security asegura que cada usuario solo vea
-- y modifique los datos que le pertenecen o a los que
-- tiene acceso explícito mediante las políticas de abajo.

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- 8. HELPER: is_group_member
-- ════════════════════════════════════════════════════════════
-- Comprueba si el usuario actual pertenece a un grupo dado.
-- SECURITY DEFINER rompe la recursión que ocurre cuando una
-- política de group_members consulta group_members desde sí misma.
-- STABLE le permite a Postgres cachear el resultado por query.

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE  group_members.group_id = p_group_id
      AND  group_members.user_id  = auth.uid()
  );
$$;


-- ════════════════════════════════════════════════════════════
-- 9. POLÍTICAS RLS
-- ════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Todos los usuarios autenticados pueden leer perfiles ajenos
-- (necesario para mostrar nombres en gastos e invitaciones).
CREATE POLICY "profiles: authenticated can read all"
  ON profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles: delete own"
  ON profiles FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- ── groups ────────────────────────────────────────────────────────────────────
-- Solo los miembros del grupo pueden verlo (uses is_group_member helper).
CREATE POLICY "groups: members can read"
  ON groups FOR SELECT TO authenticated
  USING (is_group_member(id));

CREATE POLICY "groups: authenticated can create"
  ON groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "groups: creator can update"
  ON groups FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "groups: creator can delete"
  ON groups FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- ── group_members ─────────────────────────────────────────────────────────────
CREATE POLICY "group_members: members can read"
  ON group_members FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- El creador puede agregar miembros; cada usuario puede agregarse a sí mismo
-- (al aceptar una invitación o al crear un grupo).
CREATE POLICY "group_members: insert self or as creator"
  ON group_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT created_by FROM groups WHERE id = group_id)
  );

CREATE POLICY "group_members: remove self"
  ON group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── group_invitations ─────────────────────────────────────────────────────────
-- Miembros del grupo ven todas las invitaciones de ese grupo.
CREATE POLICY "invitations: members can read"
  ON group_invitations FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- El usuario invitado (aún no miembro) puede leer su propia invitación.
-- Necesario para aceptar/rechazar antes de unirse, y para la pantalla
-- de Grupos que usa Realtime para detectar nuevas invitaciones.
CREATE POLICY "invitations: invited user can read own"
  ON group_invitations FOR SELECT TO authenticated
  USING (invited_email = auth.email());

-- Solo miembros del grupo pueden enviar invitaciones.
CREATE POLICY "invitations: members can create"
  ON group_invitations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = invited_by
    AND is_group_member(group_id)
  );

-- Cualquier usuario autenticado puede actualizar una invitación
-- (necesario para el flujo accept/reject: el invitado marca accepted_at).
CREATE POLICY "invitations: anyone can accept"
  ON group_invitations FOR UPDATE TO authenticated
  USING (true);

-- El invitado puede borrar su propia invitación pendiente (rechazar).
CREATE POLICY "invitations: invited user can delete own"
  ON group_invitations FOR DELETE TO authenticated
  USING (invited_email = auth.email() AND accepted_at IS NULL);

-- ── expenses ──────────────────────────────────────────────────────────────────
CREATE POLICY "expenses: members can read"
  ON expenses FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Cualquier miembro puede registrar un gasto (incluso a nombre de otro).
CREATE POLICY "expenses: members can create"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id));

-- Solo quien pagó puede editar o borrar el gasto.
CREATE POLICY "expenses: payer can update"
  ON expenses FOR UPDATE TO authenticated
  USING (auth.uid() = paid_by);

CREATE POLICY "expenses: payer can delete"
  ON expenses FOR DELETE TO authenticated
  USING (auth.uid() = paid_by);

-- ── expense_splits ────────────────────────────────────────────────────────────
CREATE POLICY "splits: group members can read"
  ON expense_splits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits: group members can insert"
  ON expense_splits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  is_group_member(e.group_id)
    )
  );

-- Solo el que pagó el gasto puede borrar sus splits.
CREATE POLICY "splits: payer can delete"
  ON expense_splits FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE  e.id = expense_id
        AND  e.paid_by = auth.uid()
    )
  );

-- ── settlements ───────────────────────────────────────────────────────────────
CREATE POLICY "settlements: members can read"
  ON settlements FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Solo quien paga puede registrar la liquidación.
CREATE POLICY "settlements: members can record"
  ON settlements FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = paid_by
    AND is_group_member(group_id)
  );

-- ── passkey_credentials ───────────────────────────────────────────────────────
-- Cada usuario gestiona solo sus propias passkeys.
-- La lectura también la hace el servidor vía admin client (bypass RLS),
-- por lo que estas políticas son solo para las operaciones del cliente.
CREATE POLICY "passkeys: user can read own"
  ON passkey_credentials FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "passkeys: user can insert own"
  ON passkey_credentials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "passkeys: user can delete own"
  ON passkey_credentials FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- Cada usuario gestiona solo sus propias suscripciones push.
-- El envío de notificaciones se hace desde el servidor con admin client.
CREATE POLICY "push: user can manage own"
  ON push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 10. REALTIME: invitaciones en tiempo real
-- ════════════════════════════════════════════════════════════
-- Permite que el cliente (Supabase Realtime channel) reciba
-- eventos INSERT de group_invitations filtrados por su email.
-- La pantalla de Grupos se actualiza automáticamente sin polling.
--
-- NOTA: también habilitar en Dashboard →
--       Database → Replication → Tables → group_invitations ✓

ALTER PUBLICATION supabase_realtime ADD TABLE group_invitations;


-- ════════════════════════════════════════════════════════════
-- 11. BACKFILL: perfiles para usuarios pre-existentes
-- ════════════════════════════════════════════════════════════
-- El trigger on_auth_user_created solo dispara para registros
-- NUEVOS. Los usuarios creados antes de este script no tendrían
-- fila en profiles → falla la FK groups.created_by.
-- Este INSERT idempotente los crea sin sobreescribir los existentes.

INSERT INTO public.profiles (id, display_name, email)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'),    ''),
    NULLIF(split_part(u.email, '@', 1),                 ''),
    'Usuario'
  ),
  COALESCE(u.email, '')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);


-- ════════════════════════════════════════════════════════════
-- FIN DEL SCHEMA
-- ────────────────────────────────────────────────────────────
-- Tablas (9):
--   profiles, groups, group_members, group_invitations,
--   expenses, expense_splits, settlements,
--   passkey_credentials, push_subscriptions
--
-- Triggers en auth.users (2):
--   on_auth_user_created              → handle_new_user()
--   on_auth_user_created_accept_invitations → accept_pending_invitations()
--
-- Funciones RPC (3):
--   create_group_with_member(text)    SECURITY DEFINER
--   get_pending_invitations()         SECURITY DEFINER
--   is_group_member(uuid)             SECURITY DEFINER · STABLE
--
-- RLS: activo en las 9 tablas con políticas completas
-- Realtime: habilitado en group_invitations
-- ════════════════════════════════════════════════════════════
