# Nod email templates

HTML emails in Nod's style. Each file is a complete email: table layout, inline styles and an
Outlook (`mso`) fallback. Open one in a browser to preview it.

| File | Sent to | When |
| --- | --- | --- |
| `welcome.html` | A new user | After they create a Nod wallet. Asks them to invite a trustee. |
| `trustee-invite.html` | The person being invited | When a user invites them as their trustee. |
| `trustee-welcome.html` | The new trustee | After they accept the invite. |

## Before sending

The templates are filled in with sample content. Replace it when you send them:

- **Names:** `Alex` / `@alex` is the user and `Sam` is the trustee. The avatar initials (`A`, `S`) and the
  `$100` starting limit in `trustee-welcome.html` are sample values too.
- **Logo:** `assets/nod-logo.png` is a relative path, which works for local previews only. Email clients
  need an absolute URL, so host the logo and point every `<img>` at it.
- **Links:** the `https://nod.app/...` links (accept, invite, trustee rules, help, email settings) are
  placeholders.
- **Footer address:** `100 Example Street, San Francisco` is a placeholder. Use a real mailing address.
