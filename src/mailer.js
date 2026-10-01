import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export async function sendScoutReport(industriesWithCandidates) {
  const recipient = process.env.NOTIFICATION_EMAIL;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const reviewUrl = `${baseUrl}/review`;

  if (!recipient || !smtpUser || smtpUser.includes('your_') || !smtpPass || smtpPass.includes('your_')) {
    console.log('\n======================================================');
    console.log('[MAILER] SMTP credentials not set in .env.');
    console.log(`[ACTION REQUIRED] Open your review dashboard to approve sites:`);
    console.log(`--> ${reviewUrl}`);
    console.log('======================================================\n');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const rowsHtml = industriesWithCandidates.map(ind => {
    const cHtml = ind.candidates.map(c => `
      <div style="margin-bottom: 8px;">
        <strong>#${c.rank}:</strong> <a href="${c.url}" target="_blank" style="color: #2563eb;">${c.url}</a>
        <span style="color: #64748b; font-size: 12px;">(Score: ${c.score}/10)</span>
      </div>
    `).join('');

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px; font-weight: bold; color: #1e293b;">${ind.name}</td>
        <td style="padding: 12px;">${cHtml || '<span style="color: #94a3b8;">No sites found</span>'}</td>
      </tr>
    `;
  }).join('');

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #334155; line-height: 1.6;">
      <div style="background: #0f172a; padding: 24px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Scout Agent: Discovered Websites Ready</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Award-grade candidate websites have been found and are ready for your review.</p>
      </div>

      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin: 20px 0 28px;">
          <a href="${reviewUrl}" style="background: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
            Open Review & Crawl Dashboard &rarr;
          </a>
        </div>

        <h3 style="color: #0f172a; margin-top: 24px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Discovered Candidates Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 10px 12px;">Industry</th>
              <th style="padding: 10px 12px;">Candidate Websites</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <p style="margin-top: 28px; font-size: 12px; color: #94a3b8; text-align: center;">
          You can approve, modify, or swap any candidate URL on the review dashboard before starting the deep crawl.
        </p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Autonomous Web Agent" <${smtpUser}>`,
      to: recipient,
      subject: `[Action Required] Scout Finished: Review Discovered Websites (${industriesWithCandidates.length} Industries)`,
      html: emailHtml
    });
    console.log(`[MAILER] Notification email sent successfully to ${recipient} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.warn(`[MAILER] Failed to send email: ${err.message}`);
    return false;
  }
}
