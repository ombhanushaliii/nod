// The trustee invite email (D7), from the design in email/trustee-invite.html.
// Edit that file's design here too: the Edge Function can't read files
// outside supabase/functions.
//
// Every value put into the HTML is escaped. The inviter's name comes from the
// user's app, so it's treated as untrusted text.

const SITE = "https://getnod.pages.dev";
const LOGO = `${SITE}/assets/nod-logo.png`;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// "@omkar" style handles only: letters, digits, . _ -, at most 30.
export function cleanInviterName(name: string | undefined | null): string | null {
  const n = (name ?? "").trim().replace(/^@+/, "");
  return /^[A-Za-z0-9._-]{1,30}$/.test(n) ? `@${n}` : null;
}

export type InviteEmail = { subject: string; html: string; text: string };

export function trusteeInviteEmail(args: { inviteUrl: string; inviterName?: string | null; expiresDays: number }): InviteEmail {
  const name = cleanInviterName(args.inviterName);
  const who = escapeHtml(name ?? "your contact");
  const Who = escapeHtml(name ?? "Your contact");
  const initial = escapeHtml((name?.[1] ?? "N").toUpperCase());
  const url = escapeHtml(args.inviteUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${Who} wants you as their trustee on Nod</title>
<style>
@media (max-width:620px){.wrap{padding:16px 8px!important}.px{padding-left:22px!important;padding-right:22px!important}.h1{font-size:26px!important;line-height:32px!important;padding-top:28px!important}.bx{padding-left:22px!important;padding-right:22px!important}.bh{font-size:22px!important;line-height:28px!important}.bt{padding-top:28px!important}.card{border-radius:20px!important}}
a{color:#C14900}
</style>
</head>
<body style="margin:0;padding:0;background:#F7F6F2;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${Who} picked you to check risky payments before they go out. Here’s what that means.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F6F2" style="background:#F7F6F2;">
<tr><td align="center" class="wrap" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="padding:0 8px 20px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="40" style="width:40px;"><img src="${LOGO}" width="40" height="40" alt="Nod" style="display:block;width:40px;height:40px;border:0;border-radius:11px;"></td>
    <td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;color:#25282B;mso-line-height-rule:exactly;line-height:24px;">Nod</td>
  </tr></table>
</td></tr>
<tr><td class="card" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:24px;border:1px solid #ECE9E2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:40px 40px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" height="44" bgcolor="#EF6C22" style="width:44px;height:44px;border-radius:22px;background:#EF6C22;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:bold;color:#FFFFFF;" align="center">${initial}</td>
<td style="padding-left:12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#6e6e73;">Invite from <b style="color:#25282B;">${who}</b></td>
</tr></table></td></tr><tr><td class="px h1" style="padding:40px 40px 14px 40px;font-family:Helvetica,Arial,sans-serif;font-size:32px;font-weight:bold;color:#25282B;mso-line-height-rule:exactly;line-height:38px;letter-spacing:-0.5px;">${Who} wants you as their trustee</td></tr><tr><td class="px" style="padding:0 40px 16px 40px;font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#25282B;mso-line-height-rule:exactly;line-height:25px;">${Who} uses Nod, a wallet that asks someone they trust before a risky payment goes out. They picked you.</td></tr><tr><td class="px" style="padding:0 40px 24px 40px;font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#25282B;mso-line-height-rule:exactly;line-height:25px;">Most payments go through without you. You only hear from us when something looks off.</td></tr><tr><td class="px" style="padding:8px 40px 32px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#E55B00" style="background:#E55B00;border-radius:14px;mso-padding-alt:16px 28px;">
<a href="${url}" style="display:block;padding:16px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:14px;">Accept invite</a>
</td></tr></table></td></tr><tr><td class="px" style="padding:0 40px 10px 40px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1px;color:#6e6e73;">WHAT YOU’LL DO</td></tr><tr><td class="px" style="padding:0 40px 32px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F6F2" style="background:#F7F6F2;border-radius:18px;">
<tr><td style="padding:16px 18px;border-bottom:1px solid #ECE9E2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" valign="top" style="width:32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="#FFECDC" style="width:26px;height:26px;border-radius:13px;background:#FFECDC;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#C14900;">1</td></tr></table></td>
<td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;">
<div style="font-size:15px;font-weight:bold;color:#25282B;mso-line-height-rule:exactly;line-height:22px;">Get a request when a payment looks risky</div>
<div style="font-size:14px;color:#6e6e73;mso-line-height-rule:exactly;line-height:21px;">You’ll see who it’s to, how much, why it was flagged, and ${who}’s answers.</div>
</td></tr></table></td></tr><tr><td style="padding:16px 18px;border-bottom:1px solid #ECE9E2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" valign="top" style="width:32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="#FFECDC" style="width:26px;height:26px;border-radius:13px;background:#FFECDC;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#C14900;">2</td></tr></table></td>
<td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;">
<div style="font-size:15px;font-weight:bold;color:#25282B;mso-line-height-rule:exactly;line-height:22px;">Allow once, or deny & report</div>
<div style="font-size:14px;color:#6e6e73;mso-line-height-rule:exactly;line-height:21px;">Denying keeps the money and warns other Nod wallets about the address.</div>
</td></tr></table></td></tr><tr><td style="padding:16px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" valign="top" style="width:32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="#FFECDC" style="width:26px;height:26px;border-radius:13px;background:#FFECDC;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#C14900;">3</td></tr></table></td>
<td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;">
<div style="font-size:15px;font-weight:bold;color:#25282B;mso-line-height-rule:exactly;line-height:22px;">Set the rules</div>
<div style="font-size:14px;color:#6e6e73;mso-line-height-rule:exactly;line-height:21px;">Pick ${who}’s limit. ${Who} can see your changes, but only you can make them.</div>
</td></tr></table></td></tr>
</table></td></tr><tr><td class="px" style="padding:0 40px 40px 40px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6e6e73;mso-line-height-rule:exactly;line-height:21px;">Not sure about this? Check with ${who} first. If you don’t know them, you can ignore this email.</td></tr></table>
</td></tr>
<tr><td style="padding:16px 0 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E55B00" style="background:#E55B00;border-radius:24px;">
<tr><td align="center" class="bt" style="padding:40px 32px 12px 32px;"><img src="${LOGO}" width="56" height="56" alt="Nod" style="display:block;width:56px;height:56px;border:2px solid #F28A4A;border-radius:16px;"></td></tr>
<tr><td align="center" class="bx bh" style="padding:8px 32px 10px 32px;font-family:Helvetica,Arial,sans-serif;font-size:28px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:34px;letter-spacing:-0.5px;">Set it up with the person you’d call anyway.</td></tr>
<tr><td align="center" class="bx" style="padding:0 40px 40px 40px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#FFFFFF;mso-line-height-rule:exactly;line-height:23px;">Takes about two minutes. Get the app, sign in with Google, and accept ${who}’s invite.</td></tr>
</table></td></tr>
<tr><td class="px" style="padding:24px 8px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6e6e73;mso-line-height-rule:exactly;line-height:20px;">
You’re getting this because ${who} invited you as their trustee on Nod.<br>
<a href="${SITE}" style="color:#6e6e73;text-decoration:underline;">getnod.pages.dev</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const plainWho = name ?? "Someone you know";
  return {
    subject: name ? `${name} wants you as their trustee on Nod` : "Someone chose you as their trusted person on Nod",
    html,
    text: [
      `${plainWho} picked you to help keep their Nod wallet safe.`,
      "You'll be asked to approve risky payments before they go out.",
      `Accept here: ${args.inviteUrl}`,
      `This link expires in ${args.expiresDays} days.`,
    ].join("\n\n"),
  };
}
