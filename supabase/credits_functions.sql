-- Atomic credit operations.
--
-- These functions replace the read-then-write pattern in lib/credits.ts that
-- was vulnerable to a race condition: two concurrent requests could both read
-- credits_left=1, both decrement to 0, and both succeed — allowing one free
-- calculation. The FOR UPDATE lock ensures only one can proceed at a time.
--
-- Run once via Supabase SQL editor or supabase db push.

-- ─── deduct_credit ────────────────────────────────────────────────────────────
-- Atomically decrement credits_left by 1 and insert an audit record.
-- Returns (ok=false, remaining=0) when credits are already exhausted.

CREATE OR REPLACE FUNCTION deduct_credit(p_user_id uuid)
RETURNS TABLE(ok boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
BEGIN
  -- Lock the row for the duration of this transaction.
  SELECT credits_left
  INTO v_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN QUERY SELECT false::boolean, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  UPDATE profiles
  SET credits_left = credits_left - 1
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'used', -1, 'Pendiepte berekening');

  RETURN QUERY SELECT true::boolean, (v_credits - 1);
END;
$$;

-- ─── add_credits ──────────────────────────────────────────────────────────────
-- Atomically add credits and insert an audit record in one transaction.
-- Uses credits_left = credits_left + p_amount (no separate read needed).

CREATE OR REPLACE FUNCTION add_credits(p_user_id uuid, p_amount integer, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET credits_left = credits_left + p_amount
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'purchase', p_amount, p_description);
END;
$$;

-- ─── reset_monthly_credits ───────────────────────────────────────────────────
-- Atomically reset credits to the plan's monthly allowance and insert audit record.

CREATE OR REPLACE FUNCTION reset_monthly_credits(p_user_id uuid, p_credits integer, p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_reset timestamptz;
BEGIN
  v_next_reset := date_trunc('month', now()) + interval '1 month';

  UPDATE profiles
  SET
    credits_left  = p_credits,
    credits_reset = v_next_reset
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'subscription_reset', p_credits, p_label);
END;
$$;
