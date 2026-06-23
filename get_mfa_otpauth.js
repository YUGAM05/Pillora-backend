const OTPAuth = require('otpauth');

const secret = 'SIEX2DAIH7REENBYRJMHO6IOUBAX4S32';
const totp = new OTPAuth.TOTP({
    issuer: 'Pillora Admin',
    label: 'admin@pillora.in',
    secret: OTPAuth.Secret.fromBase32(secret)
});

const token = totp.generate();
console.log('CURRENT_MFA_CODE:', token);
