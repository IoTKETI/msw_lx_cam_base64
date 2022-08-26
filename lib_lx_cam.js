/**
 * Created by Wonseok Jung in KETI on 2020-08-26.
 */
const concurrently = require('concurrently')

const {} = concurrently(
    [
        {command: "node captureImage.js", name: "Capture"},
        {command: "node geotagging.js", name: "Geotagging"},
        {command: "node sendImages.js", name: "SendImages", env: {drone_info:JSON.stringify(drone_info)}},
    ],
    {
        restartTries: 5
    }
)
