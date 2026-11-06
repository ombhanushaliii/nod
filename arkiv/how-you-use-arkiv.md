# How Nod uses Arkiv

Nod keeps three kinds of entities on Arkiv. Each one is filtered on what the app actually looks up, written by the only person who should be able to write it, and set to expire when it stops being useful.

| Entity | Written by | Filtered on | Expires | What users see |
|---|---|---|---|---|
| `approval_request` | The user's wallet | `pairId`, `kind`, `createdAt` | 24 hours | The trustee's inbox. The app runs one query per person and only reads rows that person wrote. If nobody answers in time, the user sees "No answer in time". The payload is encrypted, so only the trustee can read the details. |
| `trustee_decision` | The per-pair trustee key | `pairId`, `requestKey`, `verdict` | 24 hours, or 25 hours for someone new | "Approved · unlocks tomorrow" or "Yashjoisar said no". For someone new, the decision carries the time the payment unlocks, 24 hours after the trustee says yes. |
| `scam_report` | Our seed wallet (imported lists) or a trustee key (when they turn a payment down) | `address`, `source`, `category` | 180 days, and anyone can extend it | "This might be a scam", with the reason: "Linked to a hack", "Sanctioned by the US government" or "Reported by a trustee". The same reports power the trustee's address check. Reports from anyone else show up as "Unconfirmed report". |

## Every feature we use shows up for users

- **`$creator`** decides whether a report counts as verified or unconfirmed, and whether an Allow counts at all.
- **Expiry** drives the waiting times and the "Expired" labels.
- **The indexed `address`** is what turns into a scam warning before a payment.
- **Permissionless extension** keeps reports from disappearing after six months.
