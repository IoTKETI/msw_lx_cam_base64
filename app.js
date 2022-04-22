const concurrently = require('concurrently');

let success, failure = '';

const { result } = concurrently([
    'node captureImage.js ' + process.argv[3],
    'node geotagging.js',
    'node sendFTP.js ' + process.argv[2] + ' ' + process.argv[3],

], {
    prefix: 'name',
    killOthers: ['failure', 'success'],
    restartTries: 3
});
result.then(success, failure);
console.log('[app]', process.argv[3]);
