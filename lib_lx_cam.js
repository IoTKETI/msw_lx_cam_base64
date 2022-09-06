/**
 * Created by Wonseok Jung in KETI on 2020-08-26.
 */
const concurrently = require('concurrently')
let drone_info = JSON.parse('{"host":"gcs.iotocean.org","drone":"drone1","gcs":"KETI_MUV","type":"pixhawk","system_id":251,"update":"disable","mission":{"msw_kt_lte":{"container ":["LTE"],"sub_container":[],"git":"https://github.com/IoTKETI/msw_kt_lte.git"},"msw_lx_cam":{"container":["Capture_Status","Geotag_Status","Send_St atus","Captured_GPS"],"sub_container":["Capture"],"git":"https://github.com/IoTKETI/msw_lx_cam.git"}},"id":"JWS"}')
const {} = concurrently(
    [
        {command: "node captureImage.js", name: "Capture"},
        {command: "node geotagging.js", name: "Geotagging"},
        {command: "node sendImages.js", name: "SendImages", env: {drone_info: JSON.stringify(drone_info)}},
    ],
    {
        restartTries: 5
    }
)
