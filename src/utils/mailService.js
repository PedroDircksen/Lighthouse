const nodemailer = require('nodemailer')


var smtpConfig = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // use SSL
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
    }
};

const transporter = nodemailer.createTransport(smtpConfig);

module.exports = { transporter }