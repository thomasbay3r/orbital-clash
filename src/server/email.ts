export async function sendPasswordResetEmail(
  env: { RESEND_API_KEY: string; APP_URL: string },
  email: string,
  resetToken: string,
): Promise<boolean> {
  const resetUrl = `${env.APP_URL}?reset=${resetToken}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Orbital Clash <noreply@orbital-clash.com>",
      to: [email],
      subject: "Passwort zuruecksetzen — Orbital Clash",
      html: `
        <h2>Passwort zuruecksetzen</h2>
        <p>Klicke auf den Link um dein Passwort zurueckzusetzen:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Der Link ist 1 Stunde gueltig.</p>
        <p>Falls du das nicht angefordert hast, ignoriere diese E-Mail.</p>
      `,
    }),
  });

  return res.ok;
}
