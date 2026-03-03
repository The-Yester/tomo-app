const fs = require('fs');
const jwt = require('jsonwebtoken');

// Apple Music Developer credentials
const teamId = 'G5HX6UQ657';
const keyId = '9DH9BU5AAC';

// Key file format:
const privateKey = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgQmDucYWF09KTkT7F
+w8eJf6HiyauZ+yYOJkOS+zLPJ+gCgYIKoZIzj0DAQehRANCAATwKxbqUWI3rVRv
8mK09PuZ0zfFDl6a3xlJJolqeyHTksC7EgKSiEWTUCT9Lpc2hmsZdP27dI2VOdbJ
IldiedGs
-----END PRIVATE KEY-----`;

function generateDeveloperToken() {
    try {
        const token = jwt.sign({}, privateKey, {
            algorithm: 'ES256',
            expiresIn: '180d', // Apple allows up to 6 months
            issuer: teamId,
            header: {
                alg: 'ES256',
                kid: keyId
            }
        });

        console.log('\n--- Apple Music Developer Token ---\n');
        console.log(token);
        console.log('\n-----------------------------------\n');
        fs.writeFileSync('token.txt', token);
        return token;
    } catch (error) {
        console.error('Error generating Apple Music token:', error);
    }
}

generateDeveloperToken();

// Note: To run this script, you will need to install the 'jsonwebtoken' package:
// npm install jsonwebtoken
