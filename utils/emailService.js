const nodemailer = require('nodemailer');

// Email configuration
// You can use Gmail, Outlook, or any SMTP service
const createTransporter = () => {
  // For Gmail, you'll need to use an "App Password" instead of your regular password
  // Go to: Google Account > Security > 2-Step Verification > App Passwords
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Your email address
      pass: process.env.EMAIL_PASSWORD // Your email password or app password
    }
  });
};

// Send welcome email
const sendWelcomeEmail = async (userEmail, userName, userPassword, creationDate) => {
  try {
    // If email credentials are not configured, skip sending
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return { success: false, message: 'Email not configured' };
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: 'Welcome to Rivals Nexus! - Your Account Details',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #0f0f16;
              color: #ffffff;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: linear-gradient(145deg, rgba(15,15,22,0.95), rgba(11,11,18,0.98));
              border: 1px solid rgba(255, 215, 0, 0.3);
              border-radius: 16px;
              padding: 40px;
            }
            .logo {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo-icon {
              width: 60px;
              height: 60px;
              background: linear-gradient(135deg, #ffd700, #ffeb3b);
              border-radius: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              font-weight: 800;
              color: #000000;
              margin-bottom: 10px;
            }
            h1 {
              color: #ffd700;
              text-align: center;
              margin-bottom: 20px;
            }
            .message {
              background: rgba(255, 255, 255, 0.05);
              border-left: 4px solid #ffd700;
              padding: 20px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .account-details {
              background: rgba(255, 215, 0, 0.1);
              border: 1px solid rgba(255, 215, 0, 0.3);
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
            }
            .account-details h3 {
              color: #ffd700;
              margin-top: 0;
            }
            .detail-row {
              margin: 10px 0;
              padding: 8px 0;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-label {
              color: rgba(255, 255, 255, 0.7);
              font-size: 14px;
              margin-bottom: 4px;
            }
            .detail-value {
              color: #ffffff;
              font-size: 16px;
              font-weight: 600;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: rgba(255, 255, 255, 0.6);
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">
              <div class="logo-icon">R</div>
              <h1>Rivals Nexus</h1>
            </div>
            <div class="message">
              <p>Hello ${userName || 'there'},</p>
              <p>Your account has been successfully created in Rivals Nexus! Welcome to the battlefield!</p>
            </div>
            <div class="account-details">
              <h3>Your Account Details</h3>
              <div class="detail-row">
                <div class="detail-label">Username/Nickname:</div>
                <div class="detail-value">${userName || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Password:</div>
                <div class="detail-value">${userPassword || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Account Created:</div>
                <div class="detail-value">${creationDate || new Date().toLocaleString()}</div>
              </div>
            </div>
            <div class="message">
              <p>Keep these details safe! You can use them to log in to your account.</p>
            </div>
            <div class="footer">
              <p>© 2025 Rivals Nexus. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${userName || 'there'},\n\nYour account has been successfully created in Rivals Nexus! Welcome to the battlefield!\n\nYour Account Details:\nUsername/Nickname: ${userName || 'N/A'}\nPassword: ${userPassword || 'N/A'}\nAccount Created: ${creationDate || new Date().toLocaleString()}\n\nKeep these details safe! You can use them to log in to your account.\n\n© 2025 Rivals Nexus. All rights reserved.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail
};

