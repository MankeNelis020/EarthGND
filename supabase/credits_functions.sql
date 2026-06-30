-- Atomic credit operations.
--
-- credits_left     = subscription remainder + credits_purchased (total spendable)
-- credits_purchased = loose / one-time purchases (never reset)
--
-- Subscription resets only refresh the subscription portion:
--   credits_left = plan_quota + credits_purchased
--
-- Deduction order: subscription pool first, then purchased.

-- ─── deduct_credit ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION deduct_credit(p_user_id uuid)
RETURNS TABLE(ok boolean, remaining integer, from_purchased boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer;
  v_purchased integer;
  v_sub_remaining integer;
  v_from_purchased boolean := false;
BEGIN
  SELECT credits_left, credits_purchased
  INTO v_left, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_left IS NULL OR v_left <= 0 THEN
    RETURN QUERY SELECT false::boolean, COALESCE(v_left, 0), false::boolean;
    RETURN;
  END IF;

  v_sub_remaining := v_left - v_purchased;

  IF v_sub_remaining > 0 THEN
    UPDATE profiles
    SET credits_left = credits_left - 1
    WHERE id = p_user_id;
  ELSE
    UPDATE profiles
    SET
      credits_left      = credits_left - 1,
      credits_purchased = credits_purchased - 1
    WHERE id = p_user_id;
    v_from_purchased := true;
  END IF;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'used', -1, 'Pendiepte berekening');

  RETURN QUERY SELECT true::boolean, (v_left - 1), v_from_purchased;
END;
$$;

-- ─── release_credit ───────────────────────────────────────────────────────────
-- Refund one credit to the same pool it was taken from.

CREATE OR REPLACE FUNCTION release_credit(
  p_user_id uuid,
  p_from_purchased boolean,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_from_purchased THEN
    UPDATE profiles
    SET
      credits_left      = credits_left + 1,
      credits_purchased = credits_purchased + 1
    WHERE id = p_user_id;
  ELSE
    UPDATE profiles
    SET credits_left = credits_left + 1
    WHERE id = p_user_id;
  END IF;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'purchase', 1, p_description);
END;
$$;

-- ─── add_credits ──────────────────────────────────────────────────────────────
-- Loose / one-time purchase — only increases the purchased pool.

CREATE OR REPLACE FUNCTION add_credits(p_user_id uuid, p_amount integer, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    credits_left      = credits_left + p_amount,
    credits_purchased = credits_purchased + p_amount
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'purchase', p_amount, p_description);
END;
$$;

-- ─── set_subscription_credits ─────────────────────────────────────────────────
-- Set the subscription portion to plan quota; preserve credits_purchased.
-- Used on activation, monthly renewal, and plan upgrades.

CREATE OR REPLACE FUNCTION set_subscription_credits(
  p_user_id uuid,
  p_credits integer,
  p_label text,
  p_next_reset timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    credits_left  = p_credits + credits_purchased,
    credits_reset = p_next_reset
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, description)
  VALUES (p_user_id, 'subscription_reset', p_credits, p_label);
END;
$$;

-- Backwards-compatible alias
CREATE OR REPLACE FUNCTION reset_monthly_credits(
  p_user_id uuid,
  p_credits integer,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_subscription_credits(
    p_user_id,
    p_credits,
    p_label,
    date_trunc('month', now()) + interval '1 month'
  );
END;
$$;
