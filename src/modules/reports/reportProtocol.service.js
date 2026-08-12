const { randomBytes, } = require('node:crypto');

function generateReportProtocol(){
    const year = new Date().getUTCFullYear();

    const randomPart = randomBytes(8).toString('hex').toUpperCase();

    const groups = randomPart.match(/.{1,4}/g);

    return ['NVK', year, ...groups].join('-');
}

module.exports = {generateReportProtocol};