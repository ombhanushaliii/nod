# Why Arkiv

If we swapped Arkiv for Postgres, our users would lose three things.

## Proof that the trustee really said yes

Every "Allow" is written by the trustee's own per-pair key, and our backend only accepts it if `$creator` matches that key. With Postgres, our backend could fake an approval, and users would just have to trust that we never would.

## Things expire on their own

- A request the trustee never answers is gone after 24 hours.
- A decision lasts 24 hours, or 25 hours for someone new, which is just long enough for the backend to read it before their 24 hour wait ends.
- Each Allow works once, for one exact recipient and amount, so old approvals can't be replayed. And we don't need a cleanup job.

## Scam reports anyone can use

- About 780 verified reports are live: 334 hacks, 309 phishing wallets, 128 sanctioned addresses, and 9 written by Nod trustees when they turned down a flagged payment.
- Any wallet or app can query them without going through our API, and they keep working even if Nod goes away.
- In Postgres, they'd just be our private blocklist.
