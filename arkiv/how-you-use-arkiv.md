# How we use Arkiv

| Entity | Written by | Filtered on | Expires | What users see |
|---|---|---|---|---|
| `approval_request` | The user's wallet | `pairId`, `kind`, `createdAt` | 24 h | The trustee's inbox, read with one query per person, and only rows that person wrote. Unanswered requests show "No answer in time". The payload is encrypted, so only the trustee can read the details. |
| `trustee_decision` | The per-pair trustee key | `pairId`, `requestKey`, `verdict` | 24 h, or 25 h for someone new | "Approved · unlocks tomorrow" or "Yashjoisar said no". For someone new, the decision also says when the payment unlocks. |
| `scam_report` | Our seed wallet (imported lists) or a trustee key (when they turn a payment down) | `address`, `source`, `category` | 180 days, and anyone can extend it | "This might be a scam", with the reason: "Linked to a hack", "Sanctioned by the US government" or "Reported by a trustee". The same reports power the trustee's address check. Reports from anyone else show up as "Unconfirmed report". |

Every feature we use shows up for users:

- **`$creator`** decides whether a report is verified or unconfirmed, and whether an Allow counts.
- **Expiry** drives the countdowns and the "Expired" chips.
- **The indexed `address`** is what turns into a scam warning.
- **Permissionless extension** keeps reports from disappearing after 6 months.
