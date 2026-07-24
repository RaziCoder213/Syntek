import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace 1: Line 5534
content = content.replace(
  'const transporter = getSmtpTransport(nodemailer.default, { email: sender.email, pass: sender.pass });',
  'const transporter = getSmtpTransport(nodemailer.default, sender);'
);

// Replace 2: Line 5931
content = content.replace(
  'const transporter = getSmtpTransport(nodemailer.default, { email: sender.email, pass: sender.pass });',
  'const transporter = getSmtpTransport(nodemailer.default, sender);'
);

// Replace 3: Line 7487
content = content.replace(
  'const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: decryptText(config.gmail_pass) });',
  'const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: decryptText(config.gmail_pass), smtp_host: config.smtp_host, smtp_port: config.smtp_port });'
);

// Replace 4: Line 2035
content = content.replace(
  'const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: config.gmail_pass });',
  'const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: config.gmail_pass, smtp_host: config.smtp_host, smtp_port: config.smtp_port });'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated server.js with complete SMTP host passing!');
