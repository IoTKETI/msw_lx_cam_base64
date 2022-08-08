#!/usr/bin/sh

pm2 start captureImage.js -- $2
pm2 start geotagging.js
pm2 start sendImages.js -- $1 $2
