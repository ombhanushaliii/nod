# What users would lose on Postgres

- **Proof the trustee really said yes.** Every "Allow" is written by the trustee's own per-pair key, and the backend only accepts it if `$creator` matches. On Postgres, our backend could fake an approval, and users would have to trust us not to.
- **Things expire by themselves.**
  - A request the trustee never answers is gone after 24 hours.
  - A decision lasts 24 hours, or 25 hours for someone new, which is just long enough for the backend to read it before their 24 hour wait ends.
  - Old approvals can't be replayed, and there's no cleanup job to run.
- **Scam reports anyone can use.**
  - About 780 reports are live: 334 hacks, 309 phishing, 128 sanctioned, and 9 written by Nod trustees when they turned down a flagged payment.
  - Any wallet or app can query them without our API, and they keep working even if Nod disappears.
  - On Postgres they'd just be our private blocklist.
