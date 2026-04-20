import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature') ?? '';

    // Skeleton: parse event type and acknowledge
    let event: { type?: string } = {};
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        // TODO: provision subscription
        break;
      case 'customer.subscription.deleted':
        // TODO: revoke access
        break;
      case 'invoice.payment_failed':
        // TODO: notify user
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
