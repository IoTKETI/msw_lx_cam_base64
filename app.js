const concurrently = require('concurrently');

let drone_info = 'gcs.iotocean.org';
let success, failure = '';

const { result } = concurrently([
    'node captureImage.js',
    'node geotagging.js',
    'node sendFTP.js ' + drone_info,

], {
    prefix: 'name',
    killOthers: ['failure', 'success'],
    restartTries: 3
});
result.then(success, failure);
