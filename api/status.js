export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const fingerprint = Buffer.from(`${ip}::${ua.substring(0, 80)}`).toString('base64').substring(0, 64);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tarot_users?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=free_used,is_paid,paid_plan,paid_until`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const users = await userRes.json();

    if (!users?.length) {
      return res.status(200).json({ free_used: 0, remaining: 3, is_paid: false });
    }

    const user = users[0];
    const expired = user.is_paid && user.paid_until && new Date(user.paid_until) < new Date();
    const isPaid = user.is_paid && !expired;
    const remaining = isPaid ? 999 : Math.max(0, 3 - user.free_used);

    return res.status(200).json({
      free_used: user.free_used,
      remaining,
      is_paid: isPaid,
      paid_plan: user.paid_plan,
    });
  } catch (e) {
    return res.status(200).json({ free_used: 0, remaining: 3, is_paid: false });
  }
}
